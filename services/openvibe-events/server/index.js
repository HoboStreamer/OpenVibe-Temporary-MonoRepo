'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const config = require('./config');
const db = require('./db');
const { buildRouter } = require('./routes');
const { Worker } = require('./worker');

function buildApp() {
    db.init(config.db.path);

    const app = express();
    app.set('trust proxy', 1);
    app.use(helmet({ contentSecurityPolicy: false }));
    app.use(cors());
    app.use(express.json({ limit: '512kb' }));

    app.get('/health', (_req, res) => res.json({ ok: true, service: 'openvibe-events' }));
    app.use('/api/v1', buildRouter(config.internalKey));

    app.use((err, _req, res, _next) => {
        console.error('[events] unhandled:', err.message);
        res.status(500).json({ error: 'internal error' });
    });

    return app;
}

function start() {
    const app = buildApp();
    const worker = new Worker(config.worker);
    worker.start();
    const server = app.listen(config.port, config.host, () => {
        console.log(`[openvibe-events] listening on http://${config.host}:${config.port}`);
    });
    const shutdown = () => {
        console.log('[openvibe-events] shutting down');
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
