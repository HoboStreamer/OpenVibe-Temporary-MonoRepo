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
const { serviceActorMiddleware } = require('./middleware');

function buildApp() {
    db.init(config.db.path);
    const eventBus = buildEventBus(config);

    const app = express();
    app.set('trust proxy', 1);
    app.use(helmet({ contentSecurityPolicy: false }));
    app.use(cors());
    app.use(cookieParser());

    app.get('/health', (_req, res) => res.json({ ok: true, service: config.serviceId }));

    app.use(express.static(path.join(__dirname, '..', 'public')));

    const apiRouter = buildRouter({ eventBus, config });

    // Canonical API surface.
    app.use('/api/community', serviceActorMiddleware(config.internalKey), apiRouter);

    // Legacy paste compatibility — `/api/pastes/*` reroutes into community pastes.
    app.use('/api/pastes', serviceActorMiddleware(config.internalKey), (req, _res, next) => {
        const sub = req.url === '/' ? '' : req.url;
        req.url = `/pastes${sub}`;
        return apiRouter(req, _res, next);
    });

    // /p/:slug — friendly paste viewer URL (returns JSON; HTML view lives in client).
    app.get('/p/:slug', (req, res) => {
        const m = require('./model');
        const paste = m.getPasteBySlug(req.params.slug);
        if (!paste) return res.status(404).json({ error: 'paste not found' });
        m.bumpPasteView(paste.slug);
        res.json({ paste });
    });

    app.use((err, _req, res, _next) => {
        console.error('[community] unhandled:', err.message);
        res.status(500).json({ error: 'internal error' });
    });

    return { app };
}

function start() {
    const { app } = buildApp();
    const server = app.listen(config.port, config.host, () => {
        console.log(`[openvibe-community] listening on http://${config.host}:${config.port}`);
    });
    const shutdown = () => { console.log('[openvibe-community] shutting down'); server.close(() => process.exit(0)); };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    return { app, server };
}

if (require.main === module) start();

module.exports = { buildApp, start };
