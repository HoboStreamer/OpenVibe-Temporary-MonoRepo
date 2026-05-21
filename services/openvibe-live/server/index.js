'use strict';

const express = require('express');
const fs = require('fs');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const { attachIconAssets } = require('@openvibe/icons/express');
const { createServiceRuntime } = require('@openvibe/runtime');
const { requireOpenVibeAuth } = require('@openvibe/sdk');

const config = require('./config');
const db = require('./db');
const model = require('./model');
const ssr = require('./ssr');
const integrations = require('./integrations');
const { applyStreamEvent } = require('./ingestion');
const { createFeedBridge } = require('./feed-bridge');
const { buildAuthRouter } = require('./auth-routes');
const { buildAuthClient, optionalOpenVibeAuth, serviceActorMiddleware } = require('./middleware');
const { createOpenReClient } = require('./openre-client');
const { buildSessionResponse } = require('./session');
const { cacheStats: resolverCacheStats } = require('./channel-resolver');
const communityDb = require('../../openvibe-community/server/db');
const communityModel = require('../../openvibe-community/server/model');
const chatDb = require('../../openvibe-chat/server/db');
const chatModel = require('../../openvibe-chat/server/model');

function deriveBaseUrl(req) {
    const forwardedProto = req.headers['x-forwarded-proto'];
    const protocol = forwardedProto ? String(forwardedProto).split(',')[0].trim() : req.protocol;
    const host = req.get('host');
    return host ? `${protocol}://${host}` : config.publicBaseUrl;
}

function buildThumbnailPlaceholder(fileName, streamTitle) {
        const raw = streamTitle || String(fileName || 'openvibe-live')
                .replace(/\.[^.]+$/, '')
                .replace(/stream-session:[^:]+:\d+/i, '')
                .replace(/vod-\d+-\d+/i, '')
                .replace(/clip-\d+-\d+/i, '')
                .replace(/[^a-z0-9]+/gi, ' ')
                .trim();
        const label = (raw.trim() || 'openvibe live').slice(0, 32);
        const headline = label.toUpperCase();
        return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" role="img" aria-label="${headline}">
    <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#8b5cf6"/>
            <stop offset="55%" stop-color="#1e3a8a"/>
            <stop offset="100%" stop-color="#22d3ee"/>
        </linearGradient>
        <linearGradient id="shine" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="rgba(255,255,255,0)"/>
            <stop offset="50%" stop-color="rgba(255,255,255,0.16)"/>
            <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
        </linearGradient>
    </defs>
    <rect width="1280" height="720" rx="44" fill="url(#bg)"/>
    <circle cx="190" cy="156" r="220" fill="rgba(255,255,255,0.08)"/>
    <circle cx="1130" cy="570" r="250" fill="rgba(34,211,238,0.12)"/>
    <rect x="78" y="74" width="1124" height="572" rx="34" fill="rgba(7,16,31,0.42)" stroke="rgba(255,255,255,0.18)"/>
    <rect x="118" y="118" width="250" height="52" rx="26" fill="rgba(255,255,255,0.12)"/>
    <text x="146" y="151" fill="#e0e7ff" font-family="Arial, sans-serif" font-size="22" font-weight="700" letter-spacing="4">OPENVIBE LIVE</text>
    <text x="118" y="340" fill="#f8fbff" font-family="Arial, sans-serif" font-size="68" font-weight="800">${headline}</text>
    <rect x="118" y="510" width="404" height="74" rx="37" fill="rgba(255,255,255,0.10)" stroke="rgba(255,255,255,0.18)"/>
    <text x="154" y="557" fill="#ffffff" font-family="Arial, sans-serif" font-size="30" font-weight="700">openvibe.live</text>
</svg>`;
}

function channelPath(slug) {
    return `/@${encodeURIComponent(String(slug || 'unknown'))}`;
}

function streamPath(slug, streamId) {
    return `${channelPath(slug)}/s/${encodeURIComponent(String(streamId || 'unknown'))}`;
}

function requestSearch(req) {
    const originalUrl = String(req.originalUrl || '');
    const queryIndex = originalUrl.indexOf('?');
    return queryIndex === -1 ? '' : originalUrl.slice(queryIndex);
}

function publicFilePath(fileName) {
    return path.join(__dirname, '..', 'public', fileName);
}

function asyncRoute(handler) {
    return function wrappedAsyncRoute(req, res, next) {
        Promise.resolve(handler(req, res, next)).catch(next);
    };
}

function normalizeCreatorSlugInput(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48);
}

function sortByRecent(left, right) {
    const leftStamp = new Date(left && (left.updated_at || left.started_at || left.created_at || left.ended_at) || 0).getTime() || 0;
    const rightStamp = new Date(right && (right.updated_at || right.started_at || right.created_at || right.ended_at) || 0).getTime() || 0;
    return rightStamp - leftStamp;
}

function buildApp() {
    db.init(config.db.path);
    const authClient = buildAuthClient(config);
    const openreClient = createOpenReClient({ config });
    const requireUserAuth = requireOpenVibeAuth(authClient);
    const thumbnailDir = path.join(__dirname, '..', 'data', 'thumbnails');
    const optionalData = {
        community: false,
        chat: false,
    };

    try {
        communityDb.init(path.resolve(__dirname, '..', '..', 'openvibe-community', 'data', 'openvibe-community.db'));
        optionalData.community = true;
    } catch (error) {
        console.warn('[openvibe-live] community feed unavailable:', error.message);
    }

    try {
        chatDb.init(path.resolve(__dirname, '..', '..', 'openvibe-chat', 'data', 'openvibe-chat.db'));
        optionalData.chat = true;
    } catch (error) {
        console.warn('[openvibe-live] chat feed unavailable:', error.message);
    }

    function buildCommunityFallback() {
        if (!optionalData.community) {
            return {
                recentThreads: [],
                recentPastes: [],
                discordRelays: [],
            };
        }
        try {
            return {
                recentThreads: communityModel.listThreads({ limit: 10 }).filter((thread) => thread.visibility === 'public').slice(0, 6),
                recentPastes: communityModel.listPastes({ visibility: 'public', limit: 6 }),
                discordRelays: communityModel.listRelays().filter((relay) => relay.enabled).slice(0, 6),
            };
        } catch (error) {
            console.warn('[openvibe-live] failed to build community feed:', error.message);
            return {
                recentThreads: [],
                recentPastes: [],
                discordRelays: [],
            };
        }
    }

    function buildChatFallback() {
        if (!optionalData.chat) {
            return {
                publicRooms: [],
                activeCalls: [],
            };
        }
        try {
            return {
                publicRooms: chatModel.listRooms({ limit: 40 })
                    .filter((room) => room.visibility === 'public' && room.room_type !== 'dm')
                    .slice(0, 6),
                activeCalls: chatModel.listActiveCalls().slice(0, 6),
            };
        } catch (error) {
            console.warn('[openvibe-live] failed to build chat feed:', error.message);
            return {
                publicRooms: [],
                activeCalls: [],
            };
        }
    }

    const feedBridge = createFeedBridge({
        config,
        model,
        buildCommunityFallback,
        buildChatFallback,
    });

    function ownerUserIdOf(req) {
        return String(req && req.user && (req.user.sub || req.user.id) || '').trim();
    }

    function syncLiveChannel(channel, extra) {
        if (!channel || !channel.slug) return null;
        const extraData = extra || {};
        return model.upsertChannel({
            slug: channel.slug,
            display_name: channel.display_name || channel.slug,
            owner_user_id: channel.owner_user_id || extraData.owner_user_id || null,
            description: extraData.description || null,
            metadata: Object.assign({ source: 'openre-stream' }, channel.metadata || {}, extraData.metadata || {}),
        });
    }

    function syncLiveStream(stream, channel, extra) {
        if (!stream || !stream.id) return null;
        const extraData = extra || {};
        const syncedChannel = channel ? syncLiveChannel(channel, extraData.channel) : null;
        return model.upsertStream({
            id: stream.id,
            channel_slug: stream.channel_slug || (syncedChannel && syncedChannel.slug) || (channel && channel.slug) || null,
            channel_id: stream.channel_id || (channel && channel.id) || null,
            status: stream.status,
            title: stream.title,
            category: stream.category,
            vod_media_id: stream.vod_media_id || null,
            started_at: stream.started_at || null,
            ended_at: stream.ended_at || null,
            metadata: Object.assign({}, stream.metadata || {}, extraData.metadata || {}, {
                owner_user_id: (channel && channel.owner_user_id) || extraData.owner_user_id || null,
            }),
        });
    }

    function sendOpenReError(res, error, fallbackMessage) {
        const status = Number(error && error.status) || (error && error.code === 'ENETWORK' ? 502 : 500);
        const upstreamBody = error && error.body && typeof error.body === 'object' ? error.body : null;
        if (upstreamBody && upstreamBody.error) {
            return res.status(status).json(upstreamBody);
        }
        return res.status(status).json({ error: fallbackMessage || (error && error.message) || 'openre request failed' });
    }

    async function buildGoLiveDashboardState(req) {
        const ownerUserId = ownerUserIdOf(req);
        const channelsPayload = await openreClient.listChannels({ ownerUserId, token: req.token, limit: 24 });
        const channels = Array.isArray(channelsPayload && channelsPayload.items) ? channelsPayload.items : [];
        channels.forEach((channel) => syncLiveChannel(channel, { owner_user_id: ownerUserId }));

        const destinationsPayload = await openreClient.listDestinations({ ownerUserId, token: req.token });
        const destinations = Array.isArray(destinationsPayload && destinationsPayload.items) ? destinationsPayload.items : [];

        const streamGroups = await Promise.all(channels.map(async (channel) => {
            const payload = await openreClient.listStreams({ channelId: channel.id, token: req.token, limit: 8 });
            const items = Array.isArray(payload && payload.items) ? payload.items : [];
            return items.map((stream) => {
                const hydrated = Object.assign({}, stream, {
                    channel_slug: stream.channel_slug || channel.slug,
                    channel_display_name: channel.display_name || channel.slug,
                });
                syncLiveStream(hydrated, channel, { owner_user_id: ownerUserId });
                return hydrated;
            });
        }));

        return {
            channels,
            destinations,
            streams: streamGroups.flat().sort(sortByRecent).slice(0, 12),
            restream_url: config.stream.url,
            account_url: config.network.url,
        };
    }

    async function renderChannelRoute(req, res, slug) {
        const channel = model.getChannelBySlug(slug);
        if (!channel) {
            return res.status(404).type('html').send(ssr.renderOfflinePage({ slug, baseUrl: deriveBaseUrl(req) }));
        }
        const currentStream = model.getCurrentLiveStream(slug);
        const recentStreams = model.listStreams({ channel_slug: slug, limit: 20 });
        const channelMedia = await feedBridge.buildChannelMedia(slug);
        const baseChannelStats = model.getChannelStats(slug);
        const channelStats = Object.assign({}, baseChannelStats, {
            vods: Math.max(Number(baseChannelStats.vods || 0), channelMedia.vods.total),
            clips: Math.max(Number(baseChannelStats.clips || 0), channelMedia.clips.total),
        });
        const relatedChannels = model.listFeaturedChannels({ limit: 12 }).filter((candidate) => candidate.slug !== channel.slug).slice(0, 4);
        return res.type('html').send(ssr.renderChannelPage({
            channel,
            currentStream,
            recentStreams,
            recentVods: channelMedia.vods.items.slice(0, 6),
            recentClips: channelMedia.clips.items.slice(0, 6),
            channelStats,
            relatedChannels,
            baseUrl: deriveBaseUrl(req),
        }));
    }

    function renderStreamRoute(req, res, slug, streamId) {
        const stream = model.getStreamById(streamId);
        if (!stream) {
            return res.status(404).type('html').send(ssr.renderOfflinePage({ slug, baseUrl: deriveBaseUrl(req) }));
        }
        const channel = model.getChannelBySlug(slug);
        const moreFromChannel = model.listStreams({ channel_slug: slug, limit: 12 }).filter((item) => item.id !== stream.id).slice(0, 6);
        return res.type('html').send(ssr.renderStreamPage({ channel, stream, moreFromChannel, baseUrl: deriveBaseUrl(req) }));
    }

    async function renderMediaDetailRoute(req, res, kind, mediaId) {
        const item = await feedBridge.getCanonicalMedia(kind, mediaId);
        if (!item) {
            return res.status(404).type('html').send(ssr.renderMissingMediaPage({ kind, mediaId, baseUrl: deriveBaseUrl(req) }));
        }
        const channel = item.channel_slug ? model.getChannelBySlug(item.channel_slug) : null;
        const moreByCreator = item.channel_slug
            ? (await feedBridge.listCanonicalVods({ channelSlug: item.channel_slug, limit: 20 })).filter((v) => String(v.id) !== String(item.id))
            : [];
        return res.type('html').send(ssr.renderMediaDetailPage({ item, channel, moreByCreator, baseUrl: deriveBaseUrl(req) }));
    }

    const app = express();
    app.set('trust proxy', 1);
    app.use(helmet({ contentSecurityPolicy: false }));
    app.use(cors({ origin: true, credentials: true }));
    app.use(cookieParser());

    const runtime = createServiceRuntime({
        serviceName: config.serviceId || 'openvibe-live',
        getHealth: () => ({
            auth_issuer: config.auth && config.auth.issuer || null,
            persistence: db.describePersistence(),
            optional_dependencies: optionalData,
        }),
        getReadiness: () => ({
            persistence: db.describePersistence(),
            checks: [
                {
                    name: 'community_feed_bridge',
                    ok: !!optionalData.community,
                    critical: false,
                    details: { enabled: !!optionalData.community },
                    message: optionalData.community ? null : 'Community feed bridge is unavailable in this runtime.' ,
                },
                {
                    name: 'chat_feed_bridge',
                    ok: !!optionalData.chat,
                    critical: false,
                    details: { enabled: !!optionalData.chat },
                    message: optionalData.chat ? null : 'Chat feed bridge is unavailable in this runtime.',
                },
                {
                    name: 'public_base_url',
                    ok: !!config.publicBaseUrl,
                    critical: true,
                    details: { public_base_url: config.publicBaseUrl || null },
                },
                {
                    name: 'auth_issuer_configured',
                    ok: !!(config.auth && config.auth.issuer),
                    critical: true,
                    details: { issuer: config.auth && config.auth.issuer || null },
                },
            ],
        }),
    });
    runtime.attach(app);
    app.use(optionalOpenVibeAuth(authClient));
    app.use(buildAuthRouter({
        authClient,
        config,
        deriveBaseUrl,
        serviceName: 'openvibe.live',
    }));

    app.get('/api/thumbnails/:fileName', (req, res) => {
        const fileName = path.basename(String(req.params.fileName || 'thumbnail.svg'));
        const filePath = path.join(thumbnailDir, fileName);
        if (fs.existsSync(filePath)) {
            return res.sendFile(filePath);
        }
        const legacyThumbnailPath = feedBridge.resolveLegacyThumbnailPath(fileName);
        if (legacyThumbnailPath) {
            return res.sendFile(legacyThumbnailPath);
        }
        res.set('Cache-Control', 'public, max-age=300');
        return res.type('image/svg+xml').send(buildThumbnailPlaceholder(fileName));
    });

    app.get('/api/community-assets/:fileName', (req, res) => {
        const fileName = path.basename(String(req.params.fileName || 'asset'));
        const filePath = feedBridge.resolveLegacyPasteAssetPath(fileName);
        if (!filePath) {
            return res.status(404).json({ error: 'not found' });
        }
        return res.sendFile(filePath);
    });

    // ── SSR pages ────────────────────────────────────────────
    app.use((req, res, next) => {
        if (config.nodeEnv !== 'production') res.set('Cache-Control', 'no-store');
        next();
    });

    app.get('/', asyncRoute(async (req, res) => {
        res.type('html').send(ssr.renderHomePage({ ...(await feedBridge.buildHomeViewModel()), baseUrl: deriveBaseUrl(req) }));
    }));

    app.get('/channels', (req, res) => {
        const channels = model.listChannels({ limit: 200 });
        const recentStreamsMap = model.listRecentStreamsGroupedByChannel(600);
        const enrichedChannels = channels.map((ch) => Object.assign({}, ch, {
            recentStreams: recentStreamsMap.get(ch.slug) || [],
            recentStream: (recentStreamsMap.get(ch.slug) || [])[0] || null,
            stats: model.getChannelStats(ch.slug),
        }));
        const featuredChannels = model.listFeaturedChannels({ limit: 10 }).map((ch) => Object.assign({}, ch, {
            recentStreams: recentStreamsMap.get(ch.slug) || [],
            recentStream: (recentStreamsMap.get(ch.slug) || [])[0] || null,
            stats: model.getChannelStats(ch.slug),
        }));
        res.type('html').send(ssr.renderChannelsPage({
            channels: enrichedChannels,
            featuredChannels,
            categories: model.listTopCategories({ limit: 12 }),
            baseUrl: deriveBaseUrl(req),
        }));
    });

    app.get('/vods', asyncRoute(async (req, res) => {
        const channelSlug = req.query.channel ? String(req.query.channel) : null;
        res.type('html').send(ssr.renderCollectionPage({
            kind: 'vods',
            title: 'VODs',
            description: 'Watch past streams and replays from creators on openvibe.live.',
            emptyMessage: 'No VODs yet. Past streams will show up here once creators go live.',
            items: await feedBridge.listCanonicalVods({ channelSlug, limit: 200 }),
            baseUrl: deriveBaseUrl(req),
        }));
    }));

    app.get('/clips', asyncRoute(async (req, res) => {
        const channelSlug = req.query.channel ? String(req.query.channel) : null;
        res.type('html').send(ssr.renderCollectionPage({
            kind: 'clips',
            title: 'Clips',
            description: 'Short highlights and standout moments from creators on openvibe.live.',
            emptyMessage: 'No clips yet. Highlights will show up here as creators clip their streams.',
            items: await feedBridge.listCanonicalClips({ channelSlug, limit: 200 }),
            baseUrl: deriveBaseUrl(req),
        }));
    }));

    app.get('/vod/:id', asyncRoute(async (req, res) => {
        await renderMediaDetailRoute(req, res, 'vod', req.params.id);
    }));

    app.get('/clip/:id', asyncRoute(async (req, res) => {
        await renderMediaDetailRoute(req, res, 'clip', req.params.id);
    }));

    app.get('/go-live', (req, res) => {
        res.type('html').send(ssr.renderGoLivePage({
            baseUrl: deriveBaseUrl(req),
            session: buildSessionResponse(req),
        }));
    });

    app.get('/updates', (req, res) => {
        res.type('html').send(ssr.renderUpdatesPage({ baseUrl: deriveBaseUrl(req) }));
    });

    app.get('/@:slug', asyncRoute(async (req, res) => {
        await renderChannelRoute(req, res, req.params.slug);
    }));

    app.get('/@:slug/s/:streamId', (req, res) => {
        renderStreamRoute(req, res, req.params.slug, req.params.streamId);
    });

    app.get('/c/:slug', (req, res) => {
        res.redirect(308, `${channelPath(req.params.slug)}${requestSearch(req)}`);
    });

    app.get('/c/:slug/s/:streamId', (req, res) => {
        res.redirect(308, `${streamPath(req.params.slug, req.params.streamId)}${requestSearch(req)}`);
    });

    app.get('/tos', (_req, res) => {
        res.sendFile(publicFilePath('tos.html'));
    });

    app.get('/dmca', (_req, res) => {
        res.sendFile(publicFilePath('dmca.html'));
    });

    // ── JSON API ─────────────────────────────────────────────
    const json = express.json({ limit: '256kb' });
    const guarded = serviceActorMiddleware(config.internalKey);
    const localApiRouter = express.Router();

    localApiRouter.get('/session', (req, res) => {
        const ownerUserId = ownerUserIdOf(req);
        const primaryChannel = ownerUserId ? model.getChannelByOwnerUserId(ownerUserId) : null;
        res.json(buildSessionResponse(req, {
            service: config.serviceId,
            primary_channel: primaryChannel
                ? {
                    slug: primaryChannel.slug,
                    display_name: primaryChannel.display_name || primaryChannel.slug,
                }
                : null,
        }));
    });

    localApiRouter.get('/go-live/dashboard', requireUserAuth, asyncRoute(async (req, res) => {
        try {
            res.json(await buildGoLiveDashboardState(req));
        } catch (error) {
            sendOpenReError(res, error, 'stream manager unavailable');
        }
    }));

    localApiRouter.post('/go-live/channels', requireUserAuth, json, asyncRoute(async (req, res) => {
        const ownerUserId = ownerUserIdOf(req);
        const slug = normalizeCreatorSlugInput(req.body && req.body.slug);
        const displayName = String(req.body && req.body.display_name || req.user && (req.user.display_name || req.user.username) || '').trim();
        const description = String(req.body && req.body.description || '').trim() || null;
        if (!slug) return res.status(400).json({ error: 'valid slug required' });

        const existingLiveChannel = model.getChannelBySlug(slug);
        if (existingLiveChannel && existingLiveChannel.owner_user_id && String(existingLiveChannel.owner_user_id) !== ownerUserId && req.user.role !== 'admin') {
            return res.status(409).json({ error: 'channel handle already claimed' });
        }

        try {
            const created = await openreClient.createChannel({
                owner_user_id: ownerUserId,
                slug,
                display_name: displayName || slug,
                metadata: { source: 'openre-stream' },
            }, req.token);
            const channel = created && created.channel ? created.channel : null;
            if (!channel) return res.status(502).json({ error: 'openre returned no channel' });
            const liveChannel = syncLiveChannel(channel, {
                owner_user_id: ownerUserId,
                description,
                metadata: { source: 'openre-stream' },
            });
            res.status(201).json({ channel, live_channel: liveChannel });
        } catch (error) {
            sendOpenReError(res, error, 'failed to create channel');
        }
    }));

    localApiRouter.post('/go-live/destinations', requireUserAuth, json, asyncRoute(async (req, res) => {
        const ownerUserId = ownerUserIdOf(req);
        const payload = {
            owner_user_id: ownerUserId,
            kind: String(req.body && req.body.kind || 'custom').trim(),
            label: String(req.body && req.body.label || '').trim() || null,
            target_url: String(req.body && req.body.target_url || '').trim(),
            target_key: String(req.body && req.body.target_key || '').trim() || null,
            metadata: (req.body && req.body.metadata && typeof req.body.metadata === 'object') ? req.body.metadata : undefined,
        };
        if (!payload.target_url) return res.status(400).json({ error: 'target_url required' });
        try {
            const created = await openreClient.createDestination(payload, req.token);
            res.status(201).json(created);
        } catch (error) {
            sendOpenReError(res, error, 'failed to save destination');
        }
    }));

    localApiRouter.patch('/go-live/channels/:slug', requireUserAuth, json, asyncRoute(async (req, res) => {
        const ownerUserId = ownerUserIdOf(req);
        const { slug } = req.params;
        const allowed = ['display_name', 'description', 'visibility', 'nsfw', 'recording_enabled', 'chat_enabled'];
        const body = {};
        allowed.forEach((k) => { if (req.body && req.body[k] !== undefined) body[k] = req.body[k]; });
        try {
            const updated = await openreClient.updateChannel(slug, body, req.token);
            const ch = updated && (updated.channel || updated);
            if (ch && ch.slug) syncLiveChannel(ch, { owner_user_id: ownerUserId });
            res.json(updated);
        } catch (error) {
            sendOpenReError(res, error, 'failed to update channel');
        }
    }));

    localApiRouter.post('/go-live/channels/:slug/regenerate-key', requireUserAuth, json, asyncRoute(async (req, res) => {
        const ownerUserId = ownerUserIdOf(req);
        const { slug } = req.params;
        try {
            const result = await openreClient.regenerateStreamKey(slug, req.token);
            const ch = result && (result.channel || result);
            if (ch && ch.slug) syncLiveChannel(ch, { owner_user_id: ownerUserId });
            res.json(result);
        } catch (error) {
            sendOpenReError(res, error, 'failed to regenerate stream key');
        }
    }));

    localApiRouter.delete('/go-live/destinations/:id', requireUserAuth, asyncRoute(async (req, res) => {
        try {
            const result = await openreClient.deleteDestination(req.params.id, req.token);
            res.json(result || { ok: true });
        } catch (error) {
            sendOpenReError(res, error, 'failed to delete destination');
        }
    }));

    localApiRouter.post('/go-live/streams', requireUserAuth, json, asyncRoute(async (req, res) => {
        const ownerUserId = ownerUserIdOf(req);
        const payload = {
            channel_slug: String(req.body && req.body.channel_slug || '').trim(),
            title: String(req.body && req.body.title || '').trim() || null,
            category: String(req.body && req.body.category || '').trim() || null,
            protocol: String(req.body && req.body.protocol || 'rtmp').trim(),
        };
        if (!payload.channel_slug) return res.status(400).json({ error: 'channel_slug required' });
        try {
            const created = await openreClient.createStream(payload, req.token);
            if (created && created.channel) syncLiveChannel(created.channel, { owner_user_id: ownerUserId });
            if (created && created.stream) syncLiveStream(created.stream, created.channel || null, { owner_user_id: ownerUserId });
            res.status(201).json(created);
        } catch (error) {
            sendOpenReError(res, error, 'failed to create stream');
        }
    }));

    localApiRouter.post('/go-live/streams/:id/start', requireUserAuth, json, asyncRoute(async (req, res) => {
        try {
            const started = await openreClient.startStream(req.params.id, req.token);
            if (started && started.channel) syncLiveChannel(started.channel, { owner_user_id: ownerUserIdOf(req) });
            if (started && started.stream) syncLiveStream(started.stream, started.channel || null, { owner_user_id: ownerUserIdOf(req) });
            if (started && started.stream && started.mirror && started.mirror.live_url) {
                model.recordMirror({
                    stream_id: started.stream.id,
                    channel_slug: (started.channel && started.channel.slug) || started.stream.channel_slug || '',
                    details: { live_url: started.mirror.live_url },
                });
            }
            res.json(started);
        } catch (error) {
            sendOpenReError(res, error, 'failed to start stream');
        }
    }));

    localApiRouter.post('/go-live/streams/:id/end', requireUserAuth, json, asyncRoute(async (req, res) => {
        try {
            const ended = await openreClient.endStream(req.params.id, req.token, req.body || {});
            if (ended && ended.channel) syncLiveChannel(ended.channel, { owner_user_id: ownerUserIdOf(req) });
            if (ended && ended.stream) syncLiveStream(ended.stream, ended.channel || null, { owner_user_id: ownerUserIdOf(req) });
            res.json(ended);
        } catch (error) {
            sendOpenReError(res, error, 'failed to end stream');
        }
    }));

    localApiRouter.get('/admin/live/channel-resolver/cache', guarded, (req, res) => {
        res.json(resolverCacheStats());
    });

    localApiRouter.get('/admin/live/missing-channel-links', guarded, asyncRoute(async (req, res) => {
        const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
        const streams = model.listStreams({ limit: 500 });
        const missing = streams
            .filter((s) => !s.channel_slug || s.channel_slug === 'unknown')
            .slice(0, limit)
            .map((s) => ({
                id: s.id,
                title: s.title,
                owner_user_id: s.owner_user_id || null,
                channel_slug: s.channel_slug || null,
                created_at: s.created_at,
            }));
        res.json({ total: missing.length, items: missing });
    }));

    app.use('/api/v1', localApiRouter);

    app.get('/api/v1/home', asyncRoute(async (_req, res) => res.json(await feedBridge.buildHomeViewModel())));
    app.get('/api/v1/channels', (req, res) => res.json({ items: model.listChannels({ limit: req.query.limit || 200 }) }));
    app.get('/api/v1/channels/:slug', asyncRoute(async (req, res) => {
        const c = model.getChannelBySlug(req.params.slug);
        if (!c) return res.status(404).json({ error: 'not found' });
        const channelMedia = await feedBridge.buildChannelMedia(req.params.slug);
        const baseStats = model.getChannelStats(req.params.slug);
        res.json({
            channel: c,
            current_stream: model.getCurrentLiveStream(req.params.slug) || null,
            recent_streams: model.listStreams({ channel_slug: req.params.slug, limit: req.query.limit || 20 }),
            recent_vods: channelMedia.vods.items,
            recent_clips: channelMedia.clips.items,
            stats: Object.assign({}, baseStats, {
                vods: Math.max(Number(baseStats.vods || 0), channelMedia.vods.total),
                clips: Math.max(Number(baseStats.clips || 0), channelMedia.clips.total),
            }),
        });
    }));
    app.get('/api/v1/featured-channels', (_req, res) => res.json({ items: model.listFeaturedChannels({ limit: 12 }) }));
    app.get('/api/v1/categories', (_req, res) => res.json({ items: model.listTopCategories({ limit: 24 }) }));
    app.get('/api/v1/vods', asyncRoute(async (req, res) => res.json({ items: await feedBridge.listCanonicalVods({ channelSlug: req.query.channel_slug, limit: req.query.limit || 100 }) })));
    app.get('/api/v1/clips', asyncRoute(async (req, res) => res.json({ items: await feedBridge.listCanonicalClips({ channelSlug: req.query.channel_slug, limit: req.query.limit || 100 }) })));
    app.get('/api/v1/pastes', asyncRoute(async (_req, res) => {
        const community = await feedBridge.buildCommunityViewModel();
        res.json({ items: community.recentPastes || [] });
    }));
    app.get('/api/v1/streams', (req, res) => res.json({ items: model.listStreams({ channel_slug: req.query.channel_slug, status: req.query.status, limit: req.query.limit }) }));
    app.get('/api/v1/streams/:id', (req, res) => {
        const stream = model.getStreamById(req.params.id);
        if (!stream) return res.status(404).json({ error: 'not found' });
        res.json({ stream });
    });
    app.get('/api/v1/streams/:id/timeline', (req, res) => {
        const timeline = model.getStreamTimeline(req.params.id);
        if (!timeline) return res.status(404).json({ error: 'not found' });
        res.json({ timeline });
    });

    // Phase 16 — composition descriptor for a stream: which downstream
    // products (chat room, tips overlay, audio overlay, vip plan, ai
    // assistance) are wired in. This is a read-model returning the URLs
    // that consumers should call; it does not proxy data itself.
    app.get('/api/v1/streams/:id/integrations', (req, res) => {
        const stream = model.getStreamById(req.params.id);
        if (!stream) return res.status(404).json({ error: 'not found' });
        const ownerType = stream.owner_type || 'channel';
        const ownerId = stream.owner_id || stream.channel_id || stream.channel_slug;
        const services = (config && config.services) || {};
        const desc = {
            stream: { id: stream.id, slug: stream.channel_slug, status: stream.status, owner_type: ownerType, owner_id: ownerId },
            integrations: {
                chat: services.chat ? {
                    base_url: services.chat,
                    stream_binding: `${services.chat}/api/v1/stream-bindings/${encodeURIComponent(stream.id)}?stream_ref_type=live_stream`,
                } : null,
                tips: services.billing ? {
                    base_url: services.billing,
                    overlay: `${services.billing}/api/tips/overlay/live_stream/${encodeURIComponent(stream.id)}`,
                    product_status: `${services.billing}/api/tips/product/status`,
                } : null,
                vip: services.billing ? {
                    base_url: services.billing,
                    plans: `${services.billing}/api/vip/plans?owner_type=${encodeURIComponent(ownerType)}&owner_id=${encodeURIComponent(ownerId || '')}`,
                    product_status: `${services.billing}/api/vip/product/status`,
                } : null,
                audio_overlay: services.chat ? {
                    overlay_url: `${services.chat}/api/v1/audio/overlay/${encodeURIComponent(ownerType)}/${encodeURIComponent(ownerId || '')}?queue_type=tts`,
                } : null,
                ai: services.ai ? {
                    product_status: `${services.ai}/api/v1/ai/product/status`,
                } : null,
            },
            ensured: integrations.listIntegrationsForStream(stream.id),
        };
        res.json(desc);
    });

    // Phase 16 — best-effort ensure for a single integration on a stream.
    // Body: { target_kind: 'chat-room'|'tips'|'vip'|'audio-overlay'|'ai-assist' }.
    // Returns 200 with the materialized record (status may be 'unavailable'
    // when the downstream URL is not configured or the probe fails).
    app.post('/api/v1/streams/:id/integrations/ensure', json, async (req, res) => {
        const stream = model.getStreamById(req.params.id);
        if (!stream) return res.status(404).json({ error: 'not found' });
        const targetKind = String((req.body && req.body.target_kind) || '');
        if (!integrations.TARGET_KINDS.has(targetKind)) {
            return res.status(400).json({ error: 'unsupported target_kind', target_kind: targetKind });
        }
        try {
            const record = await integrations.ensureIntegration({
                owner_kind: 'stream',
                owner_ref: stream.id,
                channel_slug: stream.channel_slug,
                target_kind: targetKind,
                services: (config && config.services) || {},
                metadata: { stream_status: stream.status },
            });
            return res.status(200).json({ integration: record });
        } catch (error) {
            return res.status(500).json({ error: error.message || 'ensure_failed' });
        }
    });

    // Phase 16 — channel-scoped integrations (read + ensure).
    app.get('/api/v1/channels/:slug/integrations', (req, res) => {
        const channel = model.getChannelBySlug(req.params.slug);
        if (!channel) return res.status(404).json({ error: 'not found' });
        res.json({
            channel: { slug: channel.slug, id: channel.id },
            ensured: integrations.listIntegrationsForChannel(channel.slug),
        });
    });

    app.post('/api/v1/channels/:slug/integrations/ensure', json, async (req, res) => {
        const channel = model.getChannelBySlug(req.params.slug);
        if (!channel) return res.status(404).json({ error: 'not found' });
        const targetKind = String((req.body && req.body.target_kind) || '');
        if (!integrations.TARGET_KINDS.has(targetKind)) {
            return res.status(400).json({ error: 'unsupported target_kind', target_kind: targetKind });
        }
        try {
            const record = await integrations.ensureIntegration({
                owner_kind: 'channel',
                owner_ref: channel.slug,
                channel_slug: channel.slug,
                target_kind: targetKind,
                services: (config && config.services) || {},
                metadata: {},
            });
            return res.status(200).json({ integration: record });
        } catch (error) {
            return res.status(500).json({ error: error.message || 'ensure_failed' });
        }
    });

    // Phase 16 — product status summary for live integrations.
    app.get('/api/v1/integrations/product/status', (_req, res) => {
        const services = (config && config.services) || {};
        res.json({
            services_configured: {
                chat: !!services.chat,
                billing: !!services.billing,
                ai: !!services.ai,
            },
            integrations: integrations.summary(),
        });
    });

    // Service-callable upsert (used by openre-stream → openvibe-live mirror).
    app.post('/api/v1/channels', guarded, json, (req, res) => {
        if (!req.serviceActor) return res.status(401).json({ error: 'service actor required' });
        const c = model.upsertChannel(req.body || {});
        res.status(201).json({ channel: c });
    });
    app.post('/api/v1/streams', guarded, json, (req, res) => {
        if (!req.serviceActor) return res.status(401).json({ error: 'service actor required' });
        const s = model.upsertStream(req.body || {});
        res.status(201).json({ stream: s });
    });

    // Stream-event subscription callback (push from openvibe-events). Same
    // endpoint accepts a single event or `{events:[...]}` batch.
    app.post('/api/v1/events/stream', guarded, json, (req, res) => {
        if (!req.serviceActor) return res.status(401).json({ error: 'service actor required' });
        const list = Array.isArray(req.body && req.body.events) ? req.body.events : [req.body];
        const results = list.map(applyStreamEvent);
        res.json({ ok: true, results });
    });

    app.use((err, _req, res, _next) => {
        console.error('[openvibe-live] unhandled:', err.message);
        res.status(500).json({ error: 'internal error' });
    });

    attachIconAssets(app, { routePrefix: '/assets' });
    app.use(express.static(path.join(__dirname, '..', 'public')));

    return { app };
}

function start() {
    const { app } = buildApp();
    const server = app.listen(config.port, config.host, () => {
        console.log(`[openvibe-live] listening on http://${config.host}:${config.port}`);
    });
    const shutdown = () => server.close(() => process.exit(0));
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    return { app, server };
}

if (require.main === module) start();

module.exports = { buildApp, start };
