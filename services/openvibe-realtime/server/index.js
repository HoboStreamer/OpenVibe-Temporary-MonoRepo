'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const { createServiceRuntime } = require('@openvibe/runtime');

const config = require('./config');
const { createSocketRuntime } = require('./socket-runtime');

function buildApp() {
    const app = express();
    app.set('trust proxy', 1);
    app.use(helmet({ contentSecurityPolicy: false }));
    app.use(cors());
    app.use(express.json({ limit: '128kb' }));

    let socketRuntime = null;
    const runtime = createServiceRuntime({
        serviceName: config.serviceId,
        getHealth: () => ({
            redis_configured: !!config.redisUrl,
            anonymous_allowed: !!config.allowAnonymous,
            sockets: socketRuntime ? socketRuntime.summary() : { namespaces: [] },
        }),
        getReadiness: () => ({
            checks: [
                {
                    name: 'redis_adapter',
                    ok: !!config.redisUrl,
                    critical: false,
                    details: { configured: !!config.redisUrl },
                    message: config.redisUrl ? null : 'Redis adapter not configured; realtime service is running single-node only.',
                },
                {
                    name: 'internal_key_overridden',
                    ok: config.internalKey !== 'change-me-in-production',
                    critical: false,
                    details: { using_default_key: config.internalKey === 'change-me-in-production' },
                    message: config.internalKey === 'change-me-in-production' ? 'Development default internal key is still configured.' : null,
                },
            ],
            extra: {
                namespaces: socketRuntime ? socketRuntime.summary().namespaces : [],
            },
        }),
    });
    runtime.attach(app);

    socketRuntime = createSocketRuntime(app, { config, metrics: runtime.metrics });

    app.get('/api/v1/realtime/namespaces', (_req, res) => {
        res.json({ items: socketRuntime.summary().namespaces });
    });

    app.get('/api/v1/realtime/connections', (_req, res) => {
        res.json(socketRuntime.summary());
    });

    app.use((err, _req, res, _next) => {
        console.error('[openvibe-realtime] unhandled:', err && err.stack || err);
        res.status(500).json({ error: 'internal error' });
    });

    return { app, socketRuntime, httpServer: socketRuntime.httpServer };
}

function start() {
    const { httpServer, socketRuntime } = buildApp();
    socketRuntime.start().catch((error) => {
        console.error('[openvibe-realtime] failed to start socket runtime:', error && error.stack || error);
    });
    httpServer.listen(config.port, config.host, () => {
        console.log(`[openvibe-realtime] listening on http://${config.host}:${config.port}`);
    });
    const shutdown = () => {
        socketRuntime.stop().finally(() => httpServer.close(() => process.exit(0)));
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    return { httpServer, socketRuntime };
}

if (require.main === module) start();

module.exports = { buildApp, start };