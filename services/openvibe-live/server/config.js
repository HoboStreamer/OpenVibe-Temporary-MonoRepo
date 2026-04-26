'use strict';

require('dotenv').config();
const path = require('path');

module.exports = {
    port:    parseInt(process.env.PORT, 10) || 4600,
    host:    process.env.HOST || '0.0.0.0',
    nodeEnv: process.env.NODE_ENV || 'development',
    serviceId: 'openvibe-live',
    publicBaseUrl: process.env.PUBLIC_BASE_URL || 'http://127.0.0.1:4600',

    internalKey: process.env.INTERNAL_API_KEY || 'change-me-in-production',

    db: { path: process.env.DB_PATH || path.resolve(process.cwd(), 'data/openvibe-live.db') },

    events:  { url: process.env.OPENVIBE_EVENTS_URL  || 'http://127.0.0.1:4400' },
    network: { url: process.env.OPENVIBE_NETWORK_URL || 'http://127.0.0.1:4100' },
    stream:  { url: process.env.OPENRE_STREAM_URL    || 'http://127.0.0.1:4700' },
    media:   { url: process.env.OPENVIBE_MEDIA_URL   || 'http://127.0.0.1:4500' },

    subscription: {
        enabled: process.env.LIVE_SUBSCRIBE_STREAM_EVENTS !== 'false',
        callbackUrl: process.env.LIVE_SUBSCRIBE_CALLBACK_URL || null,
    },
};
