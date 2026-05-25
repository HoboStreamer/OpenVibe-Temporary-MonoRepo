'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { createServiceRuntime } = require('@openvibe/runtime');
const { attachIconAssets } = require('@openvibe/icons/express');

const config = require('./config');
const db = require('./db');
const model = require('./model');
const { buildAuthRouter } = require('./auth-routes');
const { buildEventBus } = require('./events');
const { buildRouter } = require('./routes');
const { buildAuthClient, optionalOpenVibeAuth, serviceActorMiddleware } = require('./middleware');
const { buildSessionResponse } = require('./session');
const { renderDashboard, renderDashboardAuthGate } = require('./ssr');
const sfu = require('./sfu');
const broadcastWs = require('./broadcast-ws');
const whip = require('./whip');
const { createRTMPServer } = require('./rtmp-server');

function deriveBaseUrl(req) {
    const forwardedProto = req.headers['x-forwarded-proto'];
    const protocol = forwardedProto ? String(forwardedProto).split(',')[0].trim() : req.protocol;
    const host = req.get('host');
    return host ? `${protocol}://${host}` : config.publicBaseUrl;
}

function buildApp() {
    db.init(config.db.path);
    const eventBus = buildEventBus(config);
    const authClient = buildAuthClient(config);

    const app = express();
    app.set('trust proxy', 1);
    app.use(helmet({ contentSecurityPolicy: false }));
    app.use(cors({ origin: true, credentials: true }));
    app.use(cookieParser());

    const runtime = createServiceRuntime({
        serviceName: config.serviceId || 'openre-stream',
        getHealth: () => ({
            persistence: db.describePersistence(),
            ingest: config.ingest || null,
            auth_issuer: config.auth && config.auth.issuer || null,
        }),
        getReadiness: () => ({
            persistence: db.describePersistence(),
            checks: [
                {
                    name: 'internal_key_overridden',
                    ok: config.internalKey !== 'change-me-in-production',
                    critical: false,
                    details: { using_default_key: config.internalKey === 'change-me-in-production' },
                },
                {
                    name: 'ingest_urls_present',
                    ok: Object.values(config.ingest || {}).filter(Boolean).length > 0,
                    critical: false,
                    details: config.ingest || {},
                    message: Object.values(config.ingest || {}).filter(Boolean).length > 0 ? null : 'Ingest URLs are not configured yet; this runtime is control-plane only.',
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
        serviceName: 'openre.stream',
    }));
    app.use(express.static(path.join(__dirname, '..', 'public')));
    attachIconAssets(app, { routePrefix: '/assets' });

    // ── VOD / HLS static serving ───────────────────────────────────────────
    const vodDir = path.join(path.dirname(config.db.path), 'vods');
    fs.mkdirSync(vodDir, { recursive: true });
    app.use('/vods', express.static(vodDir, {
        setHeaders: (res, filePath) => {
            if (filePath.endsWith('.m3u8')) res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
            else if (filePath.endsWith('.ts')) res.setHeader('Content-Type', 'video/mp2t');
        },
    }));

    // ── dashboard: authenticated SSR page ─────────────────────────────────
    app.get('/dashboard', (req, res) => {
        if (!req.user) {
            const returnUrl = req.originalUrl || '/dashboard';
            return res.status(401).send(renderDashboardAuthGate({ returnUrl }));
        }
        const userId = String(req.user.id || req.user.sub || '');
        const channels     = model.listChannels({ owner_user_id: userId, limit: 50 });
        const destinations = model.listDestinations({ owner_user_id: userId });
        const streams      = channels.length
            ? model.listStreams({ channel_id: null, status: null, limit: 20 }).filter((s) => {
                const ch = channels.find((c) => c.id === s.channel_id);
                return !!ch;
            })
            : [];

        const html = renderDashboard({
            user:         req.user,
            channels,
            destinations,
            streams,
            outputs:      [],
            ingestConfig: config.ingest || {},
        });
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(html);
    });

    // ── WHIP ingest endpoints ──────────────────────────────────────────────
    // Raw body needed for SDP text
    app.post('/whip/:channelSlug', express.text({ type: ['text/plain', 'application/sdp', '*/*'], limit: '64kb' }), whip.handleOffer);
    app.patch('/whip/:channelSlug/:resourceId', express.text({ type: ['application/trickle-ice-sdpfrag', '*/*'], limit: '16kb' }), whip.handleTrickle);
    app.delete('/whip/:channelSlug/:resourceId', whip.handleDelete);

    // ── CORS preflight for WHIP (OBS needs this) ──────────────────────────
    app.options('/whip/:channelSlug', (req, res) => {
        res.set({
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Expose-Headers': 'Location',
        }).status(204).end();
    });
    app.options('/whip/:channelSlug/:resourceId', (req, res) => {
        res.set({
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'PATCH, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }).status(204).end();
    });

    // ── Viewer count (public, no auth) ────────────────────────────────────
    app.get('/viewer-count/:channelSlug', (req, res) => {
        const roomId = `channel-${req.params.channelSlug}`;
        res.set('Access-Control-Allow-Origin', '*');
        res.json({ viewer_count: sfu.getViewerCount(roomId) });
    });

    // ── WHEP viewer endpoints ──────────────────────────────────────────────
    app.post('/whep/:channelSlug', express.text({ type: ['text/plain', 'application/sdp', '*/*'], limit: '64kb' }), whip.handleWhepOffer);
    app.delete('/whep/:channelSlug/:resourceId', whip.handleWhepDelete);
    app.options('/whep/:channelSlug', (req, res) => {
        res.set({
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Expose-Headers': 'Location',
        }).status(204).end();
    });
    app.options('/whep/:channelSlug/:resourceId', (req, res) => {
        res.set({
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        }).status(204).end();
    });

    app.use('/api/v1', serviceActorMiddleware(config.internalKey), buildRouter({ eventBus, config, buildSessionResponse }));

    app.use((err, _req, res, _next) => {
        console.error('[openre-stream] unhandled:', err.message);
        res.status(500).json({ error: 'internal error' });
    });

    return { app };
}

function start() {
    const { app } = buildApp();
    const server = http.createServer(app);

    // Sweep any streams that were left started before the last shutdown
    model.sweepHungStreams();

    // Initialize SFU (non-blocking)
    sfu.init().catch(err => console.warn('[openre-stream] SFU init error:', err.message));

    // Start native RTMP ingest server
    const rtmpServer = createRTMPServer({ config, eventBus: buildEventBus(config) });
    rtmpServer.start();

    // Attach broadcast WebSocket server
    broadcastWs.attach(server);

    // Handle WebSocket upgrades
    server.on('upgrade', (req, socket, head) => {
        const url = req.url || '';
        if (url.startsWith('/ws/broadcast')) {
            broadcastWs.handleUpgrade(req, socket, head);
        } else {
            socket.destroy();
        }
    });

    server.listen(config.port, config.host, () => {
        console.log(`[openre-stream] listening on http://${config.host}:${config.port}`);
    });
    const shutdown = () => {
        sfu.closeAll();
        server.close(() => process.exit(0));
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    return { app, server };
}

if (require.main === module) start();

module.exports = { buildApp, start };
