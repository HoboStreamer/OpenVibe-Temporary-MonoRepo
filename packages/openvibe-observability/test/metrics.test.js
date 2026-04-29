'use strict';

const assert = require('assert');
const EventEmitter = require('events');

const {
    countSocketEvent,
    countWorkerJob,
    createHttpMetricsMiddleware,
    createServiceMetrics,
    observeDbQuery,
    observeRedisCommand,
    updateReadinessMetrics,
} = require('..');

(async function metricsExposeReadinessAndHttpLabels() {
    const metrics = createServiceMetrics({ serviceName: 'openvibe-observability-test', collectDefaultMetrics: false });
    const middleware = createHttpMetricsMiddleware(metrics);

    const req = {
        method: 'GET',
        url: '/api/v1/users/123',
        originalUrl: '/api/v1/users/123',
        path: '/api/v1/users/123',
        baseUrl: '/api/v1',
        route: { path: '/users/:id' },
    };
    const res = new EventEmitter();
    res.statusCode = 200;

    middleware(req, res, () => {});
    res.emit('finish');

    updateReadinessMetrics(metrics, {
        ok: true,
        checks: [
            { name: 'persistence', status: 'green', critical: true },
            { name: 'redis', status: 'yellow', critical: false },
        ],
    });

    const text = await metrics.registry.metrics();
    assert.ok(text.includes('openvibe_openvibe_observability_test_http_requests_total'), 'http counter exported');
    assert.ok(text.includes('route="/api/v1/users/:id"'), 'route labels normalize parameter paths');
    assert.ok(text.includes('openvibe_openvibe_observability_test_ready'), 'ready gauge exported');
    assert.ok(text.includes('check="redis"'), 'readiness check labels exported');

    observeDbQuery(metrics, { operation: 'select', durationMs: 12, status: 'ok' });
    observeRedisCommand(metrics, { command: 'xadd', durationMs: 3, status: 'ok' });
    countWorkerJob(metrics, { queue: 'media', job: 'thumbnail', status: 'completed' });
    countSocketEvent(metrics, { namespace: '/chat', event: 'message', direction: 'inbound' });

    const enriched = await metrics.registry.metrics();
    assert.ok(enriched.includes('openvibe_openvibe_observability_test_db_query_duration_seconds'), 'db histogram exported');
    assert.ok(enriched.includes('openvibe_openvibe_observability_test_redis_command_duration_seconds'), 'redis histogram exported');
    assert.ok(enriched.includes('openvibe_openvibe_observability_test_worker_jobs_total'), 'worker counter exported');
    assert.ok(enriched.includes('openvibe_openvibe_observability_test_socket_events_total'), 'socket counter exported');
})();

console.log('openvibe-observability metrics: OK');
