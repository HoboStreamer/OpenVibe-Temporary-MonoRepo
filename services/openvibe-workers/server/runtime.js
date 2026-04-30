'use strict';

const { summarizeWorkerRegistry } = require('@openvibe/queue');
const registry = require('./registry');

function buildProcessorDependencyCheck(config, summary) {
    const processorSummary = summary && summary.processor_summary || null;
    if (!summary || !summary.processors) {
        return {
            name: 'processor_dependencies',
            status: config.enableProcessors ? 'red' : 'yellow',
            ok: !config.enableProcessors,
            critical: !!config.enableProcessors,
            details: { total: 0, available: 0, unavailable: 0, critical_unavailable: 0 },
            message: config.enableProcessors ? 'Processor runtime has not produced a processor summary yet.' : 'Processor runtime intentionally disabled.',
        };
    }
    const criticalUnavailable = Number(processorSummary && processorSummary.critical_unavailable || 0);
    const unavailable = Number(processorSummary && processorSummary.unavailable || 0);
    return {
        name: 'processor_dependencies',
        status: !config.enableProcessors
            ? 'yellow'
            : criticalUnavailable > 0
                ? 'red'
                : unavailable > 0
                    ? 'yellow'
                    : 'green',
        ok: !config.enableProcessors || criticalUnavailable === 0,
        critical: !!config.enableProcessors,
        details: {
            summary: processorSummary,
            items: summary.processors,
        },
        message: !config.enableProcessors
            ? 'Worker runtime intentionally disabled.'
            : criticalUnavailable > 0
                ? 'One or more critical worker processors are unavailable.'
                : unavailable > 0
                    ? 'Optional worker processors are unavailable.'
                    : null,
    };
}

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
        processors: summary && summary.processors || [],
        processor_summary: summary && summary.processor_summary || null,
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
            buildProcessorDependencyCheck(config, summary),
        ],
        extra: {
            queues: registry.listQueues(),
            heartbeat: summary && summary.heartbeat || null,
            processors: summary && summary.processors || [],
        },
    };
}

module.exports = {
    buildWorkerHealth,
    buildWorkerReadiness,
};
