'use strict';

require('dotenv').config();

const path = require('path');

module.exports = {
    port:      parseInt(process.env.PORT, 10) || 5000,
    host:      process.env.HOST || '0.0.0.0',
    nodeEnv:   process.env.NODE_ENV || 'development',
    serviceId: 'openvibe-billing',

    internalKey: process.env.INTERNAL_API_KEY || 'change-me-in-production',

    db: {
        path: process.env.DB_PATH || path.resolve(process.cwd(), 'data/openvibe-billing.db'),
    },

    publicBaseUrl: process.env.PUBLIC_BASE_URL || `http://127.0.0.1:${parseInt(process.env.PORT, 10) || 5000}`,

    events:    { url: process.env.OPENVIBE_EVENTS_URL    || 'http://127.0.0.1:4400' },
    network:   { url: process.env.OPENVIBE_NETWORK_URL   || 'http://127.0.0.1:4100' },
    media:     { url: process.env.OPENVIBE_MEDIA_URL     || 'http://127.0.0.1:4500' },
    live:      { url: process.env.OPENVIBE_LIVE_URL      || 'http://127.0.0.1:4600' },
    chat:      { url: process.env.OPENVIBE_CHAT_URL      || null },
    community: { url: process.env.OPENVIBE_COMMUNITY_URL || null },

    auth: {
        issuer:  process.env.OPENVIBE_AUTH_ISSUER  || null,
        jwksUrl: process.env.OPENVIBE_AUTH_JWKS_URL || null,
        cookieNames: ['openvibe_token', 'hobo_token', 'token'],
    },

    creditsCurrency: process.env.CREDITS_CURRENCY || 'OVC',
    platformFeeBps:  parseInt(process.env.PLATFORM_FEE_BPS, 10) || 0, // 10000 = 100%
    defaultProvider: process.env.PAYMENT_PROVIDER_DEFAULT || 'stub',

    // Idempotency-key cache lifetime (ms). 24h default.
    idempotencyTtlMs: parseInt(process.env.IDEMPOTENCY_TTL_MS, 10) || (24 * 60 * 60 * 1000),
};
