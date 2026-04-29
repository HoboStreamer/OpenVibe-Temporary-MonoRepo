'use strict';

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
const { serviceActorMiddleware, userContextMiddleware } = require('./middleware');

function buildApp() {
    db.init(config.db.path);

    const eventBus = buildEventBus(config);

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
            ],
        }),
    });
    runtime.attach(app);

    attachIconAssets(app, { routePrefix: '/assets' });
    app.use(express.static(path.join(__dirname, '..', 'public')));

    app.use('/api/games', serviceActorMiddleware(config.internalKey), userContextMiddleware(), buildRouter({ eventBus }));

    app.use((err, _req, res, _next) => {
        console.error('[games] unhandled:', err.message);
        res.status(500).json({ error: 'internal error' });
    });

    return { app };
}

function start() {
    const { app } = buildApp();
    const server = app.listen(config.port, config.host, () => {
        console.log(`[openvibe-games] listening on http://${config.host}:${config.port}`);
    });
    const shutdown = () => {
        console.log('[openvibe-games] shutting down');
        server.close(() => process.exit(0));
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    return { app, server };
}

if (require.main === module) start();

module.exports = { buildApp, start };
