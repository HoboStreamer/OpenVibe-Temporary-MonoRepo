'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const { createServiceRuntime } = require('@openvibe/runtime');

const config = require('./config');
const db = require('./db');
const seeds = require('./seeds');
const { buildEventBus } = require('./events');
const { buildRouter } = require('./routes');
const { serviceActorMiddleware } = require('./middleware');

function buildApp() {
    db.init(config.db.path);
    const seeded = seeds.seedAll();

    const eventBus = buildEventBus(config);

    const app = express();
    app.set('trust proxy', 1);
    app.use(helmet({ contentSecurityPolicy: false }));
    app.use(cors());
    app.use(cookieParser());

    const runtime = createServiceRuntime({
        serviceName: config.serviceId || 'openvibe-ai',
        getHealth: () => ({
            persistence: db.describePersistence(),
            canonical_host: config.canonicalHost,
            seeded,
        }),
        getReadiness: () => ({
            persistence: db.describePersistence(),
            checks: [
                {
                    name: 'seeded_providers',
                    ok: !!(seeded && seeded.providers),
                    critical: true,
                    details: { providers: seeded && seeded.providers || 0 },
                },
                {
                    name: 'seeded_workflows',
                    ok: !!(seeded && seeded.workflows),
                    critical: true,
                    details: { workflows: seeded && seeded.workflows || 0 },
                },
                {
                    name: 'events_url_configured',
                    ok: !!(config.events && config.events.url),
                    critical: true,
                    details: { url: config.events && config.events.url || null },
                },
            ],
        }),
    });
    runtime.attach(app);

    app.use(express.static(path.join(__dirname, '..', 'public')));

    const svcMw = serviceActorMiddleware(config.internalKey);
    const router = buildRouter({ config, eventBus });
    app.use('/api/v1/ai', svcMw, router);
    app.use('/api/ai',    svcMw, router); // compat alias

    app.use((err, _req, res, _next) => {
        console.error('[openvibe-ai] unhandled:', err && err.stack || err);
        res.status(500).json({ error: 'internal_error' });
    });

    return { app, eventBus };
}

function start() {
    const { app } = buildApp();
    const server = app.listen(config.port, config.host, () => {
        console.log(`[openvibe-ai] listening on http://${config.host}:${config.port} (canonical ${config.canonicalUrl})`);
    });
    const shutdown = () => { console.log('[openvibe-ai] shutting down'); server.close(() => process.exit(0)); };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    return { app, server };
}

if (require.main === module) start();

module.exports = { buildApp, start };
