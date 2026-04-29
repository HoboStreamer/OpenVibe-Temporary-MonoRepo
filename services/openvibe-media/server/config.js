'use strict';

require('dotenv').config();

const path = require('path');
const {
    resolveAuthIssuer,
    resolveInternalOrigin,
    resolvePublicOrigin,
} = require('@openvibe/sdk/url-defaults');

const port = parseInt(process.env.PORT, 10) || 4500;
const hotRoot = process.env.OPENVIBE_MEDIA_HOT_ROOT
    || process.env.STORAGE_ROOT
    || path.resolve(process.cwd(), 'data/storage/hot');
const publicBaseUrl = resolvePublicOrigin({
    surface: 'media',
    envKeys: ['OPENVIBE_MEDIA_PUBLIC_BASE_URL', 'PUBLIC_BASE_URL', 'OPENVIBE_MEDIA_URL'],
});

module.exports = {
    port,
    host:    process.env.HOST || '0.0.0.0',
    nodeEnv: process.env.NODE_ENV || 'development',
    serviceId: 'openvibe-media',

    internalKey: process.env.INTERNAL_API_KEY || 'change-me-in-production',

    db: {
        path: process.env.DB_PATH || path.resolve(process.cwd(), 'data/openvibe-media.db'),
    },

    storage: {
        provider: process.env.STORAGE_PROVIDER || 'local',
        root: hotRoot,
        hotRoot,
        publicBaseUrl,
        coldProvider: (process.env.OPENVIBE_MEDIA_COLD_PROVIDER || 'none').toLowerCase(),
        s3: {
            bucket:        process.env.OPENVIBE_S3_BUCKET || process.env.S3_BUCKET || null,
            region:        process.env.OPENVIBE_S3_REGION || process.env.S3_REGION || null,
            endpoint:      process.env.OPENVIBE_S3_ENDPOINT || process.env.S3_ENDPOINT || null,
            publicBaseUrl: process.env.OPENVIBE_S3_PUBLIC_BASE_URL || process.env.S3_PUBLIC_BASE_URL || null,
        },
        cold: {
            bucket: process.env.OPENVIBE_MEDIA_COLD_S3_BUCKET || process.env.OPENVIBE_S3_BUCKET || process.env.S3_BUCKET || null,
            region: process.env.OPENVIBE_MEDIA_COLD_S3_REGION || process.env.OPENVIBE_S3_REGION || process.env.S3_REGION || null,
            endpoint: process.env.OPENVIBE_MEDIA_COLD_S3_ENDPOINT || process.env.OPENVIBE_S3_ENDPOINT || process.env.S3_ENDPOINT || null,
            publicBaseUrl: process.env.OPENVIBE_MEDIA_COLD_S3_PUBLIC_BASE_URL || process.env.OPENVIBE_S3_PUBLIC_BASE_URL || process.env.S3_PUBLIC_BASE_URL || null,
        },
    },

    events: {
        url: process.env.OPENVIBE_EVENTS_URL || 'http://127.0.0.1:4400',
    },

    network: {
        url: resolvePublicOrigin({ surface: 'network' }),
        internalUrl: resolveInternalOrigin({
            envKeys: ['OPENVIBE_NETWORK_INTERNAL_URL'],
            publicEnvKeys: ['OPENVIBE_NETWORK_URL'],
            fallbackPort: 4100,
        }),
    },

    auth: {
        issuer:   resolveAuthIssuer(),
        jwksUrl:  process.env.OPENVIBE_AUTH_JWKS_URL || null,
        cookieNames: ['openvibe_token', 'hobo_token', 'token'],
    },

    processing: {
        intervalMs:  parseInt(process.env.PROCESSING_INTERVAL_MS, 10) || 1000,
        maxAttempts: parseInt(process.env.PROCESSING_MAX_ATTEMPTS, 10) || 5,
    },

    // Default per-namespace quota table. Concrete per-owner overrides live
    // in the media_quotas DB table; rows there take precedence.
    defaultQuotas: {
        // namespace → { max_storage_bytes, max_upload_bytes, max_file_count, allowed_mime_prefixes, allowed_types }
        'live.vods':              { max_storage_bytes: 500 * 1024 * 1024 * 1024, max_upload_bytes: 12 * 1024 * 1024 * 1024, max_file_count: 100000, allowed_mime_prefixes: ['video/'], allowed_types: ['vod'] },
        'live.clips':             { max_storage_bytes: 100 * 1024 * 1024 * 1024, max_upload_bytes: 2  * 1024 * 1024 * 1024,  max_file_count: 200000, allowed_mime_prefixes: ['video/'], allowed_types: ['clip'] },
        'live.thumbnails':        { max_storage_bytes: 5   * 1024 * 1024 * 1024, max_upload_bytes: 5  * 1024 * 1024,         max_file_count: 1000000, allowed_mime_prefixes: ['image/'], allowed_types: ['thumbnail', 'image'] },
        'live.stream_snapshots':  { max_storage_bytes: 5   * 1024 * 1024 * 1024, max_upload_bytes: 5  * 1024 * 1024,         max_file_count: 1000000, allowed_mime_prefixes: ['image/'], allowed_types: ['thumbnail', 'image'] },
        'live.media_requests':    { max_storage_bytes: 50  * 1024 * 1024 * 1024, max_upload_bytes: 100 * 1024 * 1024,         max_file_count: 100000,  allowed_mime_prefixes: ['image/', 'video/', 'audio/'], allowed_types: ['image', 'video', 'audio', 'attachment'] },
        'community.pastes':       { max_storage_bytes: 10  * 1024 * 1024 * 1024, max_upload_bytes: 10 * 1024 * 1024,          max_file_count: 100000,  allowed_mime_prefixes: ['image/', 'video/', 'application/'], allowed_types: ['image', 'file', 'attachment'] },
        'community.attachments':  { max_storage_bytes: 10  * 1024 * 1024 * 1024, max_upload_bytes: 25 * 1024 * 1024,          max_file_count: 100000,  allowed_mime_prefixes: [], allowed_types: ['attachment', 'image', 'video', 'file'] },
        'chat.attachments':       { max_storage_bytes: 5   * 1024 * 1024 * 1024, max_upload_bytes: 25 * 1024 * 1024,          max_file_count: 1000000, allowed_mime_prefixes: ['image/', 'video/'], allowed_types: ['attachment', 'image'] },
        'chat.tts_audio':         { max_storage_bytes: 1   * 1024 * 1024 * 1024, max_upload_bytes: 2  * 1024 * 1024,          max_file_count: 1000000, allowed_mime_prefixes: ['audio/'], allowed_types: ['audio'] },
        'user.profile_images':    { max_storage_bytes: 1   * 1024 * 1024 * 1024, max_upload_bytes: 5  * 1024 * 1024,          max_file_count: 1000,    allowed_mime_prefixes: ['image/'], allowed_types: ['image'] },
        'tools.images':           { max_storage_bytes: 5   * 1024 * 1024 * 1024, max_upload_bytes: 25 * 1024 * 1024,          max_file_count: 1000000, allowed_mime_prefixes: ['image/'], allowed_types: ['image', 'thumbnail'] },
        'games.assets':           { max_storage_bytes: 10  * 1024 * 1024 * 1024, max_upload_bytes: 50 * 1024 * 1024,          max_file_count: 1000000, allowed_mime_prefixes: [], allowed_types: ['image', 'audio', 'file'] },
        'wiki.assets':            { max_storage_bytes: 5   * 1024 * 1024 * 1024, max_upload_bytes: 25 * 1024 * 1024,          max_file_count: 100000,  allowed_mime_prefixes: ['image/', 'video/'], allowed_types: ['image', 'attachment'] },
        'blog.assets':            { max_storage_bytes: 5   * 1024 * 1024 * 1024, max_upload_bytes: 25 * 1024 * 1024,          max_file_count: 100000,  allowed_mime_prefixes: ['image/'], allowed_types: ['image'] },
    },
};
