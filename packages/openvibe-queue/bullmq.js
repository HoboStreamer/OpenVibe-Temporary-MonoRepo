'use strict';

const { Queue, QueueEvents, Worker } = require('bullmq');

function buildConnection(options) {
    const url = options && options.redisUrl ? String(options.redisUrl) : '';
    return url ? { url } : null;
}

function normalizeQueueOptions(queueNameOrOptions, options) {
    if (typeof queueNameOrOptions === 'string') {
        return Object.assign({}, options || {}, { queueName: queueNameOrOptions });
    }
    return Object.assign({}, queueNameOrOptions || {});
}

function createQueue(queueNameOrOptions, options) {
    const opts = normalizeQueueOptions(queueNameOrOptions, options);
    const connection = buildConnection(opts);
    if (!connection) {
        return {
            enabled: false,
            queueName: opts.queueName || 'default',
            prefix: opts.prefix || 'openvibe',
            queue: null,
            events: null,
        };
    }

    const queueName = opts.queueName || 'default';
    const prefix = opts.prefix || 'openvibe';
    return {
        enabled: true,
        queueName,
        prefix,
        queue: new Queue(queueName, {
            connection,
            prefix,
            defaultJobOptions: opts.defaultJobOptions || {},
        }),
        events: new QueueEvents(queueName, { connection, prefix }),
    };
}

function createQueueBundle(options) {
    return createQueue(options || {});
}

async function addJob(queueOrBundle, jobName, data, options) {
    const target = queueOrBundle && queueOrBundle.queue ? queueOrBundle.queue : queueOrBundle;
    const queueName = queueOrBundle && queueOrBundle.queueName ? queueOrBundle.queueName : target && target.name;
    if (!target || typeof target.add !== 'function') {
        return { queued: false, reason: 'queue_disabled', job_name: jobName };
    }

    const job = await target.add(jobName, data || {}, options || {});
    return {
        queued: true,
        id: job.id,
        job_name: job.name,
        queue_name: queueName || null,
    };
}

async function enqueueJob(bundle, jobName, data, options) {
    return addJob(bundle, jobName, data, options);
}

function createWorker(queueNameOrOptions, processor, options) {
    const opts = normalizeQueueOptions(queueNameOrOptions, options);
    if (typeof processor === 'function') {
        opts.processor = processor;
    }
    const connection = buildConnection(opts);
    if (!connection) {
        return { enabled: false, worker: null, queueName: opts.queueName || 'default' };
    }

    return {
        enabled: true,
        queueName: opts.queueName || 'default',
        worker: new Worker(opts.queueName || 'default', opts.processor || (async (job) => job.data), {
            connection,
            prefix: opts.prefix || 'openvibe',
            concurrency: opts.concurrency || 1,
            autorun: opts.autorun !== false,
        }),
    };
}

function createQueueWorker(options) {
    return createWorker(options || {});
}

async function getQueueStats(queueOrBundle) {
    const queue = queueOrBundle && queueOrBundle.queue ? queueOrBundle.queue : queueOrBundle;
    if (!queue) {
        return {
            enabled: false,
            waiting: 0,
            active: 0,
            delayed: 0,
            completed: 0,
            failed: 0,
        };
    }

    const [waiting, active, delayed, completed, failed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getDelayedCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
    ]);

    return {
        enabled: true,
        queue_name: queue.name,
        waiting,
        active,
        delayed,
        completed,
        failed,
    };
}

async function pauseQueue(queueOrBundle) {
    const queue = queueOrBundle && queueOrBundle.queue ? queueOrBundle.queue : queueOrBundle;
    if (!queue || typeof queue.pause !== 'function') return { paused: false, reason: 'queue_disabled' };
    await queue.pause();
    return { paused: true, queue_name: queue.name };
}

async function resumeQueue(queueOrBundle) {
    const queue = queueOrBundle && queueOrBundle.queue ? queueOrBundle.queue : queueOrBundle;
    if (!queue || typeof queue.resume !== 'function') return { resumed: false, reason: 'queue_disabled' };
    await queue.resume();
    return { resumed: true, queue_name: queue.name };
}

module.exports = {
    addJob,
    createQueue,
    createQueueBundle,
    createWorker,
    createQueueWorker,
    enqueueJob,
    getQueueStats,
    pauseQueue,
    resumeQueue,
};
