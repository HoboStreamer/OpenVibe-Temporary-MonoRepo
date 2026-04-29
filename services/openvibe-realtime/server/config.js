'use strict';

require('dotenv').config();

module.exports = {
    port: parseInt(process.env.PORT, 10) || 5400,
    host: process.env.HOST || '0.0.0.0',
    serviceId: 'openvibe-realtime',
    internalKey: process.env.INTERNAL_API_KEY || 'change-me-in-production',
    redisUrl: process.env.OPENVIBE_REDIS_URL || '',
    queuePrefix: process.env.OPENVIBE_QUEUE_PREFIX || 'openvibe',
    allowAnonymous: String(process.env.OPENVIBE_REALTIME_ALLOW_ANONYMOUS || 'true').toLowerCase() === 'true',
    presenceTtlSeconds: parseInt(process.env.OPENVIBE_REALTIME_PRESENCE_TTL_SECONDS, 10) || 60,
    rateLimits: {
        join: [{ capacity: 30, refillPerSecond: 10, cost: 1 }],
        message: [{ capacity: 60, refillPerSecond: 15, cost: 1 }],
    },
};