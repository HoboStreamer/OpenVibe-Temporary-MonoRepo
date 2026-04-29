'use strict';

require('dotenv').config();

module.exports = {
    port: parseInt(process.env.PORT, 10) || 5400,
    host: process.env.HOST || '0.0.0.0',
    serviceId: 'openvibe-realtime',
    internalKey: process.env.INTERNAL_API_KEY || 'change-me-in-production',
    eventsUrl: process.env.OPENVIBE_EVENTS_URL || 'http://127.0.0.1:4400',
    redisUrl: process.env.OPENVIBE_REDIS_URL || '',
    queuePrefix: process.env.OPENVIBE_QUEUE_PREFIX || 'openvibe',
    eventStreamNamespace: process.env.OPENVIBE_EVENT_STREAM_NAMESPACE || 'events',
    bridgeBatchSize: parseInt(process.env.OPENVIBE_REALTIME_BRIDGE_BATCH_SIZE, 10) || 25,
    bridgeConsumerGroup: process.env.OPENVIBE_REALTIME_BRIDGE_GROUP || 'openvibe-realtime',
    bridgeConsumerName: process.env.OPENVIBE_REALTIME_BRIDGE_CONSUMER || `openvibe-realtime-${process.pid}`,
    bridgeIdleMs: parseInt(process.env.OPENVIBE_REALTIME_BRIDGE_IDLE_MS, 10) || 200,
    bridgePollIntervalMs: parseInt(process.env.OPENVIBE_REALTIME_BRIDGE_POLL_INTERVAL_MS, 10) || 1500,
    bridgePollLimit: parseInt(process.env.OPENVIBE_REALTIME_BRIDGE_POLL_LIMIT, 10) || 500,
    allowAnonymous: String(process.env.OPENVIBE_REALTIME_ALLOW_ANONYMOUS || 'true').toLowerCase() === 'true',
    presenceTtlSeconds: parseInt(process.env.OPENVIBE_REALTIME_PRESENCE_TTL_SECONDS, 10) || 60,
    enablePollingTransport: String(process.env.OPENVIBE_REALTIME_ENABLE_POLLING_TRANSPORT || 'false').toLowerCase() === 'true',
    rateLimits: {
        join: [{ capacity: 30, refillPerSecond: 10, cost: 1 }],
        message: [{ capacity: 60, refillPerSecond: 15, cost: 1 }],
    },
};