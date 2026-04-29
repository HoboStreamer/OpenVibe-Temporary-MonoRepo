'use strict';

const { createClient } = require('redis');

function asEnv(source) {
    return source && typeof source === 'object' ? source : process.env;
}

function normalizeRedisConfig(options) {
    const opts = options || {};
    const runtimeEnv = asEnv(opts.env);
    return {
        url: opts.url || runtimeEnv.OPENVIBE_REDIS_URL || '',
        name: opts.name || opts.serviceName || runtimeEnv.OPENVIBE_REDIS_NAME || 'openvibe',
        prefix: opts.prefix || runtimeEnv.OPENVIBE_QUEUE_PREFIX || runtimeEnv.OPENVIBE_REDIS_PREFIX || 'ov',
        tls: opts.tls != null ? opts.tls : runtimeEnv.OPENVIBE_REDIS_TLS === 'true',
        connectTimeoutMs: Number(opts.connectTimeoutMs || runtimeEnv.OPENVIBE_REDIS_CONNECT_TIMEOUT_MS || 5000),
        maxRetriesPerRequest: Number(opts.maxRetriesPerRequest || runtimeEnv.OPENVIBE_REDIS_MAX_RETRIES || 3),
        lazyConnect: opts.lazyConnect !== false,
    };
}

function buildClient(config, options) {
    const client = createClient({
        url: config.url,
        name: config.name,
        socket: {
            connectTimeout: config.connectTimeoutMs,
            tls: !!config.tls,
            reconnectStrategy(attempts) {
                const maxRetries = Math.max(0, config.maxRetriesPerRequest);
                if (attempts > maxRetries) return new Error('redis reconnect limit exceeded');
                return Math.min(2000, 100 * attempts);
            },
        },
    });
    client.__openvibe = Object.assign({
        prefix: config.prefix,
        name: config.name,
        lazyConnect: config.lazyConnect,
    }, options || {});
    client.on('error', (error) => {
        console.warn(`[redis:${config.name}] ${error.message}`);
    });
    return client;
}

function createRedisClient(serviceNameOrOptions, env) {
    const options = typeof serviceNameOrOptions === 'string'
        ? { serviceName: serviceNameOrOptions, env }
        : Object.assign({}, serviceNameOrOptions || {}, env ? { env } : {});
    const config = normalizeRedisConfig(options);
    if (!config.url) return null;
    return buildClient(config, { role: 'primary' });
}

function createRedisSubscriber(serviceNameOrOptions, env) {
    const primary = createRedisClient(serviceNameOrOptions, env);
    if (!primary) return null;
    const subscriber = primary.duplicate();
    subscriber.__openvibe = Object.assign({}, primary.__openvibe || {}, { role: 'subscriber' });
    subscriber.on('error', (error) => {
        console.warn(`[redis:${subscriber.__openvibe.name}:subscriber] ${error.message}`);
    });
    return subscriber;
}

function createRedisBundle(options) {
    const config = normalizeRedisConfig(options);
    if (!config.url) {
        return { enabled: false, client: null, subscriber: null, config };
    }

    const client = buildClient(config, { role: 'primary' });
    const subscriber = client.duplicate();
    subscriber.__openvibe = Object.assign({}, client.__openvibe || {}, { role: 'subscriber' });
    subscriber.on('error', (error) => {
        console.warn(`[redis:${config.name}:subscriber] ${error.message}`);
    });

    return { enabled: true, client, subscriber, config };
}

function resolveRedisClient(bundleOrClient) {
    if (!bundleOrClient) return null;
    if (typeof bundleOrClient.connect === 'function' && typeof bundleOrClient.get === 'function') {
        return bundleOrClient;
    }
    if (bundleOrClient.client) return bundleOrClient.client;
    return null;
}

async function ensureRedisConnected(bundleOrClient) {
    const client = resolveRedisClient(bundleOrClient);
    if (!client) return bundleOrClient;
    if (!client.isOpen) await client.connect();
    return bundleOrClient;
}

async function healthCheck(bundleOrClient) {
    const client = resolveRedisClient(bundleOrClient);
    if (!client) {
        return {
            ok: false,
            configured: false,
            checked_at: new Date().toISOString(),
            error: 'redis client not configured',
        };
    }
    await ensureRedisConnected(client);
    const started = Date.now();
    const pong = await client.ping();
    return {
        ok: pong === 'PONG',
        configured: true,
        latency_ms: Date.now() - started,
        checked_at: new Date().toISOString(),
        response: pong,
    };
}

module.exports = {
    createRedisClient,
    createRedisBundle,
    createRedisSubscriber,
    ensureRedisConnected,
    healthCheck,
    normalizeRedisConfig,
    resolveRedisClient,
};
