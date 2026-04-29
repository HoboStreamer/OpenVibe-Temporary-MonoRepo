'use strict';

const crypto = require('crypto');

const { ensureRedisConnected, resolveRedisClient } = require('./client');

function normalizeLockArgs(bundleOrClient, options, fn) {
    if (typeof options === 'function') {
        return {
            bundleOrClient,
            options: {},
            fn: options,
        };
    }
    return {
        bundleOrClient,
        options: options || {},
        fn,
    };
}

async function releaseLock(client, key, token) {
    const current = await client.get(key);
    if (current === token) await client.del(key);
}

async function withRedisLock(bundleOrClient, options, fn) {
    const normalized = normalizeLockArgs(bundleOrClient, options, fn);
    const client = resolveRedisClient(normalized.bundleOrClient);
    if (!client) throw new Error('Redis bundle or client is not enabled');

    const opts = normalized.options;
    const key = String(opts.key || '').trim();
    if (!key) throw new Error('lock key is required');
    const ttlMs = opts.ttlMs || 30000;
    const token = opts.token || crypto.randomUUID();

    await ensureRedisConnected(client);
    const reply = await client.set(key, token, { NX: true, PX: ttlMs });
    if (reply !== 'OK') {
        return { acquired: false, key, token, value: null };
    }

    try {
        const value = await normalized.fn(token);
        return { acquired: true, key, token, value };
    } finally {
        await releaseLock(client, key, token);
    }
}

module.exports = {
    releaseLock,
    withRedisLock,
};
