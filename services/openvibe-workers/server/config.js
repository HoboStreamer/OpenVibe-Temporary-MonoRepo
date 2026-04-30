'use strict';

require('dotenv').config();

const path = require('path');

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

function trimUrl(value) {
    return String(value || '').trim().replace(/\/$/, '');
}

function normalizeBackendMode(value) {
    const normalized = String(value || 'auto').trim().toLowerCase();
    if (normalized === 'http' || normalized === 'native' || normalized === 'auto') {
        return normalized;
    }
    return 'auto';
}

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

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
    workerBackendMode: normalizeBackendMode(process.env.OPENVIBE_WORKER_BACKEND_MODE || 'auto'),
    enableProcessors: String(process.env.OPENVIBE_WORKER_ENABLE_PROCESSORS || 'false').toLowerCase() === 'true',
    queueFilter: parseQueueFilter(readArg('--worker') || process.env.OPENVIBE_WORKER_QUEUES || ''),
    eventsUrl: trimUrl(process.env.OPENVIBE_EVENTS_URL || 'http://127.0.0.1:4400'),
    mediaUrl: trimUrl(process.env.OPENVIBE_MEDIA_INTERNAL_URL || process.env.OPENVIBE_MEDIA_URL || 'http://127.0.0.1:4500'),
    aiUrl: trimUrl(process.env.OPENVIBE_AI_INTERNAL_URL || process.env.OPENVIBE_AI_URL || 'http://127.0.0.1:5100'),
    billingUrl: trimUrl(process.env.OPENVIBE_BILLING_INTERNAL_URL || process.env.OPENVIBE_BILLING_URL || 'http://127.0.0.1:5000'),
    contentUrl: trimUrl(process.env.OPENVIBE_CONTENT_INTERNAL_URL || process.env.OPENVIBE_CONTENT_URL || 'http://127.0.0.1:5500'),
    networkUrl: trimUrl(process.env.OPENVIBE_NETWORK_INTERNAL_URL || process.env.OPENVIBE_NETWORK_URL || 'http://127.0.0.1:4100'),
    requestTimeoutMs: parseInt(process.env.OPENVIBE_WORKER_REQUEST_TIMEOUT_MS, 10) || 15000,
    migrationBundleDir: path.resolve(process.env.OPENVIBE_MIGRATION_BUNDLE_DIR || path.join(REPO_ROOT, 'data', 'migrations', 'hobo-production-staging', 'openvibe-target')),
    migrationCutoverReportPath: path.resolve(process.env.OPENVIBE_MIGRATION_CUTOVER_REPORT || path.join(REPO_ROOT, 'data', 'migrations', 'cutover-report.json')),
    pythonBin: process.env.OPENVIBE_WORKER_PYTHON_BIN || 'python3',
};
