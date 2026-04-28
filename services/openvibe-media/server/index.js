'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');

const config = require('./config');
const db = require('./db');
const { buildStorage } = require('./storage');
const { buildEventBus } = require('./events');
const { buildRouter, buildFilesRouter } = require('./routes');
const { ProcessingWorker } = require('./processing');
const { serviceActorMiddleware } = require('./middleware');

function buildApp() {
    db.init(config.db.path);

    const storage = buildStorage(config.storage);
    const eventBus = buildEventBus(config);

    const app = express();
    app.set('trust proxy', 1);
    app.use(helmet({ contentSecurityPolicy: false }));
    app.use(cors());
    app.use(cookieParser());

    app.get('/health', (_req, res) => res.json({
        ok: true,
        service: config.serviceId,
        persistence: db.describePersistence(),
        storage: storage.describePlan ? storage.describePlan() : { write_provider: storage.name() },
    }));

    // Static admin shell (read-only landing page).
    app.use(express.static(path.join(__dirname, '..', 'public')));

    // Mount API. service-actor middleware MUST run before policy decisions.
    app.use('/api/v1', serviceActorMiddleware(config.internalKey), buildRouter({
        storage, eventBus, internalKey: config.internalKey,
    }));

    // The /files/:id endpoint also needs service-actor + auth middleware so
    // private/restricted reads work for owner-services and owning users.
    app.use('/files', serviceActorMiddleware(config.internalKey), buildFilesRouter({ storage }));

    app.use((err, _req, res, _next) => {
        console.error('[media] unhandled:', err.message);
        res.status(500).json({ error: 'internal error' });
    });

    const worker = new ProcessingWorker({
        intervalMs: config.processing.intervalMs,
        storage,
        publishMediaEvent: eventBus.publishMediaEvent,
    });

    return { app, worker };
}

function start() {
    const { app, worker } = buildApp();
    worker.start();
    const server = app.listen(config.port, config.host, () => {
        console.log(`[openvibe-media] listening on http://${config.host}:${config.port}`);
    });
    const shutdown = () => {
        console.log('[openvibe-media] shutting down');
        worker.stop();
        server.close(() => process.exit(0));
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    return { app, server, worker };
}

if (require.main === module) {
    start();
}

module.exports = { buildApp, start };
