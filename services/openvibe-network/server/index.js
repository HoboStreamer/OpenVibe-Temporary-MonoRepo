'use strict';

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const config = require('./config');
const db = require('./db');
const audit = require('./audit');
const { buildIdentity } = require('./identity');
const { buildHoboToolsProxy } = require('./proxy');
const { attachHostRouter } = require('./host-router');
const { serviceActorMiddleware } = require('./middleware/service-actor');

const { OpenVibeAuthClient, optionalOpenVibeAuth, requireOpenVibeAuth, EventsClient } = require('@openvibe/sdk');

const userModules = require('./api/user-modules');
const serviceRegistry = require('./api/service-registry');
const capabilityRegistry = require('./api/capability-registry');
const contractRegistry = require('./api/contract-registry');
const urlRegistry = require('./api/url-registry');

function buildApp() {
    db.init(config.db.path);

    const identity = buildIdentity(config);

    // Multi-issuer auth client built from the same trusted issuers we publish
    // in the JWKS, so verifying tokens stays consistent with the identity surface.
    const authClient = new OpenVibeAuthClient();
    for (const i of identity.trustedIssuers) {
        authClient.addIssuer({ issuer: i.issuer, publicKey: i.publicKey, label: i.label });
    }

    const events = new EventsClient({
        eventsUrl: config.events.url,
        internalKey: config.internalKey,
        source: 'openvibe-network',
    });

    const hoboToolsProxy = buildHoboToolsProxy(config);

    const app = express();
    app.set('trust proxy', 1);
    app.use(helmet({ contentSecurityPolicy: false }));
    app.use(cookieParser());
    app.use(cors({ origin: true, credentials: true }));
    app.use(express.json({ limit: '1mb' }));

    app.get('/health', (_req, res) => res.json({
        ok: true,
        service: 'openvibe-network',
        federation: config.hoboTools.publicUrl ? { hobo_tools: config.hoboTools.publicUrl } : { mode: 'native' },
        trusted_issuers: identity.trustedIssuers.map(i => ({ issuer: i.issuer, label: i.label })),
    }));

    // Service-actor first (sets req.serviceActor), then optional user auth.
    app.use(serviceActorMiddleware(config.internalKey));
    app.use(optionalOpenVibeAuth(authClient));

    // ── /api/v1 — Phase 1 kernel APIs ────────────────────────
    const apiRouter = express.Router();
    apiRouter.use(userModules.buildRouter({ events }));
    apiRouter.use(serviceRegistry.buildRouter({ events }));
    apiRouter.use(capabilityRegistry.buildRouter({ events }));
    apiRouter.use(contractRegistry.buildRouter({ events }));
    apiRouter.use(urlRegistry.buildRouter({ config }));

    apiRouter.get('/me', requireOpenVibeAuth(authClient), (req, res) => res.json({ user: req.user }));
    apiRouter.get('/audit', (req, res) => {
        // Read-only diagnostic — limited to admins.
        if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'admin only' });
        res.json({ items: audit.recent({ limit: req.query.limit }) });
    });
    apiRouter.get('/topics', (_req, res) => {
        res.json({ items: require('@openvibe/contracts/topics').TOPIC_LIST });
    });
    apiRouter.get('/namespaces', (_req, res) => {
        res.json({ items: require('@openvibe/contracts/namespaces').NAMESPACES });
    });

    app.use('/api/v1', apiRouter);

    // ── host-aware surfaces (Phase 2) ────────────────────────
    attachHostRouter({ app, config, hoboToolsProxy, identity });

    // Static shells fallback (the host router already serves these per surface,
    // but expose the bundle so a developer can hit /admin.html directly during
    // dev without subdomain DNS).
    app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));

    app.use((err, _req, res, _next) => {
        console.error('[network] unhandled:', err.stack || err.message);
        res.status(err.status || 500).json({ error: err.message || 'internal error' });
    });

    return { app, identity, authClient, events };
}

function start() {
    const { app } = buildApp();
    return app.listen(config.port, config.host, () => {
        console.log(`[openvibe-network] listening on http://${config.host}:${config.port}`);
        console.log(`[openvibe-network] surfaces:`, config.surfaces);
    });
}

if (require.main === module) {
    start();
}

module.exports = { buildApp, start };
