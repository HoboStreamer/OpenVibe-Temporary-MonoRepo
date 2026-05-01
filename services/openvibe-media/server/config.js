'use strict';

require('dotenv').config();

const path = require('path');
const {
    resolveAuthIssuer,
    resolveInternalOrigin,
    resolvePublicOrigin,
} = require('@openvibe/sdk/url-defaults');

const PUBLIC_MEDIA_OBJECT_MAX_BYTES = 500 * 1024 * 1024;
const TARGET_PUBLIC_OBJECT_MAX_BYTES = 256 * 1024 * 1024;
const WARN_PUBLIC_OBJECT_BYTES = 384 * 1024 * 1024;

const port = parseInt(process.env.PORT, 10) || 4500;
const hotRoot = process.env.OPENVIBE_MEDIA_HOT_ROOT
    || process.env.STORAGE_ROOT
    || path.resolve(process.cwd(), 'data/storage/hot');
const multipartRoot = process.env.OPENVIBE_MEDIA_MULTIPART_ROOT
    || path.resolve(process.cwd(), 'data/storage/multipart');
const publicBaseUrl = resolvePublicOrigin({
    surface: 'media',
    envKeys: ['OPENVIBE_MEDIA_PUBLIC_BASE_URL', 'PUBLIC_BASE_URL', 'OPENVIBE_MEDIA_URL'],
});
const defaultProvider = (process.env.OPENVIBE_MEDIA_PROVIDER || process.env.STORAGE_PROVIDER || 'local').toLowerCase();
const providerPolicy = (process.env.OPENVIBE_MEDIA_PROVIDER_POLICY
    || (process.env.OPENVIBE_MEDIA_CANONICAL_PROVIDER === 'b2' || process.env.OPENVIBE_MEDIA_COLD_PROVIDER === 'b2'
        ? 'b2-default-r2-on-demand'
        : 'legacy-auto-hot')).toLowerCase();
const canonicalProvider = (process.env.OPENVIBE_MEDIA_CANONICAL_PROVIDER
    || process.env.OPENVIBE_MEDIA_COLD_PROVIDER
    || defaultProvider).toLowerCase();
const defaultPlaybackProvider = (process.env.OPENVIBE_MEDIA_DEFAULT_PLAYBACK_PROVIDER || canonicalProvider).toLowerCase();
const hotProvider = (process.env.OPENVIBE_MEDIA_HOT_PROVIDER || defaultProvider).toLowerCase();
const assetOriginProvider = (process.env.OPENVIBE_MEDIA_ASSET_ORIGIN_PROVIDER || hotProvider || canonicalProvider).toLowerCase();

function boolFromEnv(value, fallbackValue) {
    if (value == null || value === '') return fallbackValue;
    return String(value).trim().toLowerCase() === 'true';
}

function numberFromEnv(value, fallbackValue) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallbackValue;
}

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
        provider: defaultProvider,
        providerPolicy,
        canonicalProvider,
        defaultPlaybackProvider,
        hotProvider,
        hotProviderEnabled: boolFromEnv(process.env.OPENVIBE_MEDIA_HOT_PROVIDER_ENABLED, providerPolicy !== 'b2-default-r2-on-demand'),
        r2AutoPromotionEnabled: boolFromEnv(process.env.OPENVIBE_MEDIA_R2_AUTO_PROMOTION_ENABLED, providerPolicy === 'b2-default-r2-on-demand'),
        r2RequireSiteHot: boolFromEnv(process.env.OPENVIBE_MEDIA_R2_REQUIRE_SITE_HOT, true),
        assetOriginProvider,
        root: hotRoot,
        hotRoot,
        multipartRoot,
        publicBaseUrl,
        scratchMaxBytes: numberFromEnv(process.env.OPENVIBE_MEDIA_SCRATCH_MAX_BYTES, 16 * 1024 * 1024),
        multipartThresholdBytes: numberFromEnv(process.env.OPENVIBE_MEDIA_MULTIPART_THRESHOLD_BYTES, 32 * 1024 * 1024),
        directUploadMaxBytes: numberFromEnv(process.env.OPENVIBE_MEDIA_DIRECT_UPLOAD_MAX_BYTES, 256 * 1024 * 1024),
        publicPlaybackMaxBytes: numberFromEnv(process.env.OPENVIBE_MEDIA_PUBLIC_PLAYBACK_MAX_BYTES, PUBLIC_MEDIA_OBJECT_MAX_BYTES),
        targetPublicObjectBytes: numberFromEnv(process.env.OPENVIBE_MEDIA_TARGET_PUBLIC_OBJECT_BYTES, TARGET_PUBLIC_OBJECT_MAX_BYTES),
        warnPublicObjectBytes: numberFromEnv(process.env.OPENVIBE_MEDIA_WARN_PUBLIC_OBJECT_BYTES, WARN_PUBLIC_OBJECT_BYTES),
        signedUrlTtlSeconds: numberFromEnv(process.env.OPENVIBE_MEDIA_SIGNED_URL_TTL_SECONDS, 900),
        thresholds: {
            site: {
                minUniqueVideoViewers7d: numberFromEnv(process.env.OPENVIBE_MEDIA_R2_SITE_MIN_UNIQUE_VIDEO_VIEWERS_7D, 500),
                minWatchMinutes7d: numberFromEnv(process.env.OPENVIBE_MEDIA_R2_SITE_MIN_WATCH_MINUTES_7D, 25000),
                minOriginEgressGb7d: numberFromEnv(process.env.OPENVIBE_MEDIA_R2_SITE_MIN_ORIGIN_EGRESS_GB_7D, 500),
                minConcurrentViewers: numberFromEnv(process.env.OPENVIBE_MEDIA_R2_SITE_MIN_CONCURRENT_VIEWERS, 75),
            },
            vod: {
                minUniqueViewers24h: numberFromEnv(process.env.OPENVIBE_MEDIA_R2_VOD_MIN_UNIQUE_VIEWERS_24H, 75),
                minUniqueViewers7d: numberFromEnv(process.env.OPENVIBE_MEDIA_R2_VOD_MIN_UNIQUE_VIEWERS_7D, 250),
                minWatchMinutes24h: numberFromEnv(process.env.OPENVIBE_MEDIA_R2_VOD_MIN_WATCH_MINUTES_24H, 1500),
                minWatchMinutes7d: numberFromEnv(process.env.OPENVIBE_MEDIA_R2_VOD_MIN_WATCH_MINUTES_7D, 5000),
                minCacheMissGb24h: numberFromEnv(process.env.OPENVIBE_MEDIA_R2_VOD_MIN_CACHE_MISS_GB_24H, 25),
                minCacheMissGb7d: numberFromEnv(process.env.OPENVIBE_MEDIA_R2_VOD_MIN_CACHE_MISS_GB_7D, 100),
            },
            clip: {
                minUniqueViewers24h: numberFromEnv(process.env.OPENVIBE_MEDIA_R2_CLIP_MIN_UNIQUE_VIEWERS_24H, 40),
                minUniqueViewers7d: numberFromEnv(process.env.OPENVIBE_MEDIA_R2_CLIP_MIN_UNIQUE_VIEWERS_7D, 150),
                minWatchMinutes24h: numberFromEnv(process.env.OPENVIBE_MEDIA_R2_CLIP_MIN_WATCH_MINUTES_24H, 300),
                minCacheMissGb24h: numberFromEnv(process.env.OPENVIBE_MEDIA_R2_CLIP_MIN_CACHE_MISS_GB_24H, 10),
            },
        },
        parting: {
            targetBytes: numberFromEnv(process.env.OPENVIBE_MEDIA_VOD_PART_TARGET_BYTES, TARGET_PUBLIC_OBJECT_MAX_BYTES),
            maxBytes: numberFromEnv(process.env.OPENVIBE_MEDIA_VOD_PART_MAX_BYTES, PUBLIC_MEDIA_OBJECT_MAX_BYTES),
            targetSeconds: numberFromEnv(process.env.OPENVIBE_MEDIA_VOD_PART_TARGET_SECONDS, 1800),
            maxSeconds: numberFromEnv(process.env.OPENVIBE_MEDIA_VOD_PART_MAX_SECONDS, 3600),
        },
        local: {
            root: hotRoot,
            multipartRoot,
            publicBaseUrl,
        },
        s3: {
            bucket:        process.env.OPENVIBE_S3_BUCKET || process.env.S3_BUCKET || null,
            region:        process.env.OPENVIBE_S3_REGION || process.env.S3_REGION || null,
            endpoint:      process.env.OPENVIBE_S3_ENDPOINT || process.env.S3_ENDPOINT || null,
            publicBaseUrl: process.env.OPENVIBE_S3_PUBLIC_BASE_URL || process.env.S3_PUBLIC_BASE_URL || null,
            accessKeyId:   process.env.OPENVIBE_S3_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || null,
            secretAccessKey: process.env.OPENVIBE_S3_SECRET_ACCESS_KEY || process.env.S3_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || null,
            forcePathStyle: boolFromEnv(process.env.OPENVIBE_S3_FORCE_PATH_STYLE, false),
        },
        b2: {
            bucket: process.env.OPENVIBE_MEDIA_B2_BUCKET || process.env.OPENVIBE_MEDIA_COLD_S3_BUCKET || null,
            region: process.env.OPENVIBE_MEDIA_B2_REGION || process.env.OPENVIBE_MEDIA_COLD_S3_REGION || 'us-west-004',
            endpoint: process.env.OPENVIBE_MEDIA_B2_ENDPOINT || process.env.OPENVIBE_MEDIA_COLD_S3_ENDPOINT || null,
            publicBaseUrl: process.env.OPENVIBE_MEDIA_B2_PUBLIC_BASE_URL || process.env.OPENVIBE_MEDIA_COLD_S3_PUBLIC_BASE_URL || null,
            accessKeyId: process.env.OPENVIBE_MEDIA_B2_KEY_ID || process.env.OPENVIBE_MEDIA_B2_ACCESS_KEY_ID || null,
            secretAccessKey: process.env.OPENVIBE_MEDIA_B2_APPLICATION_KEY || process.env.OPENVIBE_MEDIA_B2_SECRET_ACCESS_KEY || null,
            forcePathStyle: boolFromEnv(process.env.OPENVIBE_MEDIA_B2_FORCE_PATH_STYLE, true),
        },
        r2: {
            bucket: process.env.OPENVIBE_MEDIA_R2_BUCKET || null,
            region: process.env.OPENVIBE_MEDIA_R2_REGION || 'auto',
            endpoint: process.env.OPENVIBE_MEDIA_R2_ENDPOINT || null,
            publicBaseUrl: process.env.OPENVIBE_MEDIA_R2_PUBLIC_BASE_URL || null,
            accessKeyId: process.env.OPENVIBE_MEDIA_R2_ACCESS_KEY_ID || null,
            secretAccessKey: process.env.OPENVIBE_MEDIA_R2_SECRET_ACCESS_KEY || null,
            forcePathStyle: boolFromEnv(process.env.OPENVIBE_MEDIA_R2_FORCE_PATH_STYLE, false),
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
        redisUrl: process.env.OPENVIBE_REDIS_URL || '',
        queuePrefix: process.env.OPENVIBE_QUEUE_PREFIX || 'openvibe',
        queueName: process.env.OPENVIBE_MEDIA_PROCESSING_QUEUE || 'media-processing',
        useExternalQueue: String(process.env.OPENVIBE_MEDIA_USE_WORKERS || (process.env.OPENVIBE_REDIS_URL ? 'true' : 'false')).toLowerCase() === 'true',
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

    PUBLIC_MEDIA_OBJECT_MAX_BYTES,
    TARGET_PUBLIC_OBJECT_MAX_BYTES,
    WARN_PUBLIC_OBJECT_BYTES,
};
