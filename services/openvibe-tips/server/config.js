'use strict';

require('dotenv').config();

const path = require('path');
const { resolveAuthIssuer, resolvePublicOrigin } = require('@openvibe/sdk/url-defaults');

const port = parseInt(process.env.PORT, 10) || 5600;

module.exports = {
    port,
    host:      process.env.HOST || '0.0.0.0',
    nodeEnv:   process.env.NODE_ENV || 'development',
    serviceId: 'openvibe-tips',

    internalKey: process.env.INTERNAL_API_KEY || 'change-me-in-production',

    db: {
        path: process.env.DB_PATH || path.resolve(process.cwd(), 'data/openvibe-tips.db'),
    },

    publicBaseUrl: resolvePublicOrigin({ surface: 'tips', envKeys: ['PUBLIC_BASE_URL', 'OPENVIBE_TIPS_URL'] }),

    events:  { url: process.env.OPENVIBE_EVENTS_URL  || 'http://127.0.0.1:4400' },
    network: { url: resolvePublicOrigin({ surface: 'network' }) },
    billing: { url: process.env.OPENVIBE_BILLING_URL || resolvePublicOrigin({ surface: 'billing' }) },

    auth: {
        issuer:        resolveAuthIssuer(),
        publicKeyPath: process.env.OPENVIBE_AUTH_PUBLIC_KEY
            || path.resolve(__dirname, '..', '..', 'openvibe-network', 'data', 'keys', 'openvibe-public.pem'),
        cookieNames: ['openvibe_token', 'hobo_token', 'token'],
    },

    // Connector secrets (loaded from env; creators store per-connector tokens in DB)
    connectors: {
        streamlabs: {
            socketToken:  process.env.STREAMLABS_SOCKET_TOKEN   || '',
            webhookSecret: process.env.STREAMLABS_WEBHOOK_SECRET || '',
        },
        streamelements: {
            jwtSecret:  process.env.STREAMELEMENTS_JWT_SECRET  || '',
            channelId:  process.env.STREAMELEMENTS_CHANNEL_ID  || '',
        },
        powerchat: {
            apiKey: process.env.POWERCHAT_API_KEY || '',
        },
    },
};
