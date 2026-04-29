'use strict';

const { summarizeWorkerRegistry } = require('@openvibe/queue');
const registry = require('./registry');

function buildWorkerHealth(config, workerHost) {
    const jobs = registry.listJobs();
    const summary = workerHost && typeof workerHost.summary === 'function' ? workerHost.summary() : null;
    return {
        redis_configured: !!config.redisUrl,
        processors_enabled: !!config.enableProcessors,
        registry: summarizeWorkerRegistry(jobs),
        heartbeat: summary && summary.heartbeat || {
            enabled: !!config.redisUrl,
            id: config.workerInstanceId || config.serviceId || 'openvibe-workers',
            last_heartbeat_at: null,
            error: null,
        },
        runtime: summary,
    };
}

function buildWorkerReadiness(config, workerHost) {
    const summary = workerHost && typeof workerHost.summary === 'function' ? workerHost.summary() : null;
    return {
        checks: [
            {
                name: 'redis_url_configured',
                status: config.redisUrl ? 'green' : 'red',
                ok: !!config.redisUrl,
                critical: true,
                details: { configured: !!config.redisUrl },
                message: config.redisUrl ? null : 'OPENVIBE_REDIS_URL must be configured for distributed workers.',
            },
            {
                name: 'job_registry_populated',
                status: registry.listJobs().length > 0 ? 'green' : 'red',
                ok: registry.listJobs().length > 0,
                critical: true,
                details: { job_count: registry.listJobs().length },
            },
            {
                name: 'processors_enabled',
                status: config.enableProcessors ? 'green' : 'yellow',
                ok: !!config.enableProcessors,
                critical: false,
                details: { enabled: !!config.enableProcessors },
                message: config.enableProcessors ? null : 'Worker service is currently running in registry-only mode.',
            },
            {
                name: 'worker_runtime_started',
                status: !config.enableProcessors ? 'yellow' : (summary && summary.started ? 'green' : 'red'),
                ok: !!(summary && summary.started),
                critical: !!config.enableProcessors,
                details: summary || { started: false },
                message: !config.enableProcessors ? 'Worker runtime intentionally disabled.' : null,
            },
            {
                name: 'worker_heartbeat',
                status: !config.redisUrl
                    ? 'yellow'
                    : (summary && summary.heartbeat && summary.heartbeat.last_heartbeat_at && !summary.heartbeat.error ? 'green' : 'red'),
                ok: !!(summary && summary.heartbeat && summary.heartbeat.last_heartbeat_at && !summary.heartbeat.error),
                critical: !!config.redisUrl,
                details: summary && summary.heartbeat || {
                    enabled: !!config.redisUrl,
                    id: config.workerInstanceId || config.serviceId || 'openvibe-workers',
                    last_heartbeat_at: null,
                    error: null,
                },
                message: !config.redisUrl
                    ? 'Worker heartbeat is disabled until OPENVIBE_REDIS_URL is configured.'
                    : summary && summary.heartbeat && summary.heartbeat.error
                        ? summary.heartbeat.error.message
                        : null,
            },
        ],
        extra: {
            queues: registry.listQueues(),
            heartbeat: summary && summary.heartbeat || null,
        },
    };
}

module.exports = {
    buildWorkerHealth,
    buildWorkerReadiness,
};
