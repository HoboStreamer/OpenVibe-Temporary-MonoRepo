'use strict';

const { ensureRedisConnected, resolveRedisClient } = require('./client');

function buildRateLimitKey(namespace, id) {
    return `ov:ratelimit:${String(namespace || 'default')}:${String(id || 'unknown')}`;
}

function normalizeBucketRules(keyOrRules, maybeRules) {
    if (Array.isArray(maybeRules)) return maybeRules;
    if (Array.isArray(keyOrRules)) return keyOrRules;
    return [maybeRules || keyOrRules || {}];
}

async function tokenBucketRateLimit(bundleOrClient, keyOrOptions, rules) {
    const client = resolveRedisClient(bundleOrClient);
    if (!client) throw new Error('Redis bundle or client is not enabled');

    const opts = typeof keyOrOptions === 'object' && keyOrOptions !== null && !Array.isArray(keyOrOptions)
        ? keyOrOptions
        : { key: keyOrOptions };
    const key = String(opts.key || buildRateLimitKey(opts.namespace, opts.id));
    const buckets = normalizeBucketRules(opts.rules, rules);
    const nowMs = Number(opts.nowMs || Date.now());

    await ensureRedisConnected(client);
    const raw = await client.get(key);
    const state = raw ? JSON.parse(raw) : {};
    const results = [];
    let allowed = true;
    let ttlMs = 0;

    for (let index = 0; index < buckets.length; index += 1) {
        const rule = buckets[index] || {};
        const capacity = Math.max(1, Number(rule.capacity || rule.limit || 1));
        const refillPerSecond = Number(rule.refillPerSecond)
            || (rule.windowSeconds ? capacity / Math.max(1, Number(rule.windowSeconds)) : capacity);
        const cost = Math.max(0, Number(rule.cost || 1));
        const bucketKey = String(rule.key || `bucket_${index}`);
        const previous = state[bucketKey] || { tokens: capacity, refreshed_at: nowMs };
        const elapsedSeconds = Math.max(0, nowMs - Number(previous.refreshed_at || nowMs)) / 1000;
        const availableTokens = Math.min(capacity, Number(previous.tokens || capacity) + (elapsedSeconds * refillPerSecond));
        const nextTokens = availableTokens - cost;
        const bucketAllowed = nextTokens >= 0;
        const bucketTtlMs = Math.max(1000, Math.ceil((capacity / Math.max(refillPerSecond, 0.0001)) * 1000));
        ttlMs = Math.max(ttlMs, bucketTtlMs);
        state[bucketKey] = {
            tokens: bucketAllowed ? nextTokens : availableTokens,
            refreshed_at: nowMs,
        };
        allowed = allowed && bucketAllowed;
        results.push({
            bucket: bucketKey,
            allowed: bucketAllowed,
            capacity,
            refill_per_second: refillPerSecond,
            remaining: Math.max(0, Math.floor(bucketAllowed ? nextTokens : availableTokens)),
            retry_after_ms: bucketAllowed ? 0 : Math.ceil(((cost - availableTokens) / Math.max(refillPerSecond, 0.0001)) * 1000),
        });
    }

    await client.set(key, JSON.stringify(state), { PX: ttlMs || 1000 });
    return {
        key,
        allowed,
        buckets: results,
        remaining: results.length ? Math.min(...results.map((bucket) => bucket.remaining)) : 0,
        reset_ms: ttlMs || 1000,
    };
}

async function consumeRateLimit(bundleOrClient, options) {
    const client = resolveRedisClient(bundleOrClient);
    if (!client) throw new Error('Redis bundle or client is not enabled');
    const opts = options || {};
    const key = opts.key || buildRateLimitKey(opts.namespace, opts.id);
    const limit = Math.max(1, Number(opts.limit || 1));
    const windowSeconds = Math.max(1, Number(opts.windowSeconds || 60));

    await ensureRedisConnected(client);
    const count = await client.incr(key);
    if (count === 1) await client.expire(key, windowSeconds);
    const resetSeconds = await client.ttl(key);

    return {
        key,
        allowed: count <= limit,
        count,
        limit,
        remaining: Math.max(limit - count, 0),
        reset_seconds: resetSeconds,
    };
}

module.exports = {
    buildRateLimitKey,
    consumeRateLimit,
    tokenBucketRateLimit,
};