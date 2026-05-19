'use strict';

require('dotenv').config();

const path = require('path');
const {
    resolveAuthIssuer,
    resolveInternalOrigin,
    resolvePublicOrigin,
    trimUrl: trim,
} = require('@openvibe/sdk/url-defaults');

const port = parseInt(process.env.PORT, 10) || 5100;
const publicUrl = resolvePublicOrigin({ surface: 'ai' });

module.exports = {
    port,
    host:      process.env.HOST || '0.0.0.0',
    nodeEnv:   process.env.NODE_ENV || 'development',
    serviceId: 'openvibe-ai',

    internalKey: process.env.INTERNAL_API_KEY || 'change-me-in-production',

    db: {
        path: process.env.DB_PATH || path.resolve(process.cwd(), 'data/openvibe-ai.db'),
    },

    // Canonical OpenVibe AI public identity
    publicUrl,
    internalUrl: resolveInternalOrigin({
        envKeys: ['OPENVIBE_AI_INTERNAL_URL'],
        publicEnvKeys: ['OPENVIBE_AI_URL'],
        fallbackPort: port,
    }),
    canonicalHost: process.env.AI_OPENVIBE_NETWORK_HOST || 'ai.openvibe.network',
    canonicalUrl:  `https://${process.env.AI_OPENVIBE_NETWORK_HOST || 'ai.openvibe.network'}`,

    // Cross-service URLs (best-effort; AI service tolerates missing peers)
    events:    { url: trim(process.env.OPENVIBE_EVENTS_URL)    || 'http://127.0.0.1:4400' },
    network:   { url: resolvePublicOrigin({ surface: 'network' }) },
    media:     { url: resolvePublicOrigin({ surface: 'media' }) },
    community: { url: resolvePublicOrigin({ surface: 'community' }) },
    billing:   { url: resolvePublicOrigin({ surface: 'billing' }) },

    auth: {
        issuer:  resolveAuthIssuer(),
        jwksUrl: process.env.OPENVIBE_AUTH_JWKS_URL || null,
        cookieNames: ['openvibe_token', 'token'],
    },

    ai: {
        defaultProvider:   process.env.AI_DEFAULT_PROVIDER || 'stub',
        defaultRoute:      process.env.AI_DEFAULT_ROUTE    || 'default.chat',
        perMinuteLimit:    parseInt(process.env.AI_DEFAULT_PER_MINUTE, 10) || 120,
        perDayLimit:       parseInt(process.env.AI_DEFAULT_PER_DAY, 10) || 20000,
        cacheTtlSeconds:   parseInt(process.env.AI_CACHE_TTL_SECONDS, 10) || 900,
        debugPromptLogging: String(process.env.AI_DEBUG_PROMPT_LOGGING || '0') === '1',
        // Allowed provider env-var name prefixes (so admin UI can list which
        // tokens are present without ever returning the values themselves).
        allowedKeyEnvPrefixes: ['OPENVIBE_AI_', 'OPENVIBE_NEWSAPI', 'OPENVIBE_REDDIT_',
            'OPENVIBE_YOUTUBE_', 'OPENVIBE_YELP_', 'OPENVIBE_EBAY_',
            'OPENVIBE_AMAZON_PAAPI_', 'OPENVIBE_ALPHA_VANTAGE_',
            'OPENVIBE_FINNHUB_', 'OPENVIBE_POLYGON_', 'OPENVIBE_COINGECKO_',
            'OPENVIBE_COINMARKETCAP_', 'OPENVIBE_RAKUTEN_COUPON_',
            'OPENVIBE_COUPON_FEED_', 'OPENVIBE_MEILISEARCH_',
            'OPENVIBE_TYPESENSE_', 'OPENVIBE_OPENSEARCH_'],
    },
};
