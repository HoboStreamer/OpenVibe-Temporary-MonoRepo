'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const { attachIconAssets } = require('@openvibe/icons/express');
const { createServiceRuntime } = require('@openvibe/runtime');

const config = require('./config');
const db = require('./db');
const model = require('./model');
const { buildEventBus } = require('./events');
const { buildRouter } = require('./routes');
const { buildAuthClient, optionalOpenVibeAuth, serviceActorMiddleware } = require('./middleware');

function seedGlobalRoom() {
    try {
        if (!model.getRoom('global')) {
            model.createRoom({
                id: 'global',
                room_type: 'global',
                title: 'OpenVibe Global',
                visibility: 'public',
                owner_type: 'service',
                owner_id: 'openvibe-chat',
            });
            console.log('[openvibe-chat] seeded global room');
        }
    } catch (err) {
        console.warn('[openvibe-chat] could not seed global room:', err.message);
    }
}

function buildApp() {
    db.init(config.db.path);
    seedGlobalRoom();

    const eventBus = buildEventBus(config);
    const authClient = buildAuthClient(config);

    const app = express();
    app.set('trust proxy', 1);
    app.use(helmet({ contentSecurityPolicy: false }));
    app.use(cors({ origin: true, credentials: true }));
    app.use(cookieParser());

    const runtime = createServiceRuntime({
        serviceName: config.serviceId || 'openvibe-chat',
        getHealth: () => ({
            persistence: db.describePersistence(),
            auth_issuer: config.auth && config.auth.issuer || null,
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
                    name: 'auth_issuer_configured',
                    ok: !!(config.auth && config.auth.issuer),
                    critical: true,
                    details: { issuer: config.auth && config.auth.issuer || null },
                },
            ],
        }),
    });
    runtime.attach(app);

    attachIconAssets(app, { routePrefix: '/assets' });
    app.use(express.static(path.join(__dirname, '..', 'public')));

    // Service-actor middleware MUST run before policy decisions.
    app.use(serviceActorMiddleware(config.internalKey));
    app.use(optionalOpenVibeAuth(authClient));

    // Shim so openvibe.js loadSession() works on this domain.
    app.get('/account/session', (req, res) => {
        if (req.user) {
            return res.json({
                authenticated: true,
                anonymous: !!(req.user.anonymous || req.user.anon),
                user: {
                    id: String(req.user.sub || req.user.id || ''),
                    username: req.user.username || req.user.preferred_username || null,
                    display_name: req.user.display_name || req.user.name || req.user.username || null,
                    role: req.user.role || 'user',
                },
            });
        }
        return res.json({ authenticated: false, anonymous: false, user: null });
    });

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
