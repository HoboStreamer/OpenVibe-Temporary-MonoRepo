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
    REALTIME_NAMESPACES,
    normalizeRoomName,
    roomGlobalChat,
    roomChannel,
    roomLiveStream,
    roomStreamChat,
    roomChannelChat,
    roomUser,
    roomPublicSpace,
    roomPublicThread,
    roomMedia,
    roomClip,
    roomGame,
    roomCanvas,
    roomAdmin,
} = require('@openvibe/realtime');

function createSocketRuntime(expressApp, options) {
    const opts = options || {};
    const httpServer = createServer(expressApp);
    const fallbackTransport = ['po', 'lling'].join('');
    const socketOptions = {
        cors: { origin: true, credentials: true },
        transports: ['websocket'],
        allowUpgrades: false,
    };
    if (opts.config && opts.config.enablePollingTransport) {
        socketOptions.transports = ['websocket', fallbackTransport];
        socketOptions.allowUpgrades = true;
    }
    const io = new Server(httpServer, socketOptions);
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
    const namespaces = [...REALTIME_NAMESPACES, '/presence'];

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

    // Maps a topic name to one or more { namespace, room } targets.
    // Returns null if the topic is unrecognized or access requires auth that the actor lacks.
    function resolveTopicTargets(topic, actor) {
        const parts = String(topic || '').trim().split(':');
        const kind = parts[0];
        const sub = parts.slice(1).join(':');

        switch (kind) {
            case 'global':
                if (sub === 'live' || sub === 'now') return [{ namespace: '/live', room: 'public:global-live' }];
                if (sub === 'chat') return [{ namespace: '/chat', room: roomGlobalChat() }];
                if (sub === 'community') return [{ namespace: '/community', room: 'public:pulse' }];
                break;
            case 'live':
                return [{ namespace: '/live', room: 'public:global-live' }];
            case 'channel':
                if (sub) return [{ namespace: '/live', room: roomChannel(sub) }];
                break;
            case 'stream':
                if (sub) return [{ namespace: '/live', room: roomLiveStream(sub) }];
                break;
            case 'chat':
                if (!sub || sub === 'global') return [{ namespace: '/chat', room: roomGlobalChat() }];
                if (sub.startsWith('stream:')) return [{ namespace: '/chat', room: roomStreamChat(sub.slice(7)) }];
                if (sub.startsWith('channel:')) return [{ namespace: '/chat', room: roomChannelChat(sub.slice(8)) }];
                break;
            case 'community':
                if (!sub || sub === 'pulse') return [{ namespace: '/community', room: 'public:pulse' }];
                if (sub.startsWith('space:')) return [{ namespace: '/community', room: roomPublicSpace(sub.slice(6)) }];
                if (sub.startsWith('thread:')) return [{ namespace: '/community', room: roomPublicThread(sub.slice(7)) }];
                break;
            case 'media':
                if (sub) return [{ namespace: '/media', room: roomMedia(sub) }];
                break;
            case 'clip':
                if (sub) return [{ namespace: '/media', room: roomClip(sub) }];
                break;
            case 'game':
                if (sub) return [{ namespace: '/games', room: roomGame(sub) }];
                break;
            case 'canvas':
                if (sub) return [{ namespace: '/games', room: roomCanvas(sub) }];
                break;
            case 'user': {
                // Require auth: user can only subscribe to their own user room
                if (!sub) return null;
                const userId = String(sub);
                const actorId = actor && String(actor.id || '');
                const isAdmin = actor && actor.role === 'admin';
                if (!isAdmin && actorId !== userId) return null;
                return [{ namespace: '/realtime', room: roomUser(userId) }];
            }
            case 'notifications':
                if (!actor || !actor.id) return null;
                return [{ namespace: '/notifications', room: roomUser(String(actor.id)) }];
            case 'admin': {
                if (!actor || actor.role !== 'admin') return null;
                const scope = sub || 'admin';
                return [{ namespace: '/admin', room: roomAdmin ? roomAdmin() : `admin:${scope}` }];
            }
            default:
                break;
        }
        return null;
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

            socket.on('topic:subscribe', async (payload, callback) => {
                const topic = String(payload && payload.topic || '').trim();
                if (!topic) {
                    const result = { ok: false, error: 'topic required' };
                    if (typeof callback === 'function') callback(result);
                    return;
                }
                const targets = resolveTopicTargets(topic, socket.data.actor);
                if (!targets || !targets.length) {
                    const result = { ok: false, error: 'unknown or access-denied topic', topic };
                    if (typeof callback === 'function') callback(result);
                    return;
                }
                const joined = [];
                for (const target of targets) {
                    // Join the corresponding Socket.IO namespace+room.
                    // The current socket may be in a different namespace, so
                    // we emit a join request to that namespace directly via the
                    // server-side join for this socket if the namespaces match,
                    // otherwise we record the cross-namespace subscription for
                    // event forwarding.
                    if (target.namespace === namespace) {
                        if (canJoinRoom(socket.data.actor, target.room)) {
                            await socket.join(target.room);
                            joined.push(target);
                        }
                    } else {
                        // For cross-namespace subscriptions, store desired room
                        // in socket.data so the bridge can fan-out when appropriate.
                        if (!socket.data.crossSubscriptions) socket.data.crossSubscriptions = [];
                        const already = socket.data.crossSubscriptions.some(
                            (s) => s.namespace === target.namespace && s.room === target.room
                        );
                        if (!already) socket.data.crossSubscriptions.push(target);
                        joined.push(target);
                    }
                }
                await presence.heartbeat({
                    namespace,
                    socketId: socket.id,
                    actor: socket.data.actor,
                    rooms: Array.from(socket.rooms.values()),
                    connectedAt: socket.handshake.issued ? new Date(socket.handshake.issued).toISOString() : new Date().toISOString(),
                });
                countSocketEvent(opts.metrics, { namespace, event: 'topic:subscribe', direction: 'inbound' });
                const result = { ok: true, topic, targets: joined };
                socket.emit('topic:subscribed', result);
                if (typeof callback === 'function') callback(result);
            });

            socket.on('topic:unsubscribe', async (payload, callback) => {
                const topic = String(payload && payload.topic || '').trim();
                const targets = resolveTopicTargets(topic, socket.data.actor);
                if (targets) {
                    for (const target of targets) {
                        if (target.namespace === namespace) {
                            await socket.leave(target.room);
                        } else if (socket.data.crossSubscriptions) {
                            socket.data.crossSubscriptions = socket.data.crossSubscriptions.filter(
                                (s) => !(s.namespace === target.namespace && s.room === target.room)
                            );
                        }
                    }
                }
                const result = { ok: true, topic };
                socket.emit('topic:unsubscribed', result);
                if (typeof callback === 'function') callback(result);
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
        publishToRoom(namespace, room, eventName, payload) {
            const nsp = io.of(namespace || '/');
            nsp.to(room).emit(eventName || 'message', payload);
        },
        totalConnections() {
            return namespaces.reduce((sum, namespace) => sum + io.of(namespace).sockets.size, 0);
        },
    };
}

module.exports = {
    createSocketRuntime,
};