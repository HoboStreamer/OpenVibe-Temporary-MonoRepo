'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');

const config = require('./config');
const db = require('./db');
const { buildEventBus } = require('./events');
const { buildRouter } = require('./routes');
const { buildAuthClient, optionalOpenVibeAuth, serviceActorMiddleware } = require('./middleware');

function buildApp() {
    db.init(config.db.path);

    const eventBus = buildEventBus(config);
    const authClient = buildAuthClient(config);

    const app = express();
    app.set('trust proxy', 1);
    app.use(helmet({ contentSecurityPolicy: false }));
    app.use(cors({ origin: true, credentials: true }));
    app.use(cookieParser());

    app.get('/health', (_req, res) => res.json({
        ok: true,
        service: config.serviceId,
        persistence: db.describePersistence(),
    }));

    app.use(express.static(path.join(__dirname, '..', 'public')));

    // Service-actor middleware MUST run before policy decisions.
    app.use(serviceActorMiddleware(config.internalKey));
    app.use(optionalOpenVibeAuth(authClient));
    app.use('/api/chat', buildRouter({ eventBus }));

    app.use((err, _req, res, _next) => {
        console.error('[chat] unhandled:', err.message);
        res.status(500).json({ error: 'internal error' });
    });

    return { app };
}

function start() {
    const { app } = buildApp();
    const server = app.listen(config.port, config.host, () => {
        console.log(`[openvibe-chat] listening on http://${config.host}:${config.port}`);
    });
    const shutdown = () => { console.log('[openvibe-chat] shutting down'); server.close(() => process.exit(0)); };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    return { app, server };
}

if (require.main === module) start();

module.exports = { buildApp, start };
