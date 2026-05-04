'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const { createServiceRuntime } = require('@openvibe/runtime');

const config = require('./config');
const db = require('./db');
const model = require('./model');
const { buildAuthRouter } = require('./auth-routes');
const { buildEventBus } = require('./events');
const { buildRouter } = require('./routes');
const { buildAuthClient, optionalOpenVibeAuth, serviceActorMiddleware } = require('./middleware');
const { buildSessionResponse } = require('./session');
const { renderDashboard, renderDashboardAuthGate } = require('./ssr');

function deriveBaseUrl(req) {
    const forwardedProto = req.headers['x-forwarded-proto'];
    const protocol = forwardedProto ? String(forwardedProto).split(',')[0].trim() : req.protocol;
    const host = req.get('host');
    return host ? `${protocol}://${host}` : config.publicBaseUrl;
}

function buildApp() {
    db.init(config.db.path);
    const eventBus = buildEventBus(config);
    const authClient = buildAuthClient(config);

    const app = express();
    app.set('trust proxy', 1);
    app.use(helmet({ contentSecurityPolicy: false }));
    app.use(cors({ origin: true, credentials: true }));
    app.use(cookieParser());

    const runtime = createServiceRuntime({
        serviceName: config.serviceId || 'openre-stream',
        getHealth: () => ({
            persistence: db.describePersistence(),
            ingest: config.ingest || null,
            auth_issuer: config.auth && config.auth.issuer || null,
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
                {
                    name: 'auth_issuer_configured',
                    ok: !!(config.auth && config.auth.issuer),
                    critical: true,
                    details: { issuer: config.auth && config.auth.issuer || null },
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
        serviceName: 'openre.stream',
    }));
    app.use(express.static(path.join(__dirname, '..', 'public')));

    // ── dashboard: authenticated SSR page ─────────────────────────────────
    app.get('/dashboard', (req, res) => {
        if (!req.user) {
            const returnUrl = req.originalUrl || '/dashboard';
            return res.status(401).send(renderDashboardAuthGate({ returnUrl }));
        }
        const userId = String(req.user.id || req.user.sub || '');
        const channels     = model.listChannels({ owner_user_id: userId, limit: 50 });
        const destinations = model.listDestinations({ owner_user_id: userId });
        const streams      = channels.length
            ? model.listStreams({ channel_id: null, status: null, limit: 20 }).filter((s) => {
                const ch = channels.find((c) => c.id === s.channel_id);
                return !!ch;
            })
            : [];

        const html = renderDashboard({
            user:         req.user,
            channels,
            destinations,
            streams,
            outputs:      [],
            ingestConfig: config.ingest || {},
        });
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(html);
    });

    app.use('/api/v1', serviceActorMiddleware(config.internalKey), buildRouter({ eventBus, config, buildSessionResponse }));

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
