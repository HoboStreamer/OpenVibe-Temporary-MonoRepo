'use strict';

const express = require('express');
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

function buildApp() {
    db.init(config.db.path);

    const app = express();
    app.set('trust proxy', 1);
    app.use(helmet({ contentSecurityPolicy: false }));
    app.use(cors());
    app.use(cookieParser());

    app.get('/health', (_req, res) => res.json({ ok: true, service: config.serviceId }));

    // ── SSR pages ────────────────────────────────────────────
    app.get('/', (_req, res) => {
        res.type('html').send(ssr.renderHomePage({ channels: model.listChannels({ limit: 50 }), baseUrl: config.publicBaseUrl }));
    });

    app.get('/c/:slug', (req, res) => {
        const channel = model.getChannelBySlug(req.params.slug);
        if (!channel) {
            return res.status(404).type('html').send(ssr.renderOfflinePage({ slug: req.params.slug, baseUrl: config.publicBaseUrl }));
        }
        const currentStream = model.getCurrentLiveStream(req.params.slug);
        const recentStreams = model.listStreams({ channel_slug: req.params.slug, limit: 20 });
        res.type('html').send(ssr.renderChannelPage({ channel, currentStream, recentStreams, baseUrl: config.publicBaseUrl }));
    });

    app.get('/c/:slug/s/:streamId', (req, res) => {
        const stream = model.getStreamById(req.params.streamId);
        if (!stream) return res.status(404).type('html').send(ssr.renderOfflinePage({ slug: req.params.slug, baseUrl: config.publicBaseUrl }));
        const channel = model.getChannelBySlug(req.params.slug);
        res.type('html').send(ssr.renderStreamPage({ channel, stream, baseUrl: config.publicBaseUrl }));
    });

    // ── JSON API ─────────────────────────────────────────────
    const json = express.json({ limit: '256kb' });
    const guarded = serviceActorMiddleware(config.internalKey);

    app.get('/api/v1/channels', (_req, res) => res.json({ items: model.listChannels({}) }));
    app.get('/api/v1/channels/:slug', (req, res) => {
        const c = model.getChannelBySlug(req.params.slug);
        if (!c) return res.status(404).json({ error: 'not found' });
        res.json({ channel: c, current_stream: model.getCurrentLiveStream(req.params.slug) || null });
    });
    app.get('/api/v1/streams', (req, res) => res.json({ items: model.listStreams({ channel_slug: req.query.channel_slug, status: req.query.status, limit: req.query.limit }) }));

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
