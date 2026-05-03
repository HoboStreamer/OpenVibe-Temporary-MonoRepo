'use strict';

const { createServer } = require('http');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const path = require('path');
const { attachIconAssets } = require('@openvibe/icons/express');
const { createServiceRuntime } = require('@openvibe/runtime');

const config = require('./config');
const db = require('./db');
const { buildEventBus } = require('./events');
const { buildRouter } = require('./routes');
const { createRealtimeRuntime } = require('./realtime');
const { createSourceVibeEngine } = require('./sourcevibe');
const { buildAuthClient, optionalOpenVibeAuth, serviceActorMiddleware, userContextMiddleware } = require('./middleware');

function buildSourceVibeUrl(params = {}) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params || {})) {
        if (value == null || value === '') continue;
        query.set(key, String(value));
    }
    const serialized = query.toString();
    return `/sourcevibe${serialized ? `?${serialized}` : ''}`;
}

function wantsPlaySurface(req) {
    const query = req && req.query || {};
    return !!(
        query.server
        || query.world
        || query.serverId
        || query.worldId
        || String(query.launch || '').toLowerCase() === 'play'
        || String(query.direct || '') === '1'
    );
}

function wantsEmbeddedSurface(req) {
    const query = req && req.query || {};
    return String(query.embedded || query.direct || '') === '1';
}

function buildApp() {
    db.init(config.db.path);

    const eventBus = buildEventBus(config);
    const authClient = buildAuthClient(config);
    let realtime = null;
    let sourcevibe = null;

    const app = express();
    app.set('trust proxy', 1);
    app.use(helmet({ contentSecurityPolicy: false }));
    app.use(cors());
    app.use(cookieParser());

    const runtime = createServiceRuntime({
        serviceName: config.serviceId || 'openvibe-games',
        getHealth: () => ({
            persistence: db.describePersistence(),
            canvas: {
                width: config.canvas && config.canvas.width,
                height: config.canvas && config.canvas.height,
            },
            realtime: realtime ? realtime.summary() : null,
            sourcevibe: sourcevibe ? sourcevibe.summary() : null,
        }),
        getReadiness: () => ({
            persistence: db.describePersistence(),
            checks: [
                {
                    name: 'events_url_configured',
                    ok: !!(config.events && config.events.url),
                    critical: true,
                    details: { url: config.events && config.events.url || null },
                },
                {
                    name: 'canvas_dimensions',
                    ok: !!(config.canvas && config.canvas.width && config.canvas.height),
                    critical: true,
                    details: config.canvas || null,
                },
                {
                    name: 'realtime_runtime',
                    ok: true,
                    critical: false,
                    details: realtime ? realtime.summary() : { ok: false, reason: 'not initialized yet' },
                },
                {
                    name: 'sourcevibe_runtime',
                    ok: true,
                    critical: false,
                    details: sourcevibe ? sourcevibe.summary() : { ok: false, reason: 'not initialized yet' },
                },
            ],
        }),
    });
    runtime.attach(app);

    attachIconAssets(app, { routePrefix: '/assets' });
    app.use('/vendor/pixi', express.static(path.resolve(__dirname, '..', '..', '..', 'node_modules', 'pixi.js', 'dist')));
    const legacy2dWorldAssetRoot = [
        process.env.OPENVIBE_GAMES_2DWORLD_LEGACY_ASSETS,
        path.join(__dirname, '..', 'public', 'assets', '2dworld-legacy'),
        '/opt/legacy/2dworld/public/img',
    ].find((candidate) => candidate && fs.existsSync(candidate));
    if (legacy2dWorldAssetRoot) {
        app.use('/assets/2dworld-legacy', express.static(legacy2dWorldAssetRoot));
    }
    const publicRoot = path.join(__dirname, '..', 'public');
    app.get(['/2d-world', '/2d-world/'], (req, res) => {
        if (wantsPlaySurface(req)) {
            return res.sendFile(path.join(publicRoot, '2d-world', 'index.html'));
        }
        return res.redirect(302, buildSourceVibeUrl({
            gamemode: req.query && req.query.gamemode || '2dworld',
            view: 'home',
        }));
    });
    app.get(['/2d-world/editor', '/2d-world/editor/'], (req, res) => {
        if (wantsEmbeddedSurface(req)) {
            return res.sendFile(path.join(publicRoot, '2d-world', 'editor', 'index.html'));
        }
        return res.redirect(302, buildSourceVibeUrl({
            gamemode: req.query && req.query.gamemode || '2dworld',
            server: req.query && (req.query.server || req.query.world) || null,
            view: 'editor',
        }));
    });
    app.get(['/2d-world/status', '/2d-world/status/'], (req, res) => {
        if (wantsEmbeddedSurface(req)) {
            return res.sendFile(path.join(publicRoot, '2d-world', 'status', 'index.html'));
        }
        return res.redirect(302, buildSourceVibeUrl({
            gamemode: req.query && req.query.gamemode || '2dworld',
            server: req.query && (req.query.server || req.query.world) || null,
            view: 'diagnostics',
            panel: 'status',
        }));
    });
    app.use(express.static(path.join(__dirname, '..', 'public')));

    app.use(optionalOpenVibeAuth(authClient));

    const httpServer = createServer(app);
    realtime = createRealtimeRuntime({ httpServer, eventBus, config, authClient });
    sourcevibe = createSourceVibeEngine({ realtime, eventBus, config });
    if (typeof realtime.attachSourceVibe === 'function') realtime.attachSourceVibe(sourcevibe);
    realtime.start();

    app.use('/api/games', serviceActorMiddleware(config.internalKey), userContextMiddleware(), buildRouter({ eventBus, realtime, config, sourcevibe }));

    app.use((err, _req, res, _next) => {
        console.error('[games] unhandled:', err.message);
        res.status(500).json({ error: 'internal error' });
    });

    return { app, httpServer, realtime };
}

function start() {
    const { httpServer, realtime } = buildApp();
    const server = httpServer.listen(config.port, config.host, () => {
        console.log(`[openvibe-games] listening on http://${config.host}:${config.port}`);
    });
    const shutdown = () => {
        console.log('[openvibe-games] shutting down');
        Promise.resolve(realtime && realtime.stop ? realtime.stop() : null)
            .catch((err) => console.warn('[openvibe-games] realtime shutdown warning:', err.message))
            .finally(() => server.close(() => process.exit(0)));
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    return { server: httpServer, realtime };
}

if (require.main === module) start();

module.exports = { buildApp, start };
