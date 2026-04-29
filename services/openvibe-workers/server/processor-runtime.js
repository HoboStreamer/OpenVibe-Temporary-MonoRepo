'use strict';

const {
    addJob,
    createQueue,
    createWorker,
    getQueueStats,
} = require('@openvibe/queue');
const { clearPresence, createRedisClient, heartbeatPresence } = require('@openvibe/redis');

const { createProcessors } = require('./processors');

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
    };

    let heartbeatTimer = null;

    function allowedQueue(queueName) {
        return !queueFilter || queueFilter.has(queueName);
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
                    const result = await handler(job);
                    state.last_job_at = new Date().toISOString();
                    return result;
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
        const jobs = typeof registry.listJobs === 'function' ? registry.listJobs() : [];
        return jobs.filter((job) => allowedQueue(job.queue)).map((job) => Object.assign({}, job, {
            processor_enabled: !!processors[job.name],
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
        return {
            started: state.started,
            queue_filter: queueFilter ? Array.from(queueFilter.values()).sort() : [],
            queue_count: queueBundles.size || groupJobsByQueue().size,
            worker_count: workerBundles.size,
            heartbeat: Object.assign({}, state.heartbeat),
            last_job_at: state.last_job_at,
            last_error: state.last_error,
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