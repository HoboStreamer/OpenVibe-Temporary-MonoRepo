'use strict';

require('dotenv').config();

const path = require('path');
const { resolveAuthIssuer, resolvePublicOrigin } = require('@openvibe/sdk/url-defaults');

const port = parseInt(process.env.PORT, 10) || 4800;

module.exports = {
    port,
    host:      process.env.HOST || '0.0.0.0',
    nodeEnv:   process.env.NODE_ENV || 'development',
    serviceId: 'openvibe-chat',

    internalKey: process.env.INTERNAL_API_KEY || 'change-me-in-production',

    db: {
        path: process.env.DB_PATH || path.resolve(process.cwd(), 'data/openvibe-chat.db'),
    },

    publicBaseUrl: resolvePublicOrigin({ surface: 'chat', envKeys: ['PUBLIC_BASE_URL', 'OPENVIBE_CHAT_URL'] }),

    events: {
        url: process.env.OPENVIBE_EVENTS_URL || 'http://127.0.0.1:4400',
    },

    network: {
        url: resolvePublicOrigin({ surface: 'network' }),
    },

    media: {
        url: resolvePublicOrigin({ surface: 'media' }),
    },

    live: {
        url: resolvePublicOrigin({ surface: 'live' }),
    },

    auth: {
        issuer:  resolveAuthIssuer(),
        publicKeyPath: process.env.OPENVIBE_AUTH_PUBLIC_KEY || path.resolve(__dirname, '..', '..', 'openvibe-network', 'data', 'keys', 'openvibe-public.pem'),
        jwksUrl: process.env.OPENVIBE_AUTH_JWKS_URL || null,
        cookieNames: ['openvibe_token', 'token'],
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
