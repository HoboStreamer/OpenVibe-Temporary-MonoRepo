'use strict';

const express    = require('express');
const helmet     = require('helmet');
const cors       = require('cors');
const cookieParser = require('cookie-parser');

const { createServiceRuntime } = require('@openvibe/runtime');
const { OpenVibeAuthClient, optionalOpenVibeAuth } = require('@openvibe/sdk');

const config = require('./config');
const { buildRouter } = require('./routes');

function buildApp() {
    const app = express();
    app.set('trust proxy', 2);

    app.use(helmet({ contentSecurityPolicy: false }));
    app.use(cors({ origin: true, credentials: true }));
    app.use(cookieParser());
    app.use(express.json({ limit: '1mb' }));

    const authClient = new OpenVibeAuthClient();
    if (config.auth && config.auth.issuer) {
        authClient.addIssuer({
            issuer: config.auth.issuer,
            publicKeyPath: config.auth.publicKeyPath,
            label: 'openvibe',
        });
    }

    const runtime = createServiceRuntime({
        serviceName: config.serviceId,
        getHealth: () => ({
            admin_panel: true,
            services: Object.keys(config.services),
        }),
        getReadiness: () => ({
            checks: [
                {
                    name: 'auth_issuer_configured',
                    ok: !!(config.auth && config.auth.issuer),
                    critical: false,
                    details: { issuer: config.auth && config.auth.issuer || null },
                },
                {
                    name: 'internal_key_overridden',
                    ok: config.internalKey !== 'change-me-in-production',
                    critical: false,
                    details: { using_default_key: config.internalKey === 'change-me-in-production' },
                },
            ],
        }),
    });

    runtime.attach(app);

    app.use(optionalOpenVibeAuth(authClient));

    app.use('/control', buildRouter(config));

    // Redirect root to control panel
    app.get('/', (_req, res) => res.redirect('/control'));

    // 404
    app.use((_req, res) => {
        res.status(404).json({ error: 'not found' });
    });

    // Error handler
    app.use((err, _req, res, _next) => {
        console.error('[openvibe-control] unhandled:', err && err.stack || err);
        if (!res.headersSent) res.status(500).json({ error: 'internal error' });
    });

    return { app };
}

function start() {
    const { app } = buildApp();
    app.listen(config.port, config.host, () => {
        console.log(`[openvibe-control] listening on http://${config.host}:${config.port}`);
    });
}

module.exports = { buildApp, start };

if (require.main === module) start();
