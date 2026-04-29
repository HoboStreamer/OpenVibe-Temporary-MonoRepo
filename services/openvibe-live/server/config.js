'use strict';

require('dotenv').config();
const path = require('path');
const { resolvePublicOrigin } = require('@openvibe/sdk/url-defaults');

const port = parseInt(process.env.PORT, 10) || 4600;

module.exports = {
    port,
    host:    process.env.HOST || '0.0.0.0',
    nodeEnv: process.env.NODE_ENV || 'development',
    serviceId: 'openvibe-live',
    publicBaseUrl: resolvePublicOrigin({ surface: 'live', envKeys: ['PUBLIC_BASE_URL', 'OPENVIBE_LIVE_URL'] }),

    internalKey: process.env.INTERNAL_API_KEY || 'change-me-in-production',

    db: { path: process.env.DB_PATH || path.resolve(process.cwd(), 'data/openvibe-live.db') },

    events:  { url: process.env.OPENVIBE_EVENTS_URL  || 'http://127.0.0.1:4400' },
    network: { url: resolvePublicOrigin({ surface: 'network' }) },
    stream:  { url: resolvePublicOrigin({ surface: 'restream' }) },
    media:   { url: resolvePublicOrigin({ surface: 'media' }) },

    subscription: {
        enabled: process.env.LIVE_SUBSCRIBE_STREAM_EVENTS !== 'false',
        callbackUrl: process.env.LIVE_SUBSCRIBE_CALLBACK_URL || null,
    },
};
