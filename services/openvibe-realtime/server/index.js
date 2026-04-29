'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const { createServiceRuntime } = require('@openvibe/runtime');

const config = require('./config');
const { createEventBridge } = require('./event-bridge');
const { createSocketRuntime } = require('./socket-runtime');

function buildApp() {
    const app = express();
    app.set('trust proxy', 1);
    app.use(helmet({ contentSecurityPolicy: false }));
    app.use(cors());
    app.use(express.json({ limit: '128kb' }));

    let socketRuntime = null;
    let eventBridge = null;
    const runtime = createServiceRuntime({
        serviceName: config.serviceId,
        getHealth: () => ({
            redis_configured: !!config.redisUrl,
            events_url_configured: !!config.eventsUrl,
            anonymous_allowed: !!config.allowAnonymous,
            sockets: socketRuntime ? socketRuntime.summary() : { namespaces: [] },
            bridge: eventBridge ? eventBridge.summary() : { mode: 'disabled', started: false },
        }),
        getReadiness: () => ({
            checks: [
                {
                    name: 'redis_adapter',
                    status: socketRuntime && socketRuntime.summary().redis_adapter_connected
                        ? 'green'
                        : config.redisUrl ? 'red' : 'yellow',
                    ok: !!(socketRuntime && socketRuntime.summary().redis_adapter_connected),
                    critical: false,
                    details: {
                        configured: !!config.redisUrl,
                        connected: !!(socketRuntime && socketRuntime.summary().redis_adapter_connected),
                    },
                    message: socketRuntime && socketRuntime.summary().redis_adapter_connected
                        ? null
                        : config.redisUrl
                            ? 'Redis adapter is configured but not connected.'
                            : 'Redis adapter not configured; realtime service is running single-node only.',
                },
                {
                    name: 'event_bridge',
                    status: eventBridge && eventBridge.summary().mode === 'redis-stream'
                        ? 'green'
                        : eventBridge && eventBridge.summary().mode === 'polling'
                            ? 'yellow'
                            : 'red',
                    ok: !!(eventBridge && eventBridge.summary().started),
                    critical: true,
                    details: eventBridge ? eventBridge.summary() : { mode: 'disabled' },
                    message: eventBridge && eventBridge.summary().mode === 'redis-stream'
                        ? null
                        : eventBridge && eventBridge.summary().mode === 'polling'
                            ? 'Event bridge is running in polling fallback mode because Redis Streams are unavailable.'
                            : 'Realtime bridge is not started; Socket.IO rooms will not receive OpenVibe events.',
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
                bridge: eventBridge ? eventBridge.summary() : { mode: 'disabled', started: false },
            },
        }),
    });
    runtime.attach(app);

    socketRuntime = createSocketRuntime(app, { config, metrics: runtime.metrics });
    eventBridge = createEventBridge({ config, socketRuntime });

    app.get('/api/v1/realtime/namespaces', (_req, res) => {
        res.json({ items: socketRuntime.summary().namespaces });
    });

    app.get('/api/v1/realtime/connections', (_req, res) => {
        res.json(socketRuntime.summary());
    });

    app.get('/api/v1/realtime/bridge', (_req, res) => {
        res.json(eventBridge.summary());
    });

    app.use((err, _req, res, _next) => {
        console.error('[openvibe-realtime] unhandled:', err && err.stack || err);
        res.status(500).json({ error: 'internal error' });
    });

    return { app, socketRuntime, eventBridge, httpServer: socketRuntime.httpServer };
}

function start() {
    const { httpServer, socketRuntime, eventBridge } = buildApp();
    socketRuntime.start().catch((error) => {
        console.error('[openvibe-realtime] failed to start socket runtime:', error && error.stack || error);
    });
    eventBridge.start().catch((error) => {
        console.error('[openvibe-realtime] failed to start event bridge:', error && error.stack || error);
    });
    httpServer.listen(config.port, config.host, () => {
        console.log(`[openvibe-realtime] listening on http://${config.host}:${config.port}`);
    });
    const shutdown = () => {
        Promise.allSettled([eventBridge.stop(), socketRuntime.stop()])
            .finally(() => httpServer.close(() => process.exit(0)));
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    return { httpServer, socketRuntime, eventBridge };
}

if (require.main === module) start();

module.exports = { buildApp, start };