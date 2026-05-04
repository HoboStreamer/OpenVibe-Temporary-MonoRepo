'use strict';

require('dotenv').config();

const {
    resolvePublicOrigin,
    trimUrl: trim,
} = require('@openvibe/sdk/url-defaults');

module.exports = {
    port:    parseInt(process.env.PORT, 10) || 4300,
    host:    process.env.HOST || '0.0.0.0',
    nodeEnv: process.env.NODE_ENV || 'development',
    serviceId: 'openvibe-control',
    internalKey: process.env.INTERNAL_API_KEY || 'change-me-in-production',

    auth: {
        issuer: process.env.OPENVIBE_AUTH_ISSUER || resolvePublicOrigin({ surface: 'network' }),
        publicKeyPath: process.env.OPENVIBE_PUBLIC_KEY_PATH || null,
    },

    // Downstream internal URLs
    services: {
        network:   trim(process.env.OPENVIBE_NETWORK_URL)   || 'http://127.0.0.1:4100',
        events:    trim(process.env.OPENVIBE_EVENTS_URL)    || 'http://127.0.0.1:4400',
        media:     trim(process.env.OPENVIBE_MEDIA_URL)     || 'http://127.0.0.1:4500',
        live:      trim(process.env.OPENVIBE_LIVE_URL)      || 'http://127.0.0.1:4600',
        restream:  trim(process.env.OPENRE_STREAM_URL)      || 'http://127.0.0.1:4700',
        chat:      trim(process.env.OPENVIBE_CHAT_URL)      || 'http://127.0.0.1:4800',
        community: trim(process.env.OPENVIBE_COMMUNITY_URL) || 'http://127.0.0.1:4900',
        billing:   trim(process.env.OPENVIBE_BILLING_URL)   || 'http://127.0.0.1:5001',
        ai:        trim(process.env.OPENVIBE_AI_URL)        || 'http://127.0.0.1:5100',
        games:     trim(process.env.OPENVIBE_GAMES_URL)     || 'http://127.0.0.1:5200',
        workers:   trim(process.env.OPENVIBE_WORKERS_URL)   || 'http://127.0.0.1:5300',
        realtime:  trim(process.env.OPENVIBE_REALTIME_URL)  || 'http://127.0.0.1:5400',
        content:   trim(process.env.OPENVIBE_CONTENT_URL)   || 'http://127.0.0.1:5500',
    },
};
