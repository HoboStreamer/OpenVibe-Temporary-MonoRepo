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
            };
        },
    });
    assert.strictEqual(withRedis.checks[0].status, 'green');
    assert.strictEqual(withRedis.checks[2].status, 'green');
    assert.strictEqual(withRedis.checks[4].status, 'green');

    const health = buildWorkerHealth({ redisUrl: 'redis://127.0.0.1:6379', enableProcessors: false });
    assert.strictEqual(health.redis_configured, true);
    assert.strictEqual(health.heartbeat.enabled, true);
})();

console.log('openvibe-workers: OK');