'use strict';

require('dotenv').config();

function trim(u) { return u ? String(u).replace(/\/$/, '') : ''; }

const networkUrl = trim(process.env.OPENVIBE_NETWORK_URL || 'http://localhost:4100');

module.exports = {
    port:    parseInt(process.env.PORT, 10) || 4100,
    host:    process.env.HOST || '0.0.0.0',
    nodeEnv: process.env.NODE_ENV || 'development',
    internalKey: process.env.INTERNAL_API_KEY || 'change-me-in-production',

    db: { path: process.env.DB_PATH || './data/openvibe-network.db' },

    surfaces: {
        network: networkUrl,
        auth:    trim(process.env.OPENVIBE_AUTH_URL)    || networkUrl,
        api:     trim(process.env.OPENVIBE_API_URL)     || networkUrl,
        admin:   trim(process.env.OPENVIBE_ADMIN_URL)   || networkUrl,
        my:      trim(process.env.OPENVIBE_MY_URL)      || networkUrl,
        themes:  trim(process.env.OPENVIBE_THEMES_URL)  || networkUrl,
    },

    events: {
        url: trim(process.env.OPENVIBE_EVENTS_URL) || 'http://127.0.0.1:4400',
    },

    // Phase 3 / Phase 4 service URLs (overlay registry seeds).
    media: {
        url:         trim(process.env.OPENVIBE_MEDIA_URL)          || 'http://127.0.0.1:4500',
        internalUrl: trim(process.env.OPENVIBE_MEDIA_INTERNAL_URL) || trim(process.env.OPENVIBE_MEDIA_URL) || 'http://127.0.0.1:4500',
    },
    live: {
        url:         trim(process.env.OPENVIBE_LIVE_URL)          || 'http://127.0.0.1:4600',
        internalUrl: trim(process.env.OPENVIBE_LIVE_INTERNAL_URL) || trim(process.env.OPENVIBE_LIVE_URL) || 'http://127.0.0.1:4600',
    },
    restream: {
        url:         trim(process.env.OPENRE_STREAM_URL)          || 'http://127.0.0.1:4700',
        internalUrl: trim(process.env.OPENRE_STREAM_INTERNAL_URL) || trim(process.env.OPENRE_STREAM_URL) || 'http://127.0.0.1:4700',
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
