'use strict';

const {
    buildPresenceKey,
    clearPresence,
    createRedisClient,
    tokenBucketRateLimit,
    ttlPresence,
} = require('@openvibe/redis');

function buildSocketPresenceKey(namespace, socketId) {
    return buildPresenceKey(`socket:${String(namespace || '/').replace(/^\//, '') || 'root'}`, socketId);
}

function createPresenceBridge(options) {
    const opts = options || {};
    const redisClient = opts.redisClient || (opts.redisUrl ? createRedisClient({
        url: opts.redisUrl,
        name: opts.name || 'openvibe-realtime',
        prefix: opts.prefix || 'ov',
    }) : null);
    const ttlSeconds = Number(opts.ttlSeconds || 60);

    return {
        client: redisClient,
        async heartbeat(input) {
            if (!redisClient) return { ok: true, skipped: true, reason: 'redis_disabled' };
            const source = input || {};
            return ttlPresence(redisClient, {
                key: buildSocketPresenceKey(source.namespace, source.socketId),
                value: {
                    actor: source.actor || null,
                    rooms: Array.isArray(source.rooms) ? source.rooms : [],
                    connected_at: source.connectedAt || new Date().toISOString(),
                },
                ttlSeconds,
            });
        },
        async clear(input) {
            if (!redisClient) return { ok: true, skipped: true, reason: 'redis_disabled' };
            const source = input || {};
            return clearPresence(redisClient, {
                namespace: `socket:${String(source.namespace || '/').replace(/^\//, '') || 'root'}`,
                id: source.socketId,
            });
        },
        async consumeRateLimit(input) {
            if (!redisClient) return { allowed: true, skipped: true, reason: 'redis_disabled' };
            const source = input || {};
            return tokenBucketRateLimit(redisClient, {
                key: `ov:ratelimit:socket:${source.scope || 'default'}:${source.id || 'anonymous'}`,
                rules: source.rules || [{ capacity: 20, refillPerSecond: 5, cost: 1 }],
            });
        },
    };
}

module.exports = {
    buildSocketPresenceKey,
    createPresenceBridge,
};