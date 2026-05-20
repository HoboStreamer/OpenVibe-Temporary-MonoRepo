'use strict';

const express      = require('express');
const helmet       = require('helmet');
const cors         = require('cors');
const cookieParser = require('cookie-parser');
const path         = require('path');
const { createServiceRuntime } = require('@openvibe/runtime');

const config = require('./config');
const db     = require('./db');
const { buildAuthRouter }     = require('./auth-routes');
const { buildEventBus }       = require('./events');
const { buildRouter, buildWebhookRouter, buildOverlayRouter } = require('./routes');
const { buildAuthClient, optionalOpenVibeAuth, serviceActorMiddleware } = require('./middleware');
const { buildSessionResponse } = require('./session');

const { attachIconAssets } = require('@openvibe/icons/express');

function deriveBaseUrl(req) {
    const forwardedProto = req.headers['x-forwarded-proto'];
    const protocol       = forwardedProto ? String(forwardedProto).split(',')[0].trim() : req.protocol;
    const host           = req.get('host');
    return host ? `${protocol}://${host}` : config.publicBaseUrl;
}

function buildApp() {
    db.init(config.db.path);
    const eventBus   = buildEventBus(config);
    const authClient = buildAuthClient(config);

    const app = express();
    app.set('trust proxy', 2);
    app.use(helmet({ contentSecurityPolicy: false }));
    app.use(cors({ origin: true, credentials: true }));
    app.use(cookieParser());

    const runtime = createServiceRuntime({
        serviceName: config.serviceId || 'openvibe-tips',
        getHealth: () => ({
            persistence:   db.describePersistence(),
            connectors:    require('./connectors').listConnectorTypes().map(c => c.type),
            auth_issuer:   config.auth && config.auth.issuer || null,
        }),
        getReadiness: () => ({
            persistence: db.describePersistence(),
            checks: [
                {
                    name:     'internal_key_overridden',
                    ok:       config.internalKey !== 'change-me-in-production',
                    critical: false,
                    details:  { using_default_key: config.internalKey === 'change-me-in-production' },
                },
                {
                    name:     'auth_issuer_configured',
                    ok:       !!(config.auth && config.auth.issuer),
                    critical: true,
                    details:  { issuer: config.auth && config.auth.issuer || null },
                },
                {
                    name:     'native_billing_reachable',
                    ok:       true, // lazy — tested at runtime
                    critical: false,
                    details:  { billing_url: config.upstream && config.upstream.billing || null },
                    message:  'Billing URL connectivity checked lazily on first native tip',
                },
            ],
        }),
    });
    runtime.attach(app);

    app.use(optionalOpenVibeAuth(authClient));
    app.use(buildAuthRouter({
        authClient,
        config,
        deriveBaseUrl,
        serviceName: 'openvibe.tips',
    }));

    // Icon assets must come before the host router / static fallback
    attachIconAssets(app);

    app.use(express.static(path.join(__dirname, '..', 'public')));

    // Webhook routes — authenticated by per-creator webhook tokens, not internal key
    app.use('/webhooks', buildWebhookRouter({ eventBus }));

    // Overlay routes — public (for OBS browser sources)
    app.use('/overlay', buildOverlayRouter({ config }));

    // Session endpoint — required by the shared openvibe.js frontend on every surface.
    app.get('/api/v1/session', (req, res) => res.json(buildSessionResponse(req)));

    // API routes — service actor middleware for internal calls
    app.use('/api/v1', serviceActorMiddleware(config.internalKey), buildRouter({ eventBus, config, buildSessionResponse }));

    // Creator tip page — serves the frontend SPA for /:slug
    app.get('/:slug([a-z0-9_-]{2,48})', (req, res) => {
        res.sendFile(path.join(__dirname, '..', 'public', 'tip-page.html'));
    });

    app.use((err, _req, res, _next) => {
        console.error('[openvibe-tips] unhandled error:', err && err.message);
        res.status(500).json({ error: 'internal error' });
    });

    return { app };
}

function start() {
    const { app } = buildApp();
    const server  = app.listen(config.port, config.host, () => {
        console.log(`[openvibe-tips] listening on http://${config.host}:${config.port}`);
    });
    const shutdown = () => { server.close(() => process.exit(0)); };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    return { app, server };
}

if (require.main === module) start();

module.exports = { buildApp, start };
