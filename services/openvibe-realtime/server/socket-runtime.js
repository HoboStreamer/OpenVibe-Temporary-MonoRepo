'use strict';

const { createServer } = require('http');

const { createAdapter } = require('@socket.io/redis-streams-adapter');
const { Server } = require('socket.io');
const { countSocketEvent, setSocketConnections } = require('@openvibe/observability');
const { createRedisClient } = require('@openvibe/redis');
const {
    authenticateSocket,
    canJoinRoom,
    createPresenceBridge,
    normalizeRoomName,
} = require('@openvibe/realtime');

function createSocketRuntime(expressApp, options) {
    const opts = options || {};
    const httpServer = createServer(expressApp);
    const io = new Server(httpServer, {
        cors: { origin: true, credentials: true },
        transports: ['websocket', 'polling'],
        allowUpgrades: true,
    });
    const redisClient = opts.config && opts.config.redisUrl ? createRedisClient({
        url: opts.config.redisUrl,
        name: `${opts.config.serviceId}-adapter`,
        prefix: opts.config.queuePrefix,
    }) : null;
    const presence = createPresenceBridge({
        redisClient,
        redisUrl: opts.config && opts.config.redisUrl,
        ttlSeconds: opts.config && opts.config.presenceTtlSeconds,
        prefix: opts.config && opts.config.queuePrefix,
    });
    const namespaces = ['/chat', '/live', '/notifications', '/presence'];

    async function maybeAttachAdapter() {
        if (!redisClient) return false;
        if (!redisClient.isOpen) await redisClient.connect();
        io.adapter(createAdapter(redisClient));
        return true;
    }

    function updateConnectionGauge() {
        if (!opts.metrics) return;
        for (const namespace of namespaces) {
            setSocketConnections(opts.metrics, {
                namespace,
                count: io.of(namespace).sockets.size,
            });
        }
    }

    function actorKey(actor) {
        return actor && actor.id ? `${actor.type}:${actor.id}` : 'anonymous';
    }

    function wireNamespace(namespace) {
        const nsp = io.of(namespace);
        nsp.use((socket, next) => {
            try {
                socket.data.actor = authenticateSocket(socket.handshake, {
                    internalKey: opts.config && opts.config.internalKey,
                    allowAnonymous: opts.config && opts.config.allowAnonymous,
                });
                next();
            } catch (error) {
                next(error);
            }
        });

        nsp.on('connection', (socket) => {
            updateConnectionGauge();
            countSocketEvent(opts.metrics, { namespace, event: 'connect', direction: 'inbound' });
            socket.emit('system:welcome', {
                actor: socket.data.actor,
                namespace,
                connected_at: new Date().toISOString(),
            });

            socket.on('room:join', async (payload, callback) => {
                const room = normalizeRoomName(payload && payload.room);
                if (!canJoinRoom(socket.data.actor, room)) {
                    const result = { ok: false, error: 'room access denied', room };
                    if (typeof callback === 'function') callback(result);
                    return;
                }
                const rate = await presence.consumeRateLimit({
                    scope: `${namespace}:join`,
                    id: actorKey(socket.data.actor),
                    rules: opts.config && opts.config.rateLimits && opts.config.rateLimits.join,
                });
                if (rate.allowed === false) {
                    const result = { ok: false, error: 'rate limit exceeded', room };
                    if (typeof callback === 'function') callback(result);
                    return;
                }

                await socket.join(room);
                await presence.heartbeat({
                    namespace,
                    socketId: socket.id,
                    actor: socket.data.actor,
                    rooms: Array.from(socket.rooms.values()),
                    connectedAt: socket.handshake.issued ? new Date(socket.handshake.issued).toISOString() : new Date().toISOString(),
                });
                countSocketEvent(opts.metrics, { namespace, event: 'room:join', direction: 'inbound' });
                const result = { ok: true, room, rooms: Array.from(socket.rooms.values()) };
                socket.emit('room:joined', result);
                if (typeof callback === 'function') callback(result);
            });

            socket.on('room:leave', async (payload, callback) => {
                const room = normalizeRoomName(payload && payload.room);
                await socket.leave(room);
                await presence.heartbeat({
                    namespace,
                    socketId: socket.id,
                    actor: socket.data.actor,
                    rooms: Array.from(socket.rooms.values()),
                });
                const result = { ok: true, room };
                socket.emit('room:left', result);
                if (typeof callback === 'function') callback(result);
            });

            socket.on('message:send', async (payload, callback) => {
                const room = normalizeRoomName(payload && payload.room);
                const eventName = normalizeRoomName(payload && payload.event || 'message').replace(/:/g, '.');
                if (!canJoinRoom(socket.data.actor, room)) {
                    const result = { ok: false, error: 'room access denied', room };
                    if (typeof callback === 'function') callback(result);
                    return;
                }
                const rate = await presence.consumeRateLimit({
                    scope: `${namespace}:message`,
                    id: actorKey(socket.data.actor),
                    rules: opts.config && opts.config.rateLimits && opts.config.rateLimits.message,
                });
                if (rate.allowed === false) {
                    const result = { ok: false, error: 'rate limit exceeded', room };
                    if (typeof callback === 'function') callback(result);
                    return;
                }
                const message = {
                    room,
                    actor: socket.data.actor,
                    payload: payload && payload.payload || {},
                    sent_at: new Date().toISOString(),
                };
                nsp.to(room).emit(eventName || 'message', message);
                countSocketEvent(opts.metrics, { namespace, event: eventName || 'message', direction: 'outbound' });
                if (typeof callback === 'function') callback({ ok: true, room });
            });

            socket.on('presence:heartbeat', async () => {
                await presence.heartbeat({
                    namespace,
                    socketId: socket.id,
                    actor: socket.data.actor,
                    rooms: Array.from(socket.rooms.values()),
                });
            });

            socket.on('disconnect', async () => {
                countSocketEvent(opts.metrics, { namespace, event: 'disconnect', direction: 'inbound' });
                await presence.clear({ namespace, socketId: socket.id });
                updateConnectionGauge();
            });
        });
    }

    namespaces.forEach(wireNamespace);

    return {
        httpServer,
        io,
        async start() {
            await maybeAttachAdapter();
            updateConnectionGauge();
            return this.summary();
        },
        async stop() {
            await io.close();
            if (redisClient && redisClient.isOpen) await redisClient.quit();
        },
        summary() {
            return {
                namespaces: namespaces.map((namespace) => ({
                    namespace,
                    connections: io.of(namespace).sockets.size,
                })),
                redis_adapter_configured: !!redisClient,
                redis_adapter_connected: !!(redisClient && redisClient.isOpen),
            };
        },
    };
}

module.exports = {
    createSocketRuntime,
};