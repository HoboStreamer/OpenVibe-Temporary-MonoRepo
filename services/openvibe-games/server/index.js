'use strict';

const { createServer } = require('http');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const { attachIconAssets } = require('@openvibe/icons/express');
const { createServiceRuntime } = require('@openvibe/runtime');

const config = require('./config');
const db = require('./db');
const { buildEventBus } = require('./events');
const { buildRouter } = require('./routes');
const { createRealtimeRuntime } = require('./realtime');
const { createSourceVibeEngine } = require('./sourcevibe');
const { serviceActorMiddleware, userContextMiddleware } = require('./middleware');

function buildApp() {
    db.init(config.db.path);

    const eventBus = buildEventBus(config);
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
    app.use(express.static(path.join(__dirname, '..', 'public')));

    const httpServer = createServer(app);
    realtime = createRealtimeRuntime({ httpServer, eventBus, config });
    realtime.start();
    sourcevibe = createSourceVibeEngine({ realtime, eventBus, config });

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
