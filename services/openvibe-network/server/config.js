'use strict';

require('dotenv').config();

const {
    resolveInternalOrigin,
    resolvePublicOrigin,
    trimUrl: trim,
} = require('@openvibe/sdk/url-defaults');

const networkUrl = resolvePublicOrigin({ surface: 'network' });

module.exports = {
    port:    parseInt(process.env.PORT, 10) || 4100,
    host:    process.env.HOST || '0.0.0.0',
    nodeEnv: process.env.NODE_ENV || 'development',
    internalKey: process.env.INTERNAL_API_KEY || 'change-me-in-production',

    db: { path: process.env.DB_PATH || './data/openvibe-network.db' },

    surfaces: {
        network: networkUrl,
        auth:    resolvePublicOrigin({ surface: 'auth' }),
        api:     resolvePublicOrigin({ surface: 'api' }),
        admin:   resolvePublicOrigin({ surface: 'admin' }),
        my:      resolvePublicOrigin({ surface: 'my' }),
        themes:  resolvePublicOrigin({ surface: 'themes' }),
        tools:   resolvePublicOrigin({ surface: 'tools' }),
    },

    events: {
        url: trim(process.env.OPENVIBE_EVENTS_URL) || 'http://127.0.0.1:4400',
    },
    workers: {
        internalUrl: trim(process.env.OPENVIBE_WORKERS_INTERNAL_URL) || 'http://127.0.0.1:5300',
    },
    realtime: {
        internalUrl: trim(process.env.OPENVIBE_REALTIME_INTERNAL_URL) || 'http://127.0.0.1:5400',
    },

    // Phase 3 / Phase 4 service URLs (overlay registry seeds).
    media: {
        url: resolvePublicOrigin({ surface: 'media' }),
        internalUrl: resolveInternalOrigin({
            envKeys: ['OPENVIBE_MEDIA_INTERNAL_URL'],
            publicEnvKeys: ['OPENVIBE_MEDIA_URL'],
            fallbackPort: 4500,
        }),
    },
    live: {
        url: resolvePublicOrigin({ surface: 'live' }),
        internalUrl: resolveInternalOrigin({
            envKeys: ['OPENVIBE_LIVE_INTERNAL_URL'],
            publicEnvKeys: ['OPENVIBE_LIVE_URL'],
            fallbackPort: 4600,
        }),
    },
    restream: {
        url: resolvePublicOrigin({ surface: 'restream' }),
        internalUrl: resolveInternalOrigin({
            envKeys: ['OPENRE_STREAM_INTERNAL_URL'],
            publicEnvKeys: ['OPENRE_STREAM_URL'],
            fallbackPort: 4700,
        }),
    },
    chat: {
        url: resolvePublicOrigin({ surface: 'chat' }),
        internalUrl: resolveInternalOrigin({
            envKeys: ['OPENVIBE_CHAT_INTERNAL_URL'],
            publicEnvKeys: ['OPENVIBE_CHAT_URL'],
            fallbackPort: 4800,
        }),
    },
    community: {
        url: resolvePublicOrigin({ surface: 'community' }),
        internalUrl: resolveInternalOrigin({
            envKeys: ['OPENVIBE_COMMUNITY_INTERNAL_URL'],
            publicEnvKeys: ['OPENVIBE_COMMUNITY_URL'],
            fallbackPort: 4900,
        }),
    },
    billing: {
        url: resolvePublicOrigin({ surface: 'billing' }),
        internalUrl: resolveInternalOrigin({
            envKeys: ['OPENVIBE_BILLING_INTERNAL_URL'],
            publicEnvKeys: ['OPENVIBE_BILLING_URL'],
            fallbackPort: 5000,
        }),
    },
    ai: {
        url: resolvePublicOrigin({ surface: 'ai' }),
        internalUrl: resolveInternalOrigin({
            envKeys: ['OPENVIBE_AI_INTERNAL_URL'],
            publicEnvKeys: ['OPENVIBE_AI_URL'],
            fallbackPort: 5100,
        }),
        canonicalHost: trim(process.env.AI_OPENVIBE_NETWORK_HOST) || 'ai.openvibe.network',
    },
    games: {
        url: resolvePublicOrigin({ surface: 'games' }),
        internalUrl: resolveInternalOrigin({
            envKeys: ['OPENVIBE_GAMES_INTERNAL_URL'],
            publicEnvKeys: ['OPENVIBE_GAMES_URL'],
            fallbackPort: 5200,
        }),
    },
    content: {
        url: resolvePublicOrigin({ surface: 'content' }),
        internalUrl: resolveInternalOrigin({
            envKeys: ['OPENVIBE_CONTENT_INTERNAL_URL'],
            publicEnvKeys: ['OPENVIBE_CONTENT_URL'],
            fallbackPort: 5500,
        }),
    },

    hoboTools: {
        publicUrl:   trim(process.env.HOBO_TOOLS_URL),
        internalUrl: trim(process.env.HOBO_TOOLS_INTERNAL_URL),
        publicKeyPath: process.env.HOBO_TOOLS_PUBLIC_KEY || '',
    },

    openvibeKeys: {
        privatePath: process.env.OPENVIBE_PRIVATE_KEY || './data/keys/openvibe-private.pem',
        publicPath:  process.env.OPENVIBE_PUBLIC_KEY  || './data/keys/openvibe-public.pem',
    },
};
