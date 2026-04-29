'use strict';

require('dotenv').config();

const path = require('path');

const {
    resolvePublicOrigin,
    trimUrl,
} = require('@openvibe/sdk/url-defaults');

const PUBLIC_MEDIA_OBJECT_MAX_BYTES = 500 * 1024 * 1024;
const TARGET_PUBLIC_OBJECT_MAX_BYTES = 256 * 1024 * 1024;
const WARN_PUBLIC_OBJECT_BYTES = 384 * 1024 * 1024;

function numberFromEnv(value, fallbackValue) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallbackValue;
}

module.exports = {
    port: parseInt(process.env.PORT, 10) || 5500,
    host: process.env.HOST || '0.0.0.0',
    nodeEnv: process.env.NODE_ENV || 'development',
    serviceId: 'openvibe-content',
    aiUrl: trimUrl(process.env.OPENVIBE_AI_URL || ''),
    networkUrl: trimUrl(process.env.OPENVIBE_NETWORK_URL || ''),
    realtimeUrl: trimUrl(process.env.OPENVIBE_REALTIME_URL || ''),
    db: {
        path: process.env.OPENVIBE_CONTENT_DB_PATH || path.resolve(__dirname, '..', 'data', 'openvibe-content.db'),
    },
    limits: {
        publicMediaObjectMaxBytes: numberFromEnv(process.env.OPENVIBE_MEDIA_PUBLIC_PLAYBACK_MAX_BYTES, PUBLIC_MEDIA_OBJECT_MAX_BYTES),
        targetPublicObjectBytes: numberFromEnv(process.env.OPENVIBE_MEDIA_TARGET_PUBLIC_OBJECT_BYTES, TARGET_PUBLIC_OBJECT_MAX_BYTES),
        warnPublicObjectBytes: numberFromEnv(process.env.OPENVIBE_MEDIA_WARN_PUBLIC_OBJECT_BYTES, WARN_PUBLIC_OBJECT_BYTES),
    },
    surfaces: {
        codes: resolvePublicOrigin({ surface: 'codes' }),
        blog: resolvePublicOrigin({ surface: 'blog' }),
        wiki: resolvePublicOrigin({ surface: 'wiki' }),
        news: resolvePublicOrigin({ surface: 'news' }),
        reviews: resolvePublicOrigin({ surface: 'reviews' }),
        deals: resolvePublicOrigin({ surface: 'deals' }),
        coupons: resolvePublicOrigin({ surface: 'coupons' }),
        trade: resolvePublicOrigin({ surface: 'trade' }),
    },
    PUBLIC_MEDIA_OBJECT_MAX_BYTES,
    TARGET_PUBLIC_OBJECT_MAX_BYTES,
    WARN_PUBLIC_OBJECT_BYTES,
};
