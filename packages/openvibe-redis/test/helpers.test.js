'use strict';

const assert = require('assert');

const {
    buildPresenceKey,
    buildRateLimitKey,
    healthCheck,
    normalizeRedisConfig,
    tokenBucketRateLimit,
} = require('..');

(function normalizesRedisConfigFromOptions() {
    const config = normalizeRedisConfig({ url: 'redis://127.0.0.1:6379', name: 'runtime-test', prefix: 'ov' });
    assert.strictEqual(config.url, 'redis://127.0.0.1:6379');
    assert.strictEqual(config.name, 'runtime-test');
    assert.strictEqual(config.prefix, 'ov');
})();

(function buildsDeterministicKeys() {
    assert.strictEqual(buildPresenceKey('chat', 'user-1'), 'ov:presence:chat:user-1');
    assert.strictEqual(buildRateLimitKey('chat', 'user-1'), 'ov:ratelimit:chat:user-1');
})();

(async function tokenBucketRateLimitTracksRemainingTokens() {
    const store = new Map();
    const expiries = new Map();
    const client = {
        isOpen: true,
        async connect() {},
        async get(key) {
            return store.has(key) ? store.get(key) : null;
        },
        async set(key, value, options) {
            store.set(key, value);
            if (options && options.PX) expiries.set(key, options.PX);
            return 'OK';
        },
        async ping() {
            return 'PONG';
        },
    };

    const first = await tokenBucketRateLimit(client, 'ov:ratelimit:test:user-1', {
        capacity: 5,
        refillPerSecond: 1,
        cost: 2,
    });
    assert.strictEqual(first.allowed, true);
    assert.strictEqual(first.remaining, 3);
    assert.ok(expiries.get('ov:ratelimit:test:user-1') >= 1000);

    const second = await tokenBucketRateLimit(client, 'ov:ratelimit:test:user-1', {
        capacity: 5,
        refillPerSecond: 1,
        cost: 4,
        nowMs: Date.now(),
    });
    assert.strictEqual(second.allowed, false);
})();

(async function healthCheckUsesPing() {
    const result = await healthCheck({
        isOpen: true,
        async connect() {},
        async ping() { return 'PONG'; },
        async get() { return null; },
    });
    assert.strictEqual(result.ok, true);
})();

console.log('openvibe-redis helpers: OK');