'use strict';

require('dotenv').config();
const path = require('path');
const { resolveAuthIssuer, resolvePublicOrigin } = require('@openvibe/sdk/url-defaults');

const port = parseInt(process.env.PORT, 10) || 4600;
const LIVE_HOME_FEED_CACHE_TTL_MS = parseInt(process.env.OPENVIBE_LIVE_HOME_FEED_CACHE_TTL_MS, 10) || 15000;
const LIVE_REMOTE_TIMEOUT_MS = parseInt(process.env.OPENVIBE_LIVE_REMOTE_TIMEOUT_MS, 10) || 4000;
const MEDIA_PUBLIC_PLAYBACK_MAX_BYTES = parseInt(process.env.OPENVIBE_MEDIA_PUBLIC_PLAYBACK_MAX_BYTES, 10) || (500 * 1024 * 1024);

module.exports = {
    port,
    host:    process.env.HOST || '0.0.0.0',
    nodeEnv: process.env.NODE_ENV || 'development',
    serviceId: 'openvibe-live',
    publicBaseUrl: resolvePublicOrigin({ surface: 'live', envKeys: ['PUBLIC_BASE_URL', 'OPENVIBE_LIVE_URL'] }),
    homeFeedCacheTtlMs: LIVE_HOME_FEED_CACHE_TTL_MS,
    remoteTimeoutMs: LIVE_REMOTE_TIMEOUT_MS,
    mediaPublicPlaybackMaxBytes: MEDIA_PUBLIC_PLAYBACK_MAX_BYTES,

    internalKey: process.env.INTERNAL_API_KEY || 'change-me-in-production',

    db: { path: process.env.DB_PATH || path.resolve(process.cwd(), 'data/openvibe-live.db') },

    events:    { url: process.env.OPENVIBE_EVENTS_URL || 'http://127.0.0.1:4400' },
    network:   { url: resolvePublicOrigin({ surface: 'network' }) },
    stream:    { url: resolvePublicOrigin({ surface: 'restream' }) },
    media:     { url: process.env.OPENVIBE_MEDIA_URL || resolvePublicOrigin({ surface: 'media' }) },
    community: { url: process.env.OPENVIBE_COMMUNITY_URL || resolvePublicOrigin({ surface: 'community' }) },
    legacy: {
        hobostreamerRoot: process.env.OPENVIBE_HOBOSTREAMER_ROOT || '/opt/hobostreamer',
    },
    auth: {
        issuer: resolveAuthIssuer(),
        url: resolvePublicOrigin({ surface: 'auth' }),
        publicKeyPath: process.env.OPENVIBE_AUTH_PUBLIC_KEY || path.resolve(__dirname, '..', '..', 'openvibe-network', 'data', 'keys', 'openvibe-public.pem'),
        jwksUrl: process.env.OPENVIBE_AUTH_JWKS_URL || null,
        cookieNames: ['openvibe_token', 'hobo_token', 'token'],
    },

    // Phase 16: downstream product surfaces consulted by the integrations
    // model. URLs are nullable; absent URLs result in integrations being
    // truthfully recorded as 'unavailable'.
    services: {
        chat:    process.env.OPENVIBE_CHAT_URL    || null,
        billing: process.env.OPENVIBE_BILLING_URL || null,
        ai:      process.env.OPENVIBE_AI_URL      || null,
    },

    subscription: {
        enabled: process.env.LIVE_SUBSCRIBE_STREAM_EVENTS !== 'false',
        callbackUrl: process.env.LIVE_SUBSCRIBE_CALLBACK_URL || null,
    },
};
