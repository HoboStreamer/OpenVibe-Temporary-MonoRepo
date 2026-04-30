'use strict';

const assert = require('assert');

const registry = require('../server/registry');
const { buildWorkerHealth, buildWorkerReadiness } = require('../server/runtime');

(function registryReturnsJobsAndQueues() {
    assert.ok(registry.listJobs().length >= 3);
    assert.ok(registry.listQueues().includes('media-processing'));
    assert.ok(registry.getJob('ai.transcript'));
})();

(function readinessReflectsRedisConfiguration() {
    const withoutRedis = buildWorkerReadiness({ redisUrl: '', enableProcessors: false });
    assert.strictEqual(withoutRedis.checks[0].status, 'red');
    assert.strictEqual(withoutRedis.checks[4].status, 'yellow');
    assert.strictEqual(withoutRedis.checks[5].status, 'yellow');

    const withRedis = buildWorkerReadiness({ redisUrl: 'redis://127.0.0.1:6379', enableProcessors: true }, {
        summary() {
            return {
                started: true,
                heartbeat: {
                    enabled: true,
                    id: 'openvibe-workers-test',
                    last_heartbeat_at: new Date().toISOString(),
                    error: null,
                },
                processors: [
                    {
                        name: 'clips.materialize',
                        critical: true,
                        available: true,
                        dependency: { status: 'configured' },
                        last_status: 'ok',
                    },
                    {
                        name: 'migration.bundle-verify',
                        critical: true,
                        available: false,
                        dependency: { status: 'missing-artifact' },
                        last_status: 'unavailable',
                    },
                ],
                processor_summary: {
                    total: 2,
                    available: 1,
                    unavailable: 1,
                    critical_unavailable: 1,
                    optional_unavailable: 0,
                },
            };
        },
    });
    assert.strictEqual(withRedis.checks[0].status, 'green');
    assert.strictEqual(withRedis.checks[2].status, 'green');
    assert.strictEqual(withRedis.checks[4].status, 'green');
    assert.strictEqual(withRedis.checks[5].status, 'red');

    const health = buildWorkerHealth({ redisUrl: 'redis://127.0.0.1:6379', enableProcessors: false });
    assert.strictEqual(health.redis_configured, true);
    assert.strictEqual(health.heartbeat.enabled, true);
})();

(function readinessStaysYellowWhenOnlyOptionalProcessorsAreUnavailable() {
    const readiness = buildWorkerReadiness({ redisUrl: 'redis://127.0.0.1:6379', enableProcessors: true }, {
        summary() {
            return {
                started: true,
                heartbeat: {
                    enabled: true,
                    id: 'openvibe-workers-test',
                    last_heartbeat_at: new Date().toISOString(),
                    error: null,
                },
                processors: [
                    {
                        name: 'notifications.broadcast',
                        critical: false,
                        available: false,
                        dependency: { status: 'missing-config' },
                        last_status: 'unavailable',
                    },
                ],
                processor_summary: {
                    total: 1,
                    available: 0,
                    unavailable: 1,
                    critical_unavailable: 0,
                    optional_unavailable: 1,
                },
            };
        },
    });
    assert.strictEqual(readiness.checks[5].status, 'yellow');
})();

console.log('openvibe-workers: OK');