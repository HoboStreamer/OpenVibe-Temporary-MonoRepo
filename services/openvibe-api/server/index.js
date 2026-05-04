'use strict';

const express    = require('express');
const helmet     = require('helmet');
const cors       = require('cors');
const cookieParser = require('cookie-parser');

const { createServiceRuntime } = require('@openvibe/runtime');
const { buildAuthClient, optionalOpenVibeAuth } = require('./middleware');

const config  = require('./config');
const { buildRouter } = require('./routes');

function buildApp() {
    const app = express();
    app.set('trust proxy', 2);

    app.use(helmet({ contentSecurityPolicy: false }));
    app.use(cors({ origin: true, credentials: true }));
    app.use(cookieParser());
    app.use(express.json({ limit: '2mb' }));

    const authClient = buildAuthClient(config);

    const runtime = createServiceRuntime({
        serviceName: config.serviceId,
        getHealth: () => ({
            services: Object.fromEntries(
                Object.entries(config.services).map(([k, v]) => [k, v])
            ),
        }),
        getReadiness: () => ({
            checks: [
                {
                    name: 'internal_key_overridden',
                    ok: config.internalKey !== 'change-me-in-production',
                    critical: false,
                    details: { using_default_key: config.internalKey === 'change-me-in-production' },
                    message: config.internalKey === 'change-me-in-production'
                        ? 'Development default internal key in use.'
                        : null,
                },
                {
                    name: 'auth_issuer_configured',
                    ok: !!(config.auth && config.auth.issuer),
                    critical: false,
                    details: { issuer: config.auth && config.auth.issuer || null },
                },
            ],
        }),
    });

    runtime.attach(app);
    app.use(optionalOpenVibeAuth(authClient));

    // ── gateway introspection ───────────────────────────────────
    app.get('/api/v1', (_req, res) => {
        res.json({
            service: config.serviceId,
            version: '1',
            routes: Object.keys(config.services).map((key) => ({
                prefix: `/api/v1/${key}`,
                upstream: config.services[key],
            })),
        });
    });

    // ── proxied service routes ────────────────────────────────
    app.use('/api/v1', buildRouter(config));

    // ── 404 fallback ──────────────────────────────────────────
    app.use((_req, res) => {
        res.status(404).json({
            error: 'not found',
            hint: 'Available service prefixes: ' + Object.keys(config.services).map((k) => `/api/v1/${k}`).join(', '),
        });
    });

    app.use((err, _req, res, _next) => {
        console.error('[openvibe-api] unhandled:', err && err.stack || err);
        res.status(500).json({ error: 'internal error' });
    });

    return { app };
}

function start() {
    const { app } = buildApp();
    app.listen(config.port, config.host, () => {
        console.log(`[openvibe-api] listening on http://${config.host}:${config.port}`);
    });
}

module.exports = { buildApp, start };

if (require.main === module) start();
