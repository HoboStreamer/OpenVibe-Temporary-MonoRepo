'use strict';

require('dotenv').config();

module.exports = {
    port:    parseInt(process.env.PORT, 10) || 4400,
    host:    process.env.HOST || '0.0.0.0',
    nodeEnv: process.env.NODE_ENV || 'development',
    internalKey: process.env.INTERNAL_API_KEY || 'change-me-in-production',
    redisUrl: process.env.OPENVIBE_REDIS_URL || '',
    queuePrefix: process.env.OPENVIBE_QUEUE_PREFIX || 'openvibe',
    streamNamespace: process.env.OPENVIBE_EVENT_STREAM_NAMESPACE || 'events',
    db: {
        path: process.env.DB_PATH || './data/openvibe-events.db',
    },
    worker: {
        dispatchIntervalMs: parseInt(process.env.DISPATCH_INTERVAL_MS, 10) || 500,
        maxAttempts:        parseInt(process.env.MAX_DELIVERY_ATTEMPTS, 10) || 8,
        retryBaseMs:        parseInt(process.env.RETRY_BASE_MS, 10) || 1000,
    },
};
