'use strict';

require('dotenv').config();

const path = require('path');

module.exports = {
    port:      parseInt(process.env.PORT, 10) || 4800,
    host:      process.env.HOST || '0.0.0.0',
    nodeEnv:   process.env.NODE_ENV || 'development',
    serviceId: 'openvibe-chat',

    internalKey: process.env.INTERNAL_API_KEY || 'change-me-in-production',

    db: {
        path: process.env.DB_PATH || path.resolve(process.cwd(), 'data/openvibe-chat.db'),
    },

    publicBaseUrl: process.env.PUBLIC_BASE_URL || `http://127.0.0.1:${parseInt(process.env.PORT, 10) || 4800}`,

    events: {
        url: process.env.OPENVIBE_EVENTS_URL || 'http://127.0.0.1:4400',
    },

    network: {
        url: process.env.OPENVIBE_NETWORK_URL || 'http://127.0.0.1:4100',
    },

    media: {
        url: process.env.OPENVIBE_MEDIA_URL || 'http://127.0.0.1:4500',
    },

    live: {
        url: process.env.OPENVIBE_LIVE_URL || 'http://127.0.0.1:4600',
    },

    auth: {
        issuer:  process.env.OPENVIBE_AUTH_ISSUER || null,
        jwksUrl: process.env.OPENVIBE_AUTH_JWKS_URL || null,
        cookieNames: ['openvibe_token', 'hobo_token', 'token'],
    },

    // Built-in TTS defaults applied if user has no row in chat_tts_settings.
    ttsDefaults: {
        tts_enabled: 1,
        read_chat: 1,
        read_tips: 1,
        read_redemptions: 1,
        voice: 'default',
        volume: 100,
        rate: 100,
        pitch: 100,
        max_length: 250,
        min_tip_amount: 0,
        filter_links: 1,
        filter_emotes: 1,
        queue_limit: 20,
    },
};
