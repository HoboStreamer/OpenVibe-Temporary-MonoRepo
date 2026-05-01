'use strict';

require('dotenv').config();

const path = require('path');
const { resolveAuthIssuer, resolvePublicOrigin } = require('@openvibe/sdk/url-defaults');

const port = parseInt(process.env.PORT, 10) || 5200;

module.exports = {
    port,
    host: process.env.HOST || '0.0.0.0',
    nodeEnv: process.env.NODE_ENV || 'development',
    serviceId: 'openvibe-games',

    internalKey: process.env.INTERNAL_API_KEY || 'change-me-in-production',

    db: {
        path: process.env.DB_PATH || path.resolve(process.cwd(), 'data/openvibe-games.db'),
    },

    publicBaseUrl: resolvePublicOrigin({ surface: 'games', envKeys: ['PUBLIC_BASE_URL', 'OPENVIBE_GAMES_URL'] }),

    events: {
        url: process.env.OPENVIBE_EVENTS_URL || 'http://127.0.0.1:4400',
    },

    network: {
        url: resolvePublicOrigin({ surface: 'network' }),
    },

    media: {
        url: resolvePublicOrigin({ surface: 'media' }),
    },

    chat: {
        url: resolvePublicOrigin({ surface: 'chat' }),
    },

    billing: {
        url: resolvePublicOrigin({ surface: 'billing' }),
    },

    ai: {
        url: resolvePublicOrigin({ surface: 'ai' }),
    },

    community: {
        url: resolvePublicOrigin({ surface: 'community' }),
    },

    my: {
        url: resolvePublicOrigin({ surface: 'my' }),
    },

    auth: {
        issuer: resolveAuthIssuer(),
        url: resolvePublicOrigin({ surface: 'auth' }),
        publicKeyPath: process.env.OPENVIBE_AUTH_PUBLIC_KEY || path.resolve(__dirname, '..', '..', 'openvibe-network', 'data', 'keys', 'openvibe-public.pem'),
        jwksUrl: process.env.OPENVIBE_AUTH_JWKS_URL || null,
        cookieNames: ['openvibe_token', 'hobo_token', 'token'],
    },

    canvas: {
        width: parseInt(process.env.OPENVIBE_GAMES_CANVAS_WIDTH, 10) || 128,
        height: parseInt(process.env.OPENVIBE_GAMES_CANVAS_HEIGHT, 10) || 128,
        tileCooldownSeconds: parseInt(process.env.OPENVIBE_GAMES_CANVAS_TILE_COOLDOWN_SECONDS, 10) || 15,
        placementsPerMinute: parseInt(process.env.OPENVIBE_GAMES_CANVAS_PLACEMENTS_PER_MINUTE, 10) || 8,
    },

    realtime: {
        path: process.env.OPENVIBE_GAMES_REALTIME_PATH || '/games/realtime',
        tickRate: parseInt(process.env.OPENVIBE_GAMES_TICK_RATE, 10) || 20,
    },
};
