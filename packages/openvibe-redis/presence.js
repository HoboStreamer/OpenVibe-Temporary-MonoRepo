'use strict';

const { ensureRedisConnected, resolveRedisClient } = require('./client');

function buildPresenceKey(namespace, id) {
    return `ov:presence:${String(namespace || 'default')}:${String(id || 'unknown')}`;
}

async function ttlPresence(bundleOrClient, keyOrOptions, value, ttlSeconds) {
    const client = resolveRedisClient(bundleOrClient);
    if (!client) throw new Error('Redis bundle or client is not enabled');
    const opts = typeof keyOrOptions === 'object' && keyOrOptions !== null
        ? keyOrOptions
        : { key: keyOrOptions, value, ttlSeconds };
    const key = String(opts.key || buildPresenceKey(opts.namespace, opts.id));
    const payload = JSON.stringify({
        value: opts.value != null ? opts.value : opts.payload || {},
        updated_at: new Date().toISOString(),
        ttl_seconds: opts.ttlSeconds || ttlSeconds || 60,
    });
    await ensureRedisConnected(client);
    await client.set(key, payload, { EX: opts.ttlSeconds || ttlSeconds || 60 });
    return { key, ttl_seconds: opts.ttlSeconds || ttlSeconds || 60 };
}

async function heartbeatPresence(bundleOrClient, options) {
    const opts = options || {};
    return ttlPresence(bundleOrClient, {
        key: buildPresenceKey(opts.namespace, opts.id),
        namespace: opts.namespace,
        id: opts.id,
        value: opts.payload || {},
        ttlSeconds: opts.ttlSeconds || 60,
    });
}

async function readPresence(bundleOrClient, options) {
    const client = resolveRedisClient(bundleOrClient);
    if (!client) throw new Error('Redis bundle or client is not enabled');
    const opts = options || {};
    const key = buildPresenceKey(opts.namespace, opts.id);
    await ensureRedisConnected(client);
    const raw = await client.get(key);
    return raw ? JSON.parse(raw) : null;
}

async function clearPresence(bundleOrClient, options) {
    const client = resolveRedisClient(bundleOrClient);
    if (!client) throw new Error('Redis bundle or client is not enabled');
    const opts = options || {};
    const key = buildPresenceKey(opts.namespace, opts.id);
    await ensureRedisConnected(client);
    await client.del(key);
    return { key, cleared: true };
}

module.exports = {
    buildPresenceKey,
    clearPresence,
    heartbeatPresence,
    readPresence,
    ttlPresence,
};
