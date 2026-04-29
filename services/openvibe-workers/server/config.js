'use strict';

require('dotenv').config();

function readArg(flag) {
    const index = process.argv.indexOf(flag);
    if (index === -1) return null;
    return process.argv[index + 1] || null;
}

function parseQueueFilter(value) {
    if (!value) return [];
    return String(value)
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}

module.exports = {
    port: parseInt(process.env.PORT, 10) || 5300,
    host: process.env.HOST || '0.0.0.0',
    serviceId: 'openvibe-workers',
    workerInstanceId: process.env.OPENVIBE_WORKER_INSTANCE_ID || `openvibe-workers-${process.pid}`,
    internalKey: process.env.INTERNAL_API_KEY || 'change-me-in-production',
    redisUrl: process.env.OPENVIBE_REDIS_URL || '',
    queuePrefix: process.env.OPENVIBE_QUEUE_PREFIX || 'openvibe',
    heartbeatIntervalMs: parseInt(process.env.OPENVIBE_WORKER_HEARTBEAT_INTERVAL_MS, 10) || 10000,
    heartbeatTtlSeconds: parseInt(process.env.OPENVIBE_WORKER_HEARTBEAT_TTL_SECONDS, 10) || 30,
    concurrency: parseInt(readArg('--concurrency') || process.env.OPENVIBE_WORKER_CONCURRENCY, 10) || 2,
    enableProcessors: String(process.env.OPENVIBE_WORKER_ENABLE_PROCESSORS || 'false').toLowerCase() === 'true',
    queueFilter: parseQueueFilter(readArg('--worker') || process.env.OPENVIBE_WORKER_QUEUES || ''),
    mediaUrl: process.env.OPENVIBE_MEDIA_URL || 'http://127.0.0.1:4500',
    aiUrl: process.env.OPENVIBE_AI_URL || 'http://127.0.0.1:5100',
    pythonBin: process.env.OPENVIBE_WORKER_PYTHON_BIN || 'python3',
};
