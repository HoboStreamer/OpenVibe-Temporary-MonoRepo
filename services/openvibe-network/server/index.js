'use strict';

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { createServiceRuntime } = require('@openvibe/runtime');
const { attachIconAssets } = require('@openvibe/icons/express');

const config = require('./config');
const db = require('./db');
const audit = require('./audit');
const { buildIdentity } = require('./identity');
const { buildNativeAuth } = require('./native-auth');
const { buildHoboToolsProxy } = require('./proxy');
const { attachHostRouter } = require('./host-router');
const { serviceActorMiddleware } = require('./middleware/service-actor');

const { OpenVibeAuthClient, optionalOpenVibeAuth, requireOpenVibeAuth, EventsClient } = require('@openvibe/sdk');

const userModules = require('./api/user-modules');
const serviceRegistry = require('./api/service-registry');
const capabilityRegistry = require('./api/capability-registry');
const capabilityInvoke = require('./api/capability-invoke');
const contractRegistry = require('./api/contract-registry');
const urlRegistry = require('./api/url-registry');
const runtimeParity = require('./api/runtime-parity');
const staff = require('./api/staff');
const { seedCapabilityRegistry } = require('./capabilities');

function buildApp() {
    db.init(config.db.path);
    seedCapabilityRegistry(db.get());

    const identity = buildIdentity(config);
    const nativeAuth = buildNativeAuth({ config, identity });

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
    app.use(express.urlencoded({ extended: false, limit: '256kb' }));

    const runtime = createServiceRuntime({
        serviceName: 'openvibe-network',
        getHealth: () => ({
            persistence: db.describePersistence(),
            federation: config.hoboTools.publicUrl ? { hobo_tools: config.hoboTools.publicUrl } : { mode: 'native' },
            trusted_issuers: identity.trustedIssuers.map((issuer) => ({ issuer: issuer.issuer, label: issuer.label })),
            surface_count: Object.keys(config.surfaces || {}).length,
        }),
        getReadiness: () => ({
            persistence: db.describePersistence(),
            checks: [
                {
                    name: 'trusted_issuers',
                    ok: identity.trustedIssuers.length > 0,
                    critical: true,
                    details: { count: identity.trustedIssuers.length },
                },
                {
                    name: 'events_url_configured',
                    ok: !!config.events.url,
                    critical: true,
                    details: { url: config.events.url || null },
                },
                {
                    name: 'native_mode_default',
                    ok: !config.hoboTools.publicUrl,
                    critical: false,
                    details: { legacy_proxy_url: config.hoboTools.publicUrl || null },
                    message: config.hoboTools.publicUrl ? 'Legacy federation is configured as an optional runtime path.' : null,
                },
            ],
            extra: {
                surface_count: Object.keys(config.surfaces || {}).length,
            },
        }),
    });
    runtime.attach(app);

    // Service-actor first (sets req.serviceActor), then optional user auth.
    app.use(serviceActorMiddleware(config.internalKey));
    app.use(optionalOpenVibeAuth(authClient));

    // ── /api/v1 — Phase 1 kernel APIs ────────────────────────
    const apiRouter = express.Router();
    apiRouter.use(userModules.buildRouter({ events }));
    apiRouter.use(serviceRegistry.buildRouter({ events }));
    apiRouter.use(capabilityRegistry.buildRouter({ events }));
    apiRouter.use(capabilityInvoke.buildRouter({ events, config }));
    apiRouter.use(contractRegistry.buildRouter({ events }));
    apiRouter.use(urlRegistry.buildRouter({ config }));
    apiRouter.use(runtimeParity.buildRouter({ events }));
    apiRouter.use(staff.buildRouter({ config }));
    apiRouter.use(nativeAuth.buildAccountRouter());

    apiRouter.get('/session', (req, res) => res.json(nativeAuth.buildSessionResponse(req)));
    apiRouter.get('/me', requireOpenVibeAuth(authClient), (req, res) => res.json({ user: nativeAuth.resolveSessionUser(req) || req.user }));
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

    // Shared icon assets must be mounted before host-aware shell routing so
    // per-surface static fallbacks do not 404 /assets/openvibe-icons.* first.
    attachIconAssets(app, { routePrefix: '/assets' });

    // ── host-aware surfaces (Phase 2) ────────────────────────
    attachHostRouter({ app, config, hoboToolsProxy, identity, nativeAuth });

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
