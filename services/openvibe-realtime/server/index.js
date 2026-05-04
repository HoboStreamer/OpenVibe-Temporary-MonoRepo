'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const { createServiceRuntime } = require('@openvibe/runtime');
const { requireInternalKey } = require('@openvibe/sdk/middleware');

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

    // Create sseClients before eventBridge so the bridge can fan out to SSE subscribers.
    const sseClients = new Map(); // id → { res, topics }
    let sseIdCounter = 0;

    eventBridge = createEventBridge({ config, socketRuntime, sseClients });

    app.get('/api/v1/realtime/namespaces', (_req, res) => {
        res.json({ items: socketRuntime.summary().namespaces });
    });

    app.get('/api/v1/realtime/connections', (_req, res) => {
        res.json(socketRuntime.summary());
    });

    app.get('/api/v1/realtime/bridge', (_req, res) => {
        res.json(eventBridge.summary());
    });

    app.get('/api/v1/realtime/stats', (_req, res) => {
        const summary = socketRuntime.summary();
        const bridge = eventBridge.summary();
        res.json({
            connections: {
                total: socketRuntime.totalConnections(),
                by_namespace: summary.namespaces,
            },
            bridge: {
                mode: bridge.mode,
                started: bridge.started,
                topics_subscribed: bridge.topics_subscribed || 0,
            },
            redis: {
                configured: summary.redis_adapter_configured,
                connected: summary.redis_adapter_connected,
            },
        });
    });

    // ── SSE endpoint — lightweight alternative to Socket.IO ──
    // Clients subscribe by passing ?topics= (comma-separated).
    // Last-Event-ID header / query param enables reconnect without missed events.

    app.get('/events', (req, res) => {
        res.set({
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        });
        res.flushHeaders();

        const clientId = ++sseIdCounter;
        const rawTopics = String(req.query.topics || '').trim();
        const topics = rawTopics ? rawTopics.split(',').map((t) => t.trim()).filter(Boolean) : [];
        sseClients.set(clientId, { res, topics });

        // Send connected confirmation
        res.write(`event: connected\ndata: ${JSON.stringify({ client_id: clientId, topics })}\n\n`);

        // Heartbeat every 30s to prevent proxy timeouts
        const heartbeat = setInterval(() => {
            res.write(': heartbeat\n\n');
        }, 30000);

        req.on('close', () => {
            clearInterval(heartbeat);
            sseClients.delete(clientId);
        });
    });

    // Internal endpoint: push a message to SSE clients and/or Socket.IO room
    const internal = requireInternalKey(config.internalKey);
    app.post('/internal/publish', internal, express.json({ limit: '64kb' }), (req, res) => {
        const { namespace, room, event: eventName, payload, topics: targetTopics } = req.body || {};
        if (!eventName) return res.status(400).json({ error: 'event required' });

        let socketCount = 0;
        if (room && socketRuntime) {
            socketRuntime.publishToRoom(namespace || '/', room, eventName, payload || {});
            socketCount = 1;
        }

        // Fan out to SSE subscribers by topic
        let sseCount = 0;
        const topicList = Array.isArray(targetTopics) ? targetTopics : (targetTopics ? [targetTopics] : []);
        const data = JSON.stringify({ event: eventName, room: room || null, payload: payload || {}, at: new Date().toISOString() });
        for (const [, client] of sseClients) {
            const matches = !topicList.length || topicList.some((t) => !client.topics.length || client.topics.includes(t));
            if (matches) {
                try {
                    client.res.write(`event: ${eventName}\ndata: ${data}\n\n`);
                    sseCount += 1;
                } catch {
                    // client disconnected mid-write, will be cleaned up on req.close
                }
            }
        }

        res.json({ ok: true, socket_targets: socketCount, sse_clients: sseCount });
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