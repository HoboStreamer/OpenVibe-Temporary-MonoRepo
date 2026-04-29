'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { createServiceRuntime } = require('@openvibe/runtime');

const config = require('./config');
const db = require('./db');
const bus = require('./bus');
const { buildRouter } = require('./routes');
const { Worker } = require('./worker');

function buildApp() {
    db.init(config.db.path);
    bus.configureFanout(config);

    const app = express();
    app.set('trust proxy', 1);
    app.use(helmet({ contentSecurityPolicy: false }));
    app.use(cors());
    app.use(express.json({ limit: '512kb' }));

    const runtime = createServiceRuntime({
        serviceName: 'openvibe-events',
        getHealth: () => ({
            persistence: db.describePersistence(),
            worker: {
                dispatch_interval_ms: config.worker.dispatchIntervalMs,
                max_attempts: config.worker.maxAttempts,
            },
            fanout: {
                redis_configured: !!config.redisUrl,
                stream_namespace: config.streamNamespace,
            },
        }),
        getReadiness: () => ({
            persistence: db.describePersistence(),
            checks: [
                {
                    name: 'worker_interval_ms',
                    ok: config.worker.dispatchIntervalMs > 0,
                    critical: true,
                    details: { value: config.worker.dispatchIntervalMs },
                },
                {
                    name: 'internal_key_overridden',
                    ok: config.internalKey !== 'change-me-in-production',
                    critical: false,
                    details: { using_default_key: config.internalKey === 'change-me-in-production' },
                    message: config.internalKey === 'change-me-in-production' ? 'Development default internal key is still configured.' : null,
                },
                {
                    name: 'redis_stream_fanout',
                    ok: !!config.redisUrl,
                    critical: false,
                    details: { configured: !!config.redisUrl, stream_namespace: config.streamNamespace },
                    message: config.redisUrl ? null : 'Redis Streams fanout is not configured; event delivery remains SQLite-bootstrap only.',
                },
            ],
            extra: {
                queue_mode: config.redisUrl ? 'sqlite-audit+redis-stream-fanout' : 'sqlite-bootstrap',
            },
        }),
    });
    runtime.attach(app);

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
