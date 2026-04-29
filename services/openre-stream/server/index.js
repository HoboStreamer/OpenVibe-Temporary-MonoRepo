'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const { createServiceRuntime } = require('@openvibe/runtime');

const config = require('./config');
const db = require('./db');
const { buildEventBus } = require('./events');
const { buildRouter } = require('./routes');
const { serviceActorMiddleware } = require('./middleware');

function buildApp() {
    db.init(config.db.path);
    const eventBus = buildEventBus(config);

    const app = express();
    app.set('trust proxy', 1);
    app.use(helmet({ contentSecurityPolicy: false }));
    app.use(cors());
    app.use(cookieParser());

    const runtime = createServiceRuntime({
        serviceName: config.serviceId || 'openre-stream',
        getHealth: () => ({
            persistence: db.describePersistence(),
            ingest: config.ingest || null,
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
            ],
        }),
    });
    runtime.attach(app);

    app.use(express.static(path.join(__dirname, '..', 'public')));

    app.use('/api/v1', serviceActorMiddleware(config.internalKey), buildRouter({ eventBus, config }));

    app.use((err, _req, res, _next) => {
        console.error('[openre-stream] unhandled:', err.message);
        res.status(500).json({ error: 'internal error' });
    });

    return { app };
}

function start() {
    const { app } = buildApp();
    const server = app.listen(config.port, config.host, () => {
        console.log(`[openre-stream] listening on http://${config.host}:${config.port}`);
    });
    const shutdown = () => { server.close(() => process.exit(0)); };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    return { app, server };
}

if (require.main === module) start();

module.exports = { buildApp, start };
