'use strict';

const fs = require('fs');
const path = require('path');
const { MediaClient, CommunityClient } = require('@openvibe/sdk');

const MAX_CANONICAL_FEED_ITEMS = 200;
const HOME_VOD_LIMIT = 12;
const HOME_CLIP_LIMIT = 12;
const HOME_PASTE_LIMIT = 10;
const CHANNEL_MEDIA_LIMIT = 24;

function safeNumber(value, fallback) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : (fallback == null ? 0 : fallback);
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

function buildPlaybackUrl(mediaBaseUrl, mediaId) {
    if (!mediaBaseUrl || !mediaId) return null;
    return `${String(mediaBaseUrl).replace(/\/$/, '')}/api/v1/media/${encodeURIComponent(String(mediaId))}/playback?redirect=true`;
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

    function resolveExistingFile(dirPath, fileName) {
        if (!dirPath || !fileName) return null;
        const safeName = path.basename(String(fileName));
        const fullPath = path.join(dirPath, safeName);
        return fs.existsSync(fullPath) ? fullPath : null;
    }

    function channelContextForMedia(record) {
        const metadata = record && record.metadata || {};
        const streamId = metadata.stream_session_id ? String(metadata.stream_session_id) : null;
        const liveStream = streamId ? model.getStreamById(streamId) : null;
        const channelSlug = liveStream && liveStream.channel_slug
            ? liveStream.channel_slug
            : (metadata.channel_slug ? String(metadata.channel_slug) : null);
        const channel = channelSlug ? model.getChannelBySlug(channelSlug) : null;
        return { metadata, liveStream, channel, channelSlug };
    }

    function normalizeMediaRecord(record, kind) {
        if (!record) return null;
        const { metadata, liveStream, channel, channelSlug } = channelContextForMedia(record);
        const legacyId = parseLegacyMediaId(kind, record.id);
        const title = String(metadata.title || record.title || `${kind === 'clip' ? 'Untitled clip' : 'Untitled VOD'}`);
        const status = String(record.status || 'initialized');
        const playbackReady = status === 'ready';
        const source = metadata.source || (liveStream && liveStream.source) || 'openvibe';
        const createdAt = record.created_at || metadata.created_at || (liveStream && (liveStream.ended_at || liveStream.started_at)) || null;
        const updatedAt = record.updated_at || createdAt || null;
        return {
            id: String(record.id),
            kind,
            legacy_id: legacyId,
            route_url: `/${kind}/${encodeURIComponent(legacyId || String(record.id))}`,
            cta_label: `Open ${kind} →`,
            title,
            channel_slug: channelSlug || null,
            channel_name: channel ? (channel.display_name || channel.slug) : (channelSlug || null),
            category: (liveStream && liveStream.category) || (channel && channel.category) || null,
            thumbnail_url: rewriteThumbnailUrl(metadata.thumbnail_url || (liveStream && liveStream.thumbnail_url) || null),
            created_at: createdAt,
            updated_at: updatedAt,
            ended_at: metadata.ended_at || (liveStream && liveStream.ended_at) || createdAt,
            started_at: metadata.started_at || (liveStream && liveStream.started_at) || createdAt,
            duration_seconds: safeNumber(metadata.duration_seconds),
            view_count: safeNumber(metadata.view_count),
            playback_ready: playbackReady,
            playback_url: buildPlaybackUrl(config.media && config.media.url, record.id),
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

    async function listCanonicalMedia(kind, channelSlug, limit) {
        if (!mediaClient) return [];
        const namespace = kind === 'clip' ? 'live.clips' : 'live.vods';
        try {
            const response = await mediaClient.listMedia({
                namespace,
                visibility: 'public',
                limit: MAX_CANONICAL_FEED_ITEMS,
            });
            const normalized = Array.isArray(response && response.items)
                ? response.items
                    .map((item) => normalizeMediaRecord(item, kind))
                    .filter(Boolean)
                    .filter((item) => !channelSlug || item.channel_slug === channelSlug)
                : [];
            return normalized.slice(0, Math.max(1, safeNumber(limit, HOME_VOD_LIMIT)));
        } catch (_error) {
            return [];
        }
    }

    async function listCanonicalMediaWithCount(kind, channelSlug, limit) {
        if (!mediaClient) return { items: [], total: 0 };
        const namespace = kind === 'clip' ? 'live.clips' : 'live.vods';
        try {
            const response = await mediaClient.listMedia({
                namespace,
                visibility: 'public',
                limit: MAX_CANONICAL_FEED_ITEMS,
            });
            const normalized = Array.isArray(response && response.items)
                ? response.items
                    .map((item) => normalizeMediaRecord(item, kind))
                    .filter(Boolean)
                    .filter((item) => !channelSlug || item.channel_slug === channelSlug)
                : [];
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
        try {
            const [threads, pastes, relays] = await Promise.all([
                communityClient.listThreads({ visibility: 'public', limit: 8 }),
                communityClient.listPastes({ visibility: 'public', limit: HOME_PASTE_LIMIT }),
                communityClient.listRelays(),
            ]);
            return {
                recentThreads: Array.isArray(threads && threads.items) ? threads.items.slice(0, 8) : [],
                recentPastes: Array.isArray(pastes && pastes.items) ? pastes.items.slice(0, HOME_PASTE_LIMIT).map(normalizePasteRecord).filter(Boolean) : [],
                discordRelays: Array.isArray(relays && relays.items) ? relays.items.slice(0, 8) : [],
            };
        } catch (_error) {
            return Promise.resolve(buildCommunityFallback());
        }
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
