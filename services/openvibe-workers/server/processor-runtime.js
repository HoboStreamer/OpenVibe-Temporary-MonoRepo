'use strict';

const {
    addJob,
    createQueue,
    createWorker,
    getQueueStats,
} = require('@openvibe/queue');
const { clearPresence, createRedisClient, heartbeatPresence } = require('@openvibe/redis');

const { createProcessorCatalog, createProcessors, describeProcessorCatalog } = require('./processors');

function normalizeQueueFilter(filter) {
    if (!Array.isArray(filter) || !filter.length) return null;
    const aliases = new Map([
        ['media', 'media-processing'],
        ['ai', 'ai-analysis'],
        ['clips', 'clips'],
        ['analytics', 'analytics'],
        ['lifecycle', 'lifecycle'],
        ['search', 'search'],
        ['billing', 'billing'],
        ['migration', 'migration'],
        ['notifications', 'notifications'],
    ]);
    return new Set(filter.map((value) => aliases.get(String(value).trim()) || String(value).trim()));
}

function createWorkerHost(options) {
    const opts = options || {};
    const config = opts.config || {};
    const registry = opts.registry;
    const processorCatalog = createProcessorCatalog(config);
    const processors = createProcessors(config);
    const queueFilter = normalizeQueueFilter(config.queueFilter || []);
    const queueBundles = new Map();
    const workerBundles = new Map();
    const heartbeatClient = opts.heartbeatClient || (config.redisUrl ? createRedisClient({
        url: config.redisUrl,
        name: `${config.serviceId}-heartbeat`,
        prefix: config.queuePrefix,
    }) : null);
    const state = {
        started: false,
        heartbeat: {
            enabled: !!heartbeatClient,
            id: config.workerInstanceId || config.serviceId || 'openvibe-workers',
            last_heartbeat_at: null,
            error: null,
        },
        last_job_at: null,
        last_error: null,
        processors: {},
    };

    let heartbeatTimer = null;

    function allowedQueue(queueName) {
        return !queueFilter || queueFilter.has(queueName);
    }

    function ensureProcessorState(job) {
        const descriptor = describeProcessorCatalog(config)[job.name] || processorCatalog[job.name] || null;
        if (!state.processors[job.name]) {
            state.processors[job.name] = {
                name: job.name,
                queue: job.queue,
                critical: !!job.critical,
                description: job.description || null,
                last_result_at: null,
                last_duration_ms: null,
                last_status: descriptor && !descriptor.available ? 'unavailable' : 'idle',
                last_error: null,
            };
        }
        return state.processors[job.name];
    }

    function groupJobsByQueue() {
        const jobs = typeof registry.listJobs === 'function' ? registry.listJobs() : [];
        return jobs.reduce((map, job) => {
            if (!allowedQueue(job.queue)) return map;
            if (!map.has(job.queue)) map.set(job.queue, []);
            map.get(job.queue).push(job);
            return map;
        }, new Map());
    }

    async function emitHeartbeat() {
        if (!heartbeatClient) return null;
        try {
            await heartbeatPresence(heartbeatClient, {
                namespace: 'worker',
                id: state.heartbeat.id,
                ttlSeconds: config.heartbeatTtlSeconds,
                payload: {
                    service_id: config.serviceId,
                    instance_id: state.heartbeat.id,
                    started: state.started,
                    queue_filter: queueFilter ? Array.from(queueFilter.values()).sort() : [],
                    queue_names: Array.from(groupJobsByQueue().keys()),
                    last_job_at: state.last_job_at,
                    last_error: state.last_error,
                },
            });
            state.heartbeat.last_heartbeat_at = new Date().toISOString();
            state.heartbeat.error = null;
        } catch (error) {
            state.heartbeat.error = {
                message: error && error.message || String(error),
                at: new Date().toISOString(),
            };
        }
        return state.heartbeat;
    }

    function startHeartbeatLoop() {
        if (!heartbeatClient || heartbeatTimer) return;
        void emitHeartbeat();
        heartbeatTimer = setInterval(() => {
            void emitHeartbeat();
        }, Math.max(1000, Number(config.heartbeatIntervalMs || 10000)));
        if (typeof heartbeatTimer.unref === 'function') heartbeatTimer.unref();
    }

    function buildQueueBundle(queueName) {
        if (!queueBundles.has(queueName)) {
            queueBundles.set(queueName, createQueue({
                queueName,
                redisUrl: config.redisUrl,
                prefix: config.queuePrefix,
                defaultJobOptions: {
                    attempts: 4,
                    removeOnComplete: 50,
                    removeOnFail: 100,
                    backoff: { type: 'exponential', delay: 1000 },
                },
            }));
        }
        return queueBundles.get(queueName);
    }

    async function start() {
        state.started = false;
        startHeartbeatLoop();
        for (const job of typeof registry.listJobs === 'function' ? registry.listJobs() : []) {
            ensureProcessorState(job);
        }
        if (!config.enableProcessors || !config.redisUrl) {
            state.started = true;
            return summary();
        }

        const grouped = groupJobsByQueue();
        for (const [queueName] of grouped.entries()) {
            const workerBundle = createWorker({
                queueName,
                redisUrl: config.redisUrl,
                prefix: config.queuePrefix,
                concurrency: config.concurrency,
                processor: async (job) => {
                    const handler = processors[job.name];
                    if (!handler) throw new Error(`No processor registered for ${job.name}`);
                    const processorState = ensureProcessorState(job);
                    const startedAt = Date.now();
                    try {
                        const result = await handler(job);
                        if (result && result.ok === false) {
                            const error = new Error(result.error || result.reason || `processor ${job.name} returned an error`);
                            error.result = result;
                            throw error;
                        }
                        processorState.last_result_at = new Date().toISOString();
                        processorState.last_duration_ms = Date.now() - startedAt;
                        processorState.last_status = result && result.skipped ? 'skipped' : 'ok';
                        processorState.last_error = null;
                        state.last_job_at = processorState.last_result_at;
                        return result;
                    } catch (error) {
                        processorState.last_result_at = new Date().toISOString();
                        processorState.last_duration_ms = Date.now() - startedAt;
                        processorState.last_status = 'failed';
                        processorState.last_error = {
                            message: error && error.message || String(error),
                            at: processorState.last_result_at,
                            result: error && error.result || null,
                            dependency: error && error.dependency || null,
                        };
                        throw error;
                    }
                },
            });
            if (workerBundle.worker) {
                workerBundle.worker.on('failed', (job, error) => {
                    state.last_error = {
                        job_id: job && job.id || null,
                        job_name: job && job.name || null,
                        message: error && error.message || String(error),
                        at: new Date().toISOString(),
                    };
                });
                workerBundles.set(queueName, workerBundle);
            }
        }
        state.started = true;
        await emitHeartbeat();
        return summary();
    }

    async function stop() {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        heartbeatTimer = null;
        const closers = [];
        for (const bundle of workerBundles.values()) {
            if (bundle.worker && typeof bundle.worker.close === 'function') closers.push(bundle.worker.close());
        }
        for (const bundle of queueBundles.values()) {
            if (bundle.events && typeof bundle.events.close === 'function') closers.push(bundle.events.close());
            if (bundle.queue && typeof bundle.queue.close === 'function') closers.push(bundle.queue.close());
        }
        if (heartbeatClient) {
            closers.push(clearPresence(heartbeatClient, { namespace: 'worker', id: state.heartbeat.id }).catch(() => {}));
            if (heartbeatClient.isOpen) closers.push(heartbeatClient.quit());
        }
        await Promise.allSettled(closers);
        workerBundles.clear();
        queueBundles.clear();
        state.started = false;
    }

    function listJobs() {
        const descriptors = describeProcessorCatalog(config);
        const jobs = typeof registry.listJobs === 'function' ? registry.listJobs() : [];
        return jobs.filter((job) => allowedQueue(job.queue)).map((job) => Object.assign({}, job, {
            processor_enabled: !!processors[job.name],
            processor_available: !!(descriptors[job.name] && descriptors[job.name].available),
            processor_dependency: descriptors[job.name] && descriptors[job.name].dependency || null,
            processor_backend: descriptors[job.name] && descriptors[job.name].backend || null,
            processor_configured_backend_mode: descriptors[job.name] && descriptors[job.name].configured_backend_mode || null,
        }));
    }

    async function listQueues() {
        const grouped = groupJobsByQueue();
        const items = [];
        for (const [queueName, jobs] of grouped.entries()) {
            const bundle = buildQueueBundle(queueName);
            const stats = await getQueueStats(bundle);
            items.push(Object.assign({}, stats, {
                queue_name: queueName,
                jobs: jobs.map((job) => job.name),
                enabled: bundle.enabled,
                worker_running: workerBundles.has(queueName),
            }));
        }
        return items;
    }

    async function enqueue(jobName, data, jobOptions) {
        const job = typeof registry.getJob === 'function' ? registry.getJob(jobName) : null;
        if (!job) {
            return { queued: false, reason: 'unknown_job', job_name: jobName };
        }
        const bundle = buildQueueBundle(job.queue);
        return addJob(bundle, job.name, data || {}, jobOptions || {});
    }

    function summary() {
        const descriptors = describeProcessorCatalog(config);
        const processorItems = (typeof registry.listJobs === 'function' ? registry.listJobs() : [])
            .filter((job) => allowedQueue(job.queue))
            .map((job) => {
                const entry = ensureProcessorState(job);
                const descriptor = descriptors[job.name] || null;
                return Object.assign({}, entry, {
                    available: !!(descriptor && descriptor.available),
                    dependency: descriptor && descriptor.dependency || null,
                    backend: descriptor && descriptor.backend || null,
                    configured_backend_mode: descriptor && descriptor.configured_backend_mode || null,
                });
            });
        const processorSummary = processorItems.reduce((summary, item) => {
            summary.total += 1;
            if (item.available) summary.available += 1;
            else {
                summary.unavailable += 1;
                if (item.critical) summary.critical_unavailable += 1;
                else summary.optional_unavailable += 1;
            }
            if (item.last_status === 'failed') summary.failed += 1;
            else if (item.last_status === 'ok') summary.ok += 1;
            else if (item.last_status === 'skipped') summary.skipped += 1;
            return summary;
        }, {
            total: 0,
            available: 0,
            unavailable: 0,
            critical_unavailable: 0,
            optional_unavailable: 0,
            ok: 0,
            failed: 0,
            skipped: 0,
        });
        return {
            started: state.started,
            queue_filter: queueFilter ? Array.from(queueFilter.values()).sort() : [],
            queue_count: queueBundles.size || groupJobsByQueue().size,
            worker_count: workerBundles.size,
            heartbeat: Object.assign({}, state.heartbeat),
            last_job_at: state.last_job_at,
            last_error: state.last_error,
            processors: processorItems,
            processor_summary: processorSummary,
        };
    }

    return {
        enqueue,
        listJobs,
        listQueues,
        start,
        stop,
        summary,
    };
}

module.exports = {
    createWorkerHost,
};