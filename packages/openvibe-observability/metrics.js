'use strict';

const client = require('prom-client');

function sanitizeFragment(value) {
    return String(value || 'service')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        || 'service';
}

function metricPrefixForService(serviceName) {
    return `openvibe_${sanitizeFragment(serviceName)}_`;
}

function normalizeRouteLabel(req) {
    const raw = req.openvibeMetricLabel
        || (req.route && req.route.path ? `${req.baseUrl || ''}${req.route.path}` : null)
        || req.baseUrl
        || req.path
        || req.url
        || '/unmatched';

    return String(raw)
        .split('?')[0]
        .replace(/[0-9a-f]{8,}/ig, ':id')
        .replace(/\/\d+(?=\/|$)/g, '/:id')
        || '/';
}

function createServiceMetrics(options) {
    const opts = options || {};
    const serviceName = String(opts.serviceName || 'openvibe-service');
    const prefix = metricPrefixForService(serviceName);
    const registry = new client.Registry();

    registry.setDefaultLabels(Object.assign({ service: serviceName }, opts.defaultLabels || {}));
    if (opts.collectDefaultMetrics !== false) {
        client.collectDefaultMetrics({ register: registry, prefix });
    }

    const httpRequestsTotal = new client.Counter({
        name: `${prefix}http_requests_total`,
        help: 'Total number of HTTP requests handled by the service.',
        labelNames: ['method', 'route', 'status_code'],
        registers: [registry],
    });

    const httpRequestDurationSeconds = new client.Histogram({
        name: `${prefix}http_request_duration_seconds`,
        help: 'Duration of HTTP requests handled by the service.',
        labelNames: ['method', 'route', 'status_code'],
        buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
        registers: [registry],
    });

    const readyGauge = new client.Gauge({
        name: `${prefix}ready`,
        help: 'Binary readiness signal for the service (1=ready, 0=not-ready).',
        registers: [registry],
    });

    const readinessCheckGauge = new client.Gauge({
        name: `${prefix}readiness_check_status`,
        help: 'Readiness check status by check name (-1=red, 0=yellow, 1=green).',
        labelNames: ['check', 'critical'],
        registers: [registry],
    });

    const runtimeInfoGauge = new client.Gauge({
        name: `${prefix}runtime_info`,
        help: 'Static runtime info about the service process.',
        labelNames: ['service', 'node_env'],
        registers: [registry],
    });

    runtimeInfoGauge.set({
        service: serviceName,
        node_env: process.env.NODE_ENV || 'development',
    }, 1);

    return {
        client,
        extras: new Map(),
        registry,
        prefix,
        serviceName,
        httpRequestsTotal,
        httpRequestDurationSeconds,
        readyGauge,
        readinessCheckGauge,
        runtimeInfoGauge,
    };
}

function getOrCreateMetric(metrics, kind, key, factory) {
    if (!metrics || !metrics.registry || !metrics.prefix) throw new Error('metrics bundle is required');
    if (!metrics.extras) metrics.extras = new Map();
    const cacheKey = `${kind}:${key}`;
    if (!metrics.extras.has(cacheKey)) {
        metrics.extras.set(cacheKey, factory());
    }
    return metrics.extras.get(cacheKey);
}

function observeDbQuery(metrics, fields) {
    const metric = getOrCreateMetric(metrics, 'histogram', 'db_query_duration_seconds', () => new client.Histogram({
        name: `${metrics.prefix}db_query_duration_seconds`,
        help: 'Duration of database queries.',
        labelNames: ['operation', 'status'],
        buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
        registers: [metrics.registry],
    }));
    const values = fields || {};
    metric.observe({
        operation: String(values.operation || 'query'),
        status: String(values.status || 'ok'),
    }, Number(values.durationMs || 0) / 1000);
}

function setDbPoolState(metrics, fields) {
    const metric = getOrCreateMetric(metrics, 'gauge', 'db_pool_connections', () => new client.Gauge({
        name: `${metrics.prefix}db_pool_connections`,
        help: 'Database pool connection counts by state.',
        labelNames: ['role', 'state'],
        registers: [metrics.registry],
    }));
    const values = fields || {};
    const role = String(values.role || 'primary');
    metric.set({ role, state: 'total' }, Number(values.total || 0));
    metric.set({ role, state: 'idle' }, Number(values.idle || 0));
    metric.set({ role, state: 'waiting' }, Number(values.waiting || 0));
}

function observeRedisCommand(metrics, fields) {
    const metric = getOrCreateMetric(metrics, 'histogram', 'redis_command_duration_seconds', () => new client.Histogram({
        name: `${metrics.prefix}redis_command_duration_seconds`,
        help: 'Duration of Redis commands.',
        labelNames: ['command', 'status'],
        buckets: [0.0005, 0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
        registers: [metrics.registry],
    }));
    const values = fields || {};
    metric.observe({
        command: String(values.command || 'unknown'),
        status: String(values.status || 'ok'),
    }, Number(values.durationMs || 0) / 1000);
}

function setRedisStreamLag(metrics, fields) {
    const metric = getOrCreateMetric(metrics, 'gauge', 'redis_stream_lag', () => new client.Gauge({
        name: `${metrics.prefix}redis_stream_lag`,
        help: 'Observed lag for Redis stream consumer groups.',
        labelNames: ['stream', 'group'],
        registers: [metrics.registry],
    }));
    const values = fields || {};
    metric.set({
        stream: String(values.stream || 'unknown'),
        group: String(values.group || 'default'),
    }, Number(values.lag || 0));
}

function countWorkerJob(metrics, fields) {
    const counter = getOrCreateMetric(metrics, 'counter', 'worker_jobs_total', () => new client.Counter({
        name: `${metrics.prefix}worker_jobs_total`,
        help: 'Count of worker jobs by queue, job name, and status.',
        labelNames: ['queue', 'job', 'status'],
        registers: [metrics.registry],
    }));
    const values = fields || {};
    counter.inc({
        queue: String(values.queue || 'default'),
        job: String(values.job || 'unknown'),
        status: String(values.status || 'completed'),
    }, Number(values.count || 1));
}

function observeWorkerJobDuration(metrics, fields) {
    const histogram = getOrCreateMetric(metrics, 'histogram', 'worker_job_duration_seconds', () => new client.Histogram({
        name: `${metrics.prefix}worker_job_duration_seconds`,
        help: 'Duration of worker jobs.',
        labelNames: ['queue', 'job', 'status'],
        buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60],
        registers: [metrics.registry],
    }));
    const values = fields || {};
    histogram.observe({
        queue: String(values.queue || 'default'),
        job: String(values.job || 'unknown'),
        status: String(values.status || 'completed'),
    }, Number(values.durationMs || 0) / 1000);
}

function setSocketConnections(metrics, fields) {
    const gauge = getOrCreateMetric(metrics, 'gauge', 'socket_connections', () => new client.Gauge({
        name: `${metrics.prefix}socket_connections`,
        help: 'Current Socket.IO/WebSocket connections by namespace.',
        labelNames: ['namespace'],
        registers: [metrics.registry],
    }));
    const values = fields || {};
    gauge.set({ namespace: String(values.namespace || '/') }, Number(values.count || 0));
}

function countSocketEvent(metrics, fields) {
    const counter = getOrCreateMetric(metrics, 'counter', 'socket_events_total', () => new client.Counter({
        name: `${metrics.prefix}socket_events_total`,
        help: 'Count of realtime socket events by namespace, event, and direction.',
        labelNames: ['namespace', 'event', 'direction'],
        registers: [metrics.registry],
    }));
    const values = fields || {};
    counter.inc({
        namespace: String(values.namespace || '/'),
        event: String(values.event || 'message'),
        direction: String(values.direction || 'outbound'),
    }, Number(values.count || 1));
}

function createHttpMetricsMiddleware(metrics) {
    if (!metrics || !metrics.httpRequestsTotal || !metrics.httpRequestDurationSeconds) {
        throw new Error('metrics bundle is required');
    }

    return function httpMetricsMiddleware(req, res, next) {
        const started = process.hrtime.bigint();
        res.on('finish', () => {
            const labels = {
                method: req.method,
                route: normalizeRouteLabel(req),
                status_code: String(res.statusCode),
            };
            const durationSeconds = Number(process.hrtime.bigint() - started) / 1e9;
            metrics.httpRequestsTotal.inc(labels);
            metrics.httpRequestDurationSeconds.observe(labels, durationSeconds);
        });
        next();
    };
}

function updateReadinessMetrics(metrics, report) {
    if (!metrics || !report) return report;

    metrics.readyGauge.set(report.ok ? 1 : 0);
    metrics.readinessCheckGauge.reset();

    for (const check of report.checks || []) {
        const value = check.status === 'green'
            ? 1
            : check.status === 'yellow'
                ? 0
                : -1;
        metrics.readinessCheckGauge.set({
            check: String(check.name || 'unnamed'),
            critical: check.critical === false ? 'false' : 'true',
        }, value);
    }
    return report;
}

async function renderMetrics(metrics) {
    if (!metrics || !metrics.registry) throw new Error('metrics registry is required');
    return metrics.registry.metrics();
}

module.exports = {
    countSocketEvent,
    countWorkerJob,
    client,
    createHttpMetricsMiddleware,
    createServiceMetrics,
    observeDbQuery,
    observeRedisCommand,
    observeWorkerJobDuration,
    metricPrefixForService,
    normalizeRouteLabel,
    renderMetrics,
    setDbPoolState,
    setRedisStreamLag,
    setSocketConnections,
    updateReadinessMetrics,
};
