'use strict';

require('dotenv').config();

const path = require('path');

module.exports = {
    port:      parseInt(process.env.PORT, 10) || 4900,
    host:      process.env.HOST || '0.0.0.0',
    nodeEnv:   process.env.NODE_ENV || 'development',
    serviceId: 'openvibe-community',

    internalKey: process.env.INTERNAL_API_KEY || 'change-me-in-production',

    db: {
        path: process.env.DB_PATH || path.resolve(process.cwd(), 'data/openvibe-community.db'),
    },

    publicBaseUrl: process.env.PUBLIC_BASE_URL || `http://127.0.0.1:${parseInt(process.env.PORT, 10) || 4900}`,

    events: { url: process.env.OPENVIBE_EVENTS_URL || 'http://127.0.0.1:4400' },
    network: { url: process.env.OPENVIBE_NETWORK_URL || 'http://127.0.0.1:4100' },
    media:   { url: process.env.OPENVIBE_MEDIA_URL || 'http://127.0.0.1:4500' },

    auth: {
        issuer:  process.env.OPENVIBE_AUTH_ISSUER || null,
        jwksUrl: process.env.OPENVIBE_AUTH_JWKS_URL || null,
        cookieNames: ['openvibe_token', 'hobo_token', 'token'],
    },

    discord: {
        webhookSecret: process.env.DISCORD_WEBHOOK_SECRET || null,
    },
};
