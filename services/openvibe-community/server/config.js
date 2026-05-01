'use strict';

require('dotenv').config();

const path = require('path');
const { resolveAuthIssuer, resolvePublicOrigin } = require('@openvibe/sdk/url-defaults');

const port = parseInt(process.env.PORT, 10) || 4900;

module.exports = {
    port,
    host:      process.env.HOST || '0.0.0.0',
    nodeEnv:   process.env.NODE_ENV || 'development',
    serviceId: 'openvibe-community',

    internalKey: process.env.INTERNAL_API_KEY || 'change-me-in-production',

    db: {
        path: process.env.DB_PATH || path.resolve(process.cwd(), 'data/openvibe-community.db'),
    },

    publicBaseUrl: resolvePublicOrigin({ surface: 'community', envKeys: ['PUBLIC_BASE_URL', 'OPENVIBE_COMMUNITY_URL'] }),

    events: { url: process.env.OPENVIBE_EVENTS_URL || 'http://127.0.0.1:4400' },
    network: { url: resolvePublicOrigin({ surface: 'network' }) },
    media:   { url: resolvePublicOrigin({ surface: 'media' }) },

    auth: {
        issuer:  resolveAuthIssuer(),
        publicKeyPath: process.env.OPENVIBE_AUTH_PUBLIC_KEY || path.resolve(__dirname, '..', '..', 'openvibe-network', 'data', 'keys', 'openvibe-public.pem'),
        jwksUrl: process.env.OPENVIBE_AUTH_JWKS_URL || null,
        cookieNames: ['openvibe_token', 'hobo_token', 'token'],
    },

    discord: {
        webhookSecret: process.env.DISCORD_WEBHOOK_SECRET || null,
    },
};
