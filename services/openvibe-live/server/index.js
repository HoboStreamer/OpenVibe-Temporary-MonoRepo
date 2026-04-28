'use strict';

const express = require('express');
const fs = require('fs');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');

const config = require('./config');
const db = require('./db');
const model = require('./model');
const ssr = require('./ssr');
const { applyStreamEvent } = require('./ingestion');
const { serviceActorMiddleware } = require('./middleware');
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

function buildThumbnailPlaceholder(fileName) {
        const label = String(fileName || 'openvibe-live')
                .replace(/\.[^.]+$/, '')
                .replace(/[^a-z0-9]+/gi, ' ')
                .trim()
                .slice(0, 28) || 'openvibe live';
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
    <text x="118" y="318" fill="#f8fbff" font-family="Arial, sans-serif" font-size="82" font-weight="800">Thumbnail pending</text>
    <text x="118" y="392" fill="#cbd5f5" font-family="Arial, sans-serif" font-size="34">${headline}</text>
    <text x="118" y="454" fill="#dbeafe" font-family="Arial, sans-serif" font-size="28">Migrated media will render here once the canonical asset is staged.</text>
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

function buildApp() {
    db.init(config.db.path);
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

    function buildCommunityViewModel() {
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

    function buildChatViewModel() {
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

    function buildHomeViewModel() {
        const channels = model.listChannels({ limit: 96 });
        const recentlyEnded = model.listRecentlyEnded({ limit: 24 });
        const channelMap = new Map(channels.map((channel) => [channel.slug, channel]));
        const recentlyOnlineChannels = [];
        const seenChannels = new Set();

        for (const stream of recentlyEnded) {
            const slug = String(stream && stream.channel_slug || '').trim();
            if (!slug || seenChannels.has(slug)) continue;
            const channel = channelMap.get(slug) || model.getChannelBySlug(slug);
            if (!channel) continue;
            recentlyOnlineChannels.push(Object.assign({}, channel, {
                stats: model.getChannelStats(slug),
                recentStream: stream,
            }));
            seenChannels.add(slug);
            if (recentlyOnlineChannels.length >= 8) break;
        }

        return {
            channels,
            featuredChannels: model.listFeaturedChannels({ limit: 8 }),
            trendingNow: model.listTrendingStreams({ limit: 6 }),
            liveNow: model.listLiveNow({ limit: 12 }),
            recentlyEnded: recentlyEnded.slice(0, 12),
            recentlyOnlineChannels,
            recentVods: model.listVods({ limit: 12 }),
            recentClips: model.listClips({ limit: 12 }),
            categories: model.listTopCategories({ limit: 10 }),
            stats: model.getHomeStats(),
            community: buildCommunityViewModel(),
            chat: buildChatViewModel(),
        };
    }

    function renderChannelRoute(req, res, slug) {
        const channel = model.getChannelBySlug(slug);
        if (!channel) {
            return res.status(404).type('html').send(ssr.renderOfflinePage({ slug, baseUrl: deriveBaseUrl(req) }));
        }
        const currentStream = model.getCurrentLiveStream(slug);
        const recentStreams = model.listStreams({ channel_slug: slug, limit: 20 });
        const channelStats = model.getChannelStats(slug);
        const relatedChannels = model.listFeaturedChannels({ limit: 12 }).filter((candidate) => candidate.slug !== channel.slug).slice(0, 4);
        return res.type('html').send(ssr.renderChannelPage({
            channel,
            currentStream,
            recentStreams,
            recentVods: model.listVods({ channel_slug: slug, limit: 6 }),
            recentClips: model.listClips({ channel_slug: slug, limit: 6 }),
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

    const app = express();
    app.set('trust proxy', 1);
    app.use(helmet({ contentSecurityPolicy: false }));
    app.use(cors());
    app.use(cookieParser());

    app.get('/health', (_req, res) => res.json({
        ok: true,
        service: config.serviceId,
        persistence: db.describePersistence(),
    }));

    app.get('/api/thumbnails/:fileName', (req, res) => {
        const fileName = path.basename(String(req.params.fileName || 'thumbnail.svg'));
        const filePath = path.join(thumbnailDir, fileName);
        if (fs.existsSync(filePath)) {
            return res.sendFile(filePath);
        }
        res.set('Cache-Control', 'public, max-age=300');
        return res.type('image/svg+xml').send(buildThumbnailPlaceholder(fileName));
    });

    // ── SSR pages ────────────────────────────────────────────
    app.get('/', (req, res) => {
        res.type('html').send(ssr.renderHomePage({ ...buildHomeViewModel(), baseUrl: deriveBaseUrl(req) }));
    });

    app.get('/channels', (req, res) => {
        res.type('html').send(ssr.renderChannelsPage({
            channels: model.listChannels({ limit: 200 }),
            featuredChannels: model.listFeaturedChannels({ limit: 10 }),
            categories: model.listTopCategories({ limit: 12 }),
            baseUrl: deriveBaseUrl(req),
        }));
    });

    app.get('/vods', (req, res) => {
        const channelSlug = req.query.channel ? String(req.query.channel) : null;
        res.type('html').send(ssr.renderCollectionPage({
            kind: 'vods',
            title: 'OpenVibe VOD Library',
            description: 'Browse recent broadcast replays attached to the OpenVibe live graph.',
            emptyMessage: 'No VOD-linked streams are available yet. Once VOD attachments land in the canonical model, they show up here automatically.',
            items: model.listVods({ channel_slug: channelSlug, limit: 200 }),
            baseUrl: deriveBaseUrl(req),
        }));
    });

    app.get('/clips', (req, res) => {
        const channelSlug = req.query.channel ? String(req.query.channel) : null;
        res.type('html').send(ssr.renderCollectionPage({
            kind: 'clips',
            title: 'OpenVibe Clips',
            description: 'Fast highlights, standout moments, and clip-ready broadcasts from the OpenVibe live graph.',
            emptyMessage: 'Clip metadata has not been staged yet for these channels. The page stays honest instead of pretending every stream already has clips.',
            items: model.listClips({ channel_slug: channelSlug, limit: 200 }),
            baseUrl: deriveBaseUrl(req),
        }));
    });

    app.get('/go-live', (req, res) => {
        res.type('html').send(ssr.renderGoLivePage({ baseUrl: deriveBaseUrl(req) }));
    });

    app.get('/updates', (req, res) => {
        res.type('html').send(ssr.renderUpdatesPage({ baseUrl: deriveBaseUrl(req) }));
    });

    app.get('/@:slug', (req, res) => {
        renderChannelRoute(req, res, req.params.slug);
    });

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

    app.get('/api/v1/home', (_req, res) => res.json(buildHomeViewModel()));
    app.get('/api/v1/channels', (req, res) => res.json({ items: model.listChannels({ limit: req.query.limit || 200 }) }));
    app.get('/api/v1/channels/:slug', (req, res) => {
        const c = model.getChannelBySlug(req.params.slug);
        if (!c) return res.status(404).json({ error: 'not found' });
        res.json({
            channel: c,
            current_stream: model.getCurrentLiveStream(req.params.slug) || null,
            recent_streams: model.listStreams({ channel_slug: req.params.slug, limit: req.query.limit || 20 }),
            stats: model.getChannelStats(req.params.slug),
        });
    });
    app.get('/api/v1/featured-channels', (_req, res) => res.json({ items: model.listFeaturedChannels({ limit: 12 }) }));
    app.get('/api/v1/categories', (_req, res) => res.json({ items: model.listTopCategories({ limit: 24 }) }));
    app.get('/api/v1/vods', (req, res) => res.json({ items: model.listVods({ channel_slug: req.query.channel_slug, limit: req.query.limit || 100 }) }));
    app.get('/api/v1/clips', (req, res) => res.json({ items: model.listClips({ channel_slug: req.query.channel_slug, limit: req.query.limit || 100 }) }));
    app.get('/api/v1/streams', (req, res) => res.json({ items: model.listStreams({ channel_slug: req.query.channel_slug, status: req.query.status, limit: req.query.limit }) }));
    app.get('/api/v1/streams/:id', (req, res) => {
        const stream = model.getStreamById(req.params.id);
        if (!stream) return res.status(404).json({ error: 'not found' });
        res.json({ stream });
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
