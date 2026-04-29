'use strict';

const { createRedisClient, ensureRedisConnected, healthCheck: redisHealthCheck, resolveRedisClient } = require('@openvibe/redis');

function buildStreamKey(namespace, topic) {
    return `ov:stream:${String(namespace || 'default')}:${String(topic || 'events')}`;
}

function buildDeadLetterStreamKey(streamKey) {
    return `${String(streamKey)}:dlq`;
}

function createStreamClient(serviceNameOrOptions, env) {
    return createRedisClient(serviceNameOrOptions, env);
}

async function publish(clientOrBundle, streamKey, payload, options) {
    const client = resolveRedisClient(clientOrBundle);
    if (!client) throw new Error('Redis stream client is not configured');
    await ensureRedisConnected(client);
    const opts = options || {};
    const values = Object.entries(payload || {}).flatMap(([key, value]) => [key, JSON.stringify(value)]);
    const id = await client.xAdd(streamKey, opts.id || '*', values, opts.maxLen ? { TRIM: { strategy: 'MAXLEN', strategyModifier: '~', threshold: opts.maxLen } } : undefined);
    return { id, stream: streamKey };
}

async function createGroup(clientOrBundle, streamKey, groupName, options) {
    const client = resolveRedisClient(clientOrBundle);
    if (!client) throw new Error('Redis stream client is not configured');
    await ensureRedisConnected(client);
    const opts = options || {};
    try {
        await client.xGroupCreate(streamKey, groupName, opts.fromId || '0', { MKSTREAM: opts.mkstream !== false });
        return { ok: true, created: true, stream: streamKey, group: groupName };
    } catch (error) {
        if (String(error && error.message || '').includes('BUSYGROUP')) {
            return { ok: true, created: false, stream: streamKey, group: groupName };
        }
        throw error;
    }
}

function deserializeMessages(entries) {
    return (entries || []).flatMap((stream) => (stream.messages || []).map((message) => ({
        id: message.id,
        stream: stream.name,
        values: Object.fromEntries(Object.entries(message.message || {}).map(([key, value]) => {
            try {
                return [key, JSON.parse(value)];
            } catch {
                return [key, value];
            }
        })),
    })));
}

async function consumeGroup(clientOrBundle, streamKey, groupName, consumerName, options) {
    const client = resolveRedisClient(clientOrBundle);
    if (!client) throw new Error('Redis stream client is not configured');
    await ensureRedisConnected(client);
    const opts = options || {};
    const response = await client.xReadGroup(groupName, consumerName, {
        key: streamKey,
        id: opts.id || '>',
    }, {
        COUNT: opts.count || 10,
        BLOCK: opts.blockMs || 0,
    });
    return deserializeMessages(response);
}

async function ack(clientOrBundle, streamKey, groupName, ...ids) {
    const client = resolveRedisClient(clientOrBundle);
    if (!client) throw new Error('Redis stream client is not configured');
    await ensureRedisConnected(client);
    const messageIds = ids.flat().filter(Boolean);
    if (!messageIds.length) return 0;
    return client.xAck(streamKey, groupName, messageIds);
}

async function claimStale(clientOrBundle, streamKey, groupName, consumerName, options) {
    const client = resolveRedisClient(clientOrBundle);
    if (!client) throw new Error('Redis stream client is not configured');
    await ensureRedisConnected(client);
    const opts = options || {};
    const response = await client.xAutoClaim(streamKey, groupName, consumerName, opts.minIdleMs || 60000, opts.start || '0-0', {
        COUNT: opts.count || 25,
    });
    return {
        next_start: response.nextId,
        items: (response.messages || []).map((message) => ({
            id: message.id,
            stream: streamKey,
            values: Object.fromEntries(Object.entries(message.message || {}).map(([key, value]) => {
                try {
                    return [key, JSON.parse(value)];
                } catch {
                    return [key, value];
                }
            })),
        })),
    };
}

async function deadLetter(clientOrBundle, streamKey, payload, options) {
    return publish(clientOrBundle, buildDeadLetterStreamKey(streamKey), payload, options);
}

async function getPending(clientOrBundle, streamKey, groupName) {
    const client = resolveRedisClient(clientOrBundle);
    if (!client) throw new Error('Redis stream client is not configured');
    await ensureRedisConnected(client);
    return client.xPending(streamKey, groupName);
}

async function getLag(clientOrBundle, streamKey, groupName) {
    const client = resolveRedisClient(clientOrBundle);
    if (!client) throw new Error('Redis stream client is not configured');
    await ensureRedisConnected(client);
    const groups = await client.xInfoGroups(streamKey);
    const group = (groups || []).find((item) => item.name === groupName) || null;
    return group ? Number(group.lag || 0) : 0;
}

async function healthCheck(clientOrBundle) {
    return redisHealthCheck(clientOrBundle);
}

module.exports = {
    ack,
    buildDeadLetterStreamKey,
    buildStreamKey,
    claimStale,
    consumeGroup,
    createGroup,
    createStreamClient,
    deadLetter,
    getLag,
    getPending,
    healthCheck,
    publish,
};
