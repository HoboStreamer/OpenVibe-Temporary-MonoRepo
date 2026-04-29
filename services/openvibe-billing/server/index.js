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
const { buildRouter, buildTipsRouter, buildVipRouter } = require('./routes');
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
        serviceName: config.serviceId || 'openvibe-billing',
        getHealth: () => ({
            persistence: db.describePersistence(),
            economy: {
                platform_fee_bps: config.platformFeeBps,
                currency: config.creditsCurrency,
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
                    name: 'currency_configured',
                    ok: !!config.creditsCurrency,
                    critical: true,
                    details: { currency: config.creditsCurrency || null },
                },
            ],
        }),
    });
    runtime.attach(app);

    app.use(express.static(path.join(__dirname, '..', 'public')));

    const svcMw = serviceActorMiddleware(config.internalKey);
    app.use('/api/billing', svcMw, buildRouter({ eventBus }));
    app.use('/api/tips',    svcMw, buildTipsRouter({ eventBus }));
    app.use('/api/vip',     svcMw, buildVipRouter({ eventBus }));

    app.use((err, _req, res, _next) => {
        console.error('[billing] unhandled:', err && err.stack || err);
        res.status(500).json({ error: 'internal error' });
    });

    return { app, eventBus };
}

function start() {
    const { app } = buildApp();
    const server = app.listen(config.port, config.host, () => {
        console.log(`[openvibe-billing] listening on http://${config.host}:${config.port}`);
    });
    const shutdown = () => { console.log('[openvibe-billing] shutting down'); server.close(() => process.exit(0)); };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    return { app, server };
}

if (require.main === module) start();

module.exports = { buildApp, start };
