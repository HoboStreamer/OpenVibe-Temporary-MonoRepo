'use strict';

require('dotenv').config();

const path = require('path');
const { resolveAuthIssuer, resolvePublicOrigin } = require('@openvibe/sdk/url-defaults');

const port = parseInt(process.env.PORT, 10) || 5000;

module.exports = {
    port,
    host:      process.env.HOST || '0.0.0.0',
    nodeEnv:   process.env.NODE_ENV || 'development',
    serviceId: 'openvibe-billing',

    internalKey: process.env.INTERNAL_API_KEY || 'change-me-in-production',

    db: {
        path: process.env.DB_PATH || path.resolve(process.cwd(), 'data/openvibe-billing.db'),
    },

    publicBaseUrl: resolvePublicOrigin({ surface: 'billing', envKeys: ['PUBLIC_BASE_URL', 'OPENVIBE_BILLING_URL'] }),

    events:    { url: process.env.OPENVIBE_EVENTS_URL    || 'http://127.0.0.1:4400' },
    network:   { url: resolvePublicOrigin({ surface: 'network' }) },
    media:     { url: resolvePublicOrigin({ surface: 'media' }) },
    live:      { url: resolvePublicOrigin({ surface: 'live' }) },
    chat:      { url: resolvePublicOrigin({ surface: 'chat' }) },
    community: { url: resolvePublicOrigin({ surface: 'community' }) },

    auth: {
        issuer:  resolveAuthIssuer(),
        jwksUrl: process.env.OPENVIBE_AUTH_JWKS_URL || null,
        cookieNames: ['openvibe_token', 'hobo_token', 'token'],
    },

    creditsCurrency: process.env.CREDITS_CURRENCY || 'OVC',
    platformFeeBps:  parseInt(process.env.PLATFORM_FEE_BPS, 10) || 0, // 10000 = 100%
    defaultProvider: process.env.PAYMENT_PROVIDER_DEFAULT || 'stub',

    // Idempotency-key cache lifetime (ms). 24h default.
    idempotencyTtlMs: parseInt(process.env.IDEMPOTENCY_TTL_MS, 10) || (24 * 60 * 60 * 1000),
};
