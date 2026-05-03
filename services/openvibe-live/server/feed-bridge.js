'use strict';

const fs = require('fs');
const path = require('path');
const { MediaClient, CommunityClient } = require('@openvibe/sdk');

const MAX_CANONICAL_FEED_ITEMS = 200;
const HOME_VOD_LIMIT = 12;
const HOME_CLIP_LIMIT = 12;
const HOME_PASTE_LIMIT = 10;
const CHANNEL_MEDIA_LIMIT = 24;
const DEFAULT_HOME_FEED_CACHE_TTL_MS = 15000;
const DEFAULT_REMOTE_TIMEOUT_MS = 4000;
const DEFAULT_MEDIA_PUBLIC_PLAYBACK_MAX_BYTES = 500 * 1024 * 1024;
const MIME_TYPE_BY_EXTENSION = Object.freeze({
    '.aac': 'audio/aac',
    '.flac': 'audio/flac',
    '.gif': 'image/gif',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.json': 'application/json; charset=utf-8',
    '.m3u8': 'application/vnd.apple.mpegurl',
    '.m4a': 'audio/mp4',
    '.m4v': 'video/mp4',
    '.mkv': 'video/x-matroska',
    '.mov': 'video/quicktime',
    '.mp3': 'audio/mpeg',
    '.mp4': 'video/mp4',
    '.mpeg': 'video/mpeg',
    '.mpg': 'video/mpeg',
    '.oga': 'audio/ogg',
    '.ogg': 'audio/ogg',
    '.ogv': 'video/ogg',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ts': 'video/mp2t',
    '.wav': 'audio/wav',
    '.webm': 'video/webm',
    '.webp': 'image/webp',
});

function safeNumber(value, fallback) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : (fallback == null ? 0 : fallback);
}

function firstString(...values) {
    for (const value of values) {
        const normalized = String(value == null ? '' : value).trim();
        if (normalized) return normalized;
    }
    return null;
}

function rewriteThumbnailUrl(rawUrl) {
    const value = String(rawUrl || '').trim();
    if (!value) return null;
    const match = value.match(/\/api\/thumbnails\/([^/?#]+)/i);
    if (!match) return value;
    return `/api/thumbnails/${encodeURIComponent(match[1])}`;
}

function rewritePasteAssetUrl(rawPath) {
    const value = String(rawPath || '').trim();
    if (!value) return null;
    return `/api/community-assets/${encodeURIComponent(path.basename(value))}`;
}

function inferMimeTypeFromValue(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;
    const withoutQuery = raw.split(/[?#]/, 1)[0];
    const ext = path.extname(withoutQuery).toLowerCase();
    return MIME_TYPE_BY_EXTENSION[ext] || null;
}

function resolveMediaMimeType(record, metadata) {
    const source = metadata || record && record.metadata || {};
    const directMimeType = String(record && record.mime_type || source.mime_type || '').trim();
    if (directMimeType) return directMimeType;
    const candidates = [
        record && record.storage_key,
        record && record.public_url,
        source.storage_key,
        source.public_url,
        source.file_name,
        source.original_file_name,
        source.original_filename,
        source.legacy_path,
    ];
    for (const candidate of candidates) {
        const inferred = inferMimeTypeFromValue(candidate);
        if (inferred) return inferred;
    }
    return null;
}

function parseLegacyMediaId(kind, mediaId) {
    const value = String(mediaId || '').trim();
    if (!value) return null;
    const match = value.match(new RegExp(`^media:hobostreamer-${kind}:(.+)$`, 'i'));
    return match ? match[1] : null;
}

function normalizeStats(stats, overrides) {
    const base = Object.assign({}, stats || {});
    const keys = ['live_now', 'channels', 'vods', 'total_streams', 'current_viewers', 'peak_live_viewers', 'clips', 'categories', 'stream_time_seconds'];
    for (const key of keys) {
        if (base[key] != null) base[key] = safeNumber(base[key]);
    }
    const extra = overrides || {};
    base.vods = Math.max(safeNumber(base.vods), safeNumber(extra.vods));
    base.clips = Math.max(safeNumber(base.clips), safeNumber(extra.clips));
    return base;
}

function buildPlaybackApiUrl(mediaBaseUrl, mediaId) {
    if (!mediaBaseUrl || !mediaId) return null;
    return `${String(mediaBaseUrl).replace(/\/$/, '')}/api/v1/media/${encodeURIComponent(String(mediaId))}/playback?redirect=true`;
}

function buildPlaybackFileUrl(mediaBaseUrl, mediaId) {
    if (!mediaBaseUrl || !mediaId) return null;
    return `${String(mediaBaseUrl).replace(/\/$/, '')}/files/${encodeURIComponent(String(mediaId))}`;
}

function cloneValue(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
}

function createAsyncTimedCache(ttlMs) {
    let entry = null;
    let pending = null;
    return {
        async getOrLoad(loader) {
            const now = Date.now();
            if (entry && entry.expiresAt > now) {
                return cloneValue(entry.value);
            }
            if (pending) {
                return cloneValue(await pending);
            }
            pending = Promise.resolve().then(loader);
            try {
                const value = await pending;
                pending = null;
                entry = ttlMs > 0
                    ? { value: cloneValue(value), expiresAt: Date.now() + ttlMs }
                    : null;
                return cloneValue(value);
            } catch (error) {
                pending = null;
                throw error;
            }
        },
        clear() {
            entry = null;
            pending = null;
        },
    };
}

async function withTimeout(promise, timeoutMs, fallbackValue) {
    const timeout = Math.max(0, Number(timeoutMs) || 0);
    if (!timeout) return promise;
    let timer = null;
    try {
        return await Promise.race([
            promise,
            new Promise((resolve) => {
                timer = setTimeout(() => resolve(cloneValue(fallbackValue)), timeout);
            }),
        ]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}

function derivePlaybackState(record, config, metadata) {
    const source = metadata || record && record.metadata || {};
    const mediaId = record && record.id ? String(record.id) : null;
    const sizeBytes = Math.max(0, safeNumber(record && record.size_bytes, 0));
    const mimeType = resolveMediaMimeType(record, source);
    const hasBacking = !!String(record && record.storage_key || '').trim() || !!String(record && record.public_url || '').trim();
    const publicPlaybackMaxBytes = Math.max(0, safeNumber(config && config.mediaPublicPlaybackMaxBytes, DEFAULT_MEDIA_PUBLIC_PLAYBACK_MAX_BYTES));
    const withinApiSizeGuard = !sizeBytes || sizeBytes <= publicPlaybackMaxBytes;
    const playbackApiUrl = buildPlaybackApiUrl(config && config.media && config.media.url, mediaId);
    const playbackFileUrl = buildPlaybackFileUrl(config && config.media && config.media.url, mediaId);
    const playbackReady = !!(mediaId && hasBacking && mimeType);
    return {
        playbackReady,
        playbackUrl: playbackReady ? playbackFileUrl : null,
        playbackApiUrl,
        playbackApiReady: playbackReady && withinApiSizeGuard,
        playbackMode: playbackReady ? (withinApiSizeGuard ? 'file-direct' : 'file-direct-oversize') : 'pending',
        playbackNote: playbackReady && !withinApiSizeGuard
            ? 'Direct OpenVibe media file playback is being used because the canonical playback API blocks oversized objects until they are repartitioned.'
            : null,
        playbackMimeType: mimeType,
        playbackBlockedReason: !playbackReady
            ? (hasBacking ? 'mime_type_unknown' : 'backing_pending')
            : (!withinApiSizeGuard ? 'api_size_guard' : null),
    };
}

function createFeedBridge(options) {
    const opts = options || {};
    const config = opts.config || {};
    const model = opts.model;
    const buildCommunityFallback = typeof opts.buildCommunityFallback === 'function'
        ? opts.buildCommunityFallback
        : (() => ({ recentThreads: [], recentPastes: [], discordRelays: [] }));
    const buildChatFallback = typeof opts.buildChatFallback === 'function'
        ? opts.buildChatFallback
        : (() => ({ publicRooms: [], activeCalls: [] }));

    if (!model) throw new Error('createFeedBridge: model required');

    const mediaClient = config.media && config.media.url
        ? new MediaClient({ mediaUrl: config.media.url, internalKey: config.internalKey, service: 'openvibe-live' })
        : null;
    const communityClient = config.community && config.community.url
        ? new CommunityClient({ communityUrl: config.community.url, internalKey: config.internalKey, service: 'openvibe-live' })
        : null;

    const legacyRoot = config.legacy && config.legacy.hobostreamerRoot
        ? path.resolve(String(config.legacy.hobostreamerRoot))
        : null;
    const legacyThumbnailDir = legacyRoot ? path.join(legacyRoot, 'data', 'thumbnails') : null;
    const legacyPasteScreenshotDir = legacyRoot ? path.join(legacyRoot, 'data', 'pastes', 'screenshots') : null;
    const remoteTimeoutMs = Math.max(0, safeNumber(config.remoteTimeoutMs, DEFAULT_REMOTE_TIMEOUT_MS));
    const cacheTtlMs = Math.max(0, safeNumber(config.homeFeedCacheTtlMs, DEFAULT_HOME_FEED_CACHE_TTL_MS));
    const canonicalMediaCache = new Map();
    const communityCache = createAsyncTimedCache(cacheTtlMs);

    function resolveExistingFile(dirPath, fileName) {
        if (!dirPath || !fileName) return null;
        const safeName = path.basename(String(fileName));
        const fullPath = path.join(dirPath, safeName);
        return fs.existsSync(fullPath) ? fullPath : null;
    }

    function channelContextForMedia(record) {
        const metadata = record && record.metadata || {};
        const nestedMetadata = metadata.metadata && typeof metadata.metadata === 'object'
            ? metadata.metadata
            : {};
        const streamId = firstString(
            metadata.stream_session_id,
            metadata.source_stream_id,
            metadata.stream_id,
            nestedMetadata.stream_session_id,
            nestedMetadata.source_stream_id,
            nestedMetadata.stream_id
        );
        const liveStream = streamId ? model.getStreamById(streamId) : null;
        let channelSlug = firstString(
            liveStream && liveStream.channel_slug,
            metadata.channel_slug,
            metadata.source_channel_slug,
            metadata.channel && metadata.channel.slug,
            nestedMetadata.channel_slug,
            nestedMetadata.source_channel_slug,
            nestedMetadata.channel && nestedMetadata.channel.slug
        );
        let channel = channelSlug ? model.getChannelBySlug(channelSlug) : null;
        const ownerUserId = firstString(
            channel && channel.owner_user_id,
            record && record.owner_type === 'user' ? record.owner_id : null,
            metadata.owner_user_id,
            metadata.creator_id,
            nestedMetadata.owner_user_id,
            nestedMetadata.creator_id,
            liveStream && liveStream.metadata && (liveStream.metadata.owner_user_id || liveStream.metadata.creator_id)
        );
        if (!channel && ownerUserId) {
            channel = model.getChannelByOwnerUserId(ownerUserId);
        }
        if (!channelSlug && channel) {
            channelSlug = channel.slug;
        }
        return { metadata, liveStream, channel, channelSlug, ownerUserId, nestedMetadata };
    }

    function normalizeMediaRecord(record, kind) {
        if (!record) return null;
        const { metadata, liveStream, channel, channelSlug, ownerUserId, nestedMetadata } = channelContextForMedia(record);
        const legacyId = parseLegacyMediaId(kind, record.id);
        const title = String(metadata.title || record.title || `${kind === 'clip' ? 'Untitled clip' : 'Untitled VOD'}`);
        const status = String(record.status || 'initialized');
        const source = metadata.source || (liveStream && liveStream.source) || 'openvibe';
        const createdAt = record.created_at || metadata.created_at || (liveStream && (liveStream.ended_at || liveStream.started_at)) || null;
        const updatedAt = record.updated_at || createdAt || null;
        const playback = derivePlaybackState(record, config, metadata);
        const fallbackChannelName = firstString(
            metadata.channel_name,
            metadata.display_name,
            metadata.username,
            nestedMetadata.channel_name,
            nestedMetadata.display_name,
            nestedMetadata.username,
            channelSlug
        );
        return {
            id: String(record.id),
            kind,
            legacy_id: legacyId,
            route_url: `/${kind}/${encodeURIComponent(legacyId || String(record.id))}`,
            cta_label: `Open ${kind} →`,
            title,
            channel_slug: channelSlug || null,
            channel_name: channel ? (channel.display_name || channel.slug) : fallbackChannelName,
            owner_user_id: ownerUserId,
            category: (liveStream && liveStream.category) || (channel && channel.category) || null,
            thumbnail_url: rewriteThumbnailUrl(metadata.thumbnail_url || (liveStream && liveStream.thumbnail_url) || null),
            created_at: createdAt,
            updated_at: updatedAt,
            ended_at: metadata.ended_at || (liveStream && liveStream.ended_at) || createdAt,
            started_at: metadata.started_at || (liveStream && liveStream.started_at) || createdAt,
            duration_seconds: safeNumber(metadata.duration_seconds),
            view_count: safeNumber(metadata.view_count),
            playback_ready: playback.playbackReady,
            playback_url: playback.playbackUrl,
            playback_api_url: playback.playbackApiUrl,
            playback_api_ready: playback.playbackApiReady,
            playback_mode: playback.playbackMode,
            playback_note: playback.playbackNote,
            playback_mime_type: playback.playbackMimeType,
            playback_blocked_reason: playback.playbackBlockedReason,
            status,
            source,
            is_live: false,
            viewer_count: 0,
            peak_viewers: safeNumber(metadata.view_count),
            has_clips: kind === 'vod' ? safeNumber(metadata.clip_count) > 0 : false,
            clip_count: safeNumber(metadata.clip_count),
            vod_media_id: kind === 'vod' ? String(record.id) : null,
            protocol: (liveStream && liveStream.protocol) || null,
            description: String(metadata.description || '').trim() || null,
            storage_key: record.storage_key || null,
            public_url: record.public_url || null,
            size_bytes: safeNumber(record.size_bytes),
            mime_type: record.mime_type || null,
        };
    }

    function normalizePasteRecord(record) {
        if (!record) return null;
        const metadata = record.metadata || {};
        return Object.assign({}, record, {
            kind: metadata.type || 'paste',
            image_url: rewritePasteAssetUrl(metadata.screenshot_path || null),
            route_url: config.community && config.community.url ? String(config.community.url).replace(/\/$/, '') : '/community',
            source: metadata.source || 'openvibe',
            preview_text: String(record.body || '').replace(/\s+/g, ' ').trim(),
        });
    }

    async function getCachedCanonicalMedia(kind) {
        if (!mediaClient) return [];
        const cacheKey = String(kind || 'vod');
        let cache = canonicalMediaCache.get(cacheKey);
        if (!cache) {
            cache = createAsyncTimedCache(cacheTtlMs);
            canonicalMediaCache.set(cacheKey, cache);
        }
        const namespace = kind === 'clip' ? 'live.clips' : 'live.vods';
        return cache.getOrLoad(async () => {
            const response = await withTimeout(mediaClient.listMedia({
                namespace,
                visibility: 'public',
                limit: MAX_CANONICAL_FEED_ITEMS,
            }), remoteTimeoutMs, { items: [] });
            return Array.isArray(response && response.items)
                ? response.items.map((item) => normalizeMediaRecord(item, kind)).filter(Boolean)
                : [];
        });
    }

    async function listCanonicalMedia(kind, channelSlug, limit) {
        try {
            const normalized = await getCachedCanonicalMedia(kind);
            return normalized
                .filter((item) => !channelSlug || item.channel_slug === channelSlug)
                .slice(0, Math.max(1, safeNumber(limit, HOME_VOD_LIMIT)));
        } catch (_error) {
            return [];
        }
    }

    async function listCanonicalMediaWithCount(kind, channelSlug, limit) {
        try {
            const normalized = (await getCachedCanonicalMedia(kind))
                .filter((item) => !channelSlug || item.channel_slug === channelSlug);
            return {
                items: normalized.slice(0, Math.max(1, safeNumber(limit, HOME_VOD_LIMIT))),
                total: normalized.length,
            };
        } catch (_error) {
            return { items: [], total: 0 };
        }
    }

    async function buildCommunityViewModel() {
        if (!communityClient) return Promise.resolve(buildCommunityFallback());
        return communityCache.getOrLoad(async () => {
            try {
                const [threads, pastes, relays] = await Promise.all([
                    withTimeout(communityClient.listThreads({ visibility: 'public', limit: 8 }), remoteTimeoutMs, { items: [] }),
                    withTimeout(communityClient.listPastes({ visibility: 'public', limit: HOME_PASTE_LIMIT }), remoteTimeoutMs, { items: [] }),
                    withTimeout(communityClient.listRelays(), remoteTimeoutMs, { items: [] }),
                ]);
                return {
                    recentThreads: Array.isArray(threads && threads.items) ? threads.items.slice(0, 8) : [],
                    recentPastes: Array.isArray(pastes && pastes.items) ? pastes.items.slice(0, HOME_PASTE_LIMIT).map(normalizePasteRecord).filter(Boolean) : [],
                    discordRelays: Array.isArray(relays && relays.items) ? relays.items.slice(0, 8) : [],
                };
            } catch (_error) {
                return buildCommunityFallback();
            }
        });
    }

    async function buildHomeViewModel() {
        const channels = model.listChannels({ limit: 50 });
        const featuredChannels = model.listFeaturedChannels({ limit: 8 });
        const trendingNow = model.listTrendingStreams({ limit: 6 });
        const liveNow = model.listLiveNow({ limit: 12 });
        const recentlyEnded = model.listRecentlyEnded({ limit: 12 });
        const recentlyOnlineChannels = recentlyEnded.reduce((list, stream) => {
            if (!stream || !stream.channel_slug || list.some((entry) => entry.slug === stream.channel_slug)) return list;
            const channel = model.getChannelBySlug(stream.channel_slug);
            if (!channel) return list;
            list.push(Object.assign({}, channel, { stats: model.getChannelStats(stream.channel_slug), recentStream: stream }));
            return list;
        }, []);

        const [vods, clips, community, chat] = await Promise.all([
            listCanonicalMediaWithCount('vod', null, HOME_VOD_LIMIT),
            listCanonicalMediaWithCount('clip', null, HOME_CLIP_LIMIT),
            buildCommunityViewModel(),
            Promise.resolve(buildChatFallback()),
        ]);

        return {
            channels,
            featuredChannels,
            trendingNow,
            liveNow,
            recentlyEnded,
            recentlyOnlineChannels,
            recentVods: vods.items,
            recentClips: clips.items,
            categories: model.listTopCategories({ limit: 10 }),
            stats: normalizeStats(model.getHomeStats(), { vods: vods.total, clips: clips.total }),
            community,
            chat,
        };
    }

    async function buildChannelMedia(channelSlug) {
        const [vods, clips] = await Promise.all([
            listCanonicalMediaWithCount('vod', channelSlug, CHANNEL_MEDIA_LIMIT),
            listCanonicalMediaWithCount('clip', channelSlug, CHANNEL_MEDIA_LIMIT),
        ]);
        return { vods, clips };
    }

    async function getCanonicalMedia(kind, id) {
        if (!mediaClient || !id) return null;
        const value = String(id).trim();
        const candidates = value.startsWith('media:')
            ? [value]
            : [`media:hobostreamer-${kind}:${value}`, value];
        for (const candidateId of candidates) {
            try {
                const response = await mediaClient.getMedia(candidateId);
                if (!response || !response.media) continue;
                return normalizeMediaRecord(response.media, kind);
            } catch (error) {
                if (error && error.status === 404) continue;
            }
        }
        return null;
    }

    function resolveLegacyThumbnailPath(fileName) {
        return resolveExistingFile(legacyThumbnailDir, fileName);
    }

    function resolveLegacyPasteAssetPath(fileName) {
        return resolveExistingFile(legacyPasteScreenshotDir, fileName);
    }

    return {
        buildCommunityViewModel,
        buildHomeViewModel,
        buildChannelMedia,
        listCanonicalVods(query) {
            const q = query || {};
            return listCanonicalMedia('vod', q.channelSlug || null, q.limit == null ? HOME_VOD_LIMIT : q.limit);
        },
        listCanonicalClips(query) {
            const q = query || {};
            return listCanonicalMedia('clip', q.channelSlug || null, q.limit == null ? HOME_CLIP_LIMIT : q.limit);
        },
        getCanonicalMedia,
        resolveLegacyThumbnailPath,
        resolveLegacyPasteAssetPath,
    };
}

module.exports = {
    createFeedBridge,
    parseLegacyMediaId,
    rewriteThumbnailUrl,
    rewritePasteAssetUrl,
};
