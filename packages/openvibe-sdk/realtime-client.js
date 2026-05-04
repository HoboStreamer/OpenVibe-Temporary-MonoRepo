'use strict';

// OpenVibe — RealtimeClient. Provides:
//   - Socket.IO connection (preferred) via socket.io-client when available
//   - SSE fallback (Server-Sent Events from /events on openvibe-realtime)
//   - Exponential backoff reconnect
//   - subscribe(topic, handler) / unsubscribe(topic, handler) API using topic:subscribe protocol
//   - on(eventName, handler) for dot-notation event names (stream.started, vod.created, etc.)
//
// Topic names: 'global:live', 'channel:<slug>', 'stream:<id>', 'chat:global',
//   'chat:stream:<id>', 'community:pulse', 'community:space:<id>', 'user:<id>',
//   'media:<id>', 'clip:<id>', 'game:<id>'
//
// Event names (dot notation): stream.started, stream.ended, stream.created,
//   stream.ingest.connected, stream.ingest.disconnected, stream.mirrored_to_live,
//   stream.vod_attached, chat.message.created, chat.message.edited,
//   community.thread.created, community.post.created, community.paste.created,
//   media.upload.completed, vod.created, vod.finalized, clip.created,
//   user.updated, auth.login, and any other dot-notation event_type from the event bus.

const { jsonRequest } = require('./http');

const DEFAULT_RECONNECT_BASE_MS = 1000;
const DEFAULT_RECONNECT_MAX_MS  = 30000;
const DEFAULT_RECONNECT_JITTER  = 0.2;

// Canonical event name aliases — sourced from @openvibe/contracts (single source of truth).
// Build a reverse alias map so legacy handlers still fire when canonical name arrives.
const { EVENT_ALIASES } = require('@openvibe/contracts/events');
const EVENT_ALIASES_REVERSE = {};
for (const [legacy, canonical] of Object.entries(EVENT_ALIASES)) {
    if (!EVENT_ALIASES_REVERSE[canonical]) EVENT_ALIASES_REVERSE[canonical] = [];
    EVENT_ALIASES_REVERSE[canonical].push(legacy);
}

function normalizeEventName(eventType) {
    if (!eventType) return 'unknown';
    const lower = String(eventType).toLowerCase().trim();
    // Apply alias if present
    if (EVENT_ALIASES[lower]) return EVENT_ALIASES[lower];
    // Clean colons and underscores to dots
    return lower.replace(/:/g, '.').replace(/([a-z0-9])_([a-z0-9])/g, '$1.$2');
}

function exponentialBackoff(attempt, baseMs, maxMs, jitter) {
    const base = baseMs || DEFAULT_RECONNECT_BASE_MS;
    const max  = maxMs  || DEFAULT_RECONNECT_MAX_MS;
    const raw  = Math.min(base * Math.pow(2, attempt), max);
    const variance = raw * (jitter || DEFAULT_RECONNECT_JITTER);
    return raw + (Math.random() * variance * 2 - variance);
}

// Try to load socket.io-client. Optional — falls back to SSE if unavailable.
let SocketIO = null;
try { SocketIO = require('socket.io-client'); } catch { /* not available */ }

class RealtimeClient {
    /**
     * @param {object} opts
     * @param {string} opts.realtimeUrl — base URL of openvibe-realtime service
     * @param {string} [opts.internalKey] — X-Internal-Key for internal publish
     * @param {string[]} [opts.topics] — initial topic names to subscribe to
     * @param {boolean} [opts.autoConnect=false] — connect immediately on construction
     * @param {boolean} [opts.preferSSE=false] — force SSE even when Socket.IO is available
     * @param {string} [opts.transport='auto'] — 'socketio', 'sse', or 'auto'
     * @param {number}  [opts.reconnectBaseMs=1000]
     * @param {number}  [opts.reconnectMaxMs=30000]
     */
    constructor(opts) {
        if (!opts || !opts.realtimeUrl) throw new Error('RealtimeClient: realtimeUrl required');
        this.realtimeUrl    = String(opts.realtimeUrl).replace(/\/$/, '');
        this.internalKey    = opts.internalKey || null;
        this.topics         = Array.isArray(opts.topics) ? opts.topics.slice() : [];
        this._reconnectBase = opts.reconnectBaseMs || DEFAULT_RECONNECT_BASE_MS;
        this._reconnectMax  = opts.reconnectMaxMs  || DEFAULT_RECONNECT_MAX_MS;
        this._transport     = opts.transport || (opts.preferSSE ? 'sse' : 'auto');
        this._handlers      = new Map(); // topic → Set<fn>
        this._eventHandlers = new Map(); // eventName → Set<fn>
        this._socket        = null; // socket.io-client socket
        this._sseSource     = null; // EventSource
        this._pollingTimer  = null;
        this._reconnecting  = false;
        this._reconnectAttempt = 0;
        this._stopped       = false;
        this._lastEventId   = null;
        this._connected     = false;
        this._mode          = 'disconnected'; // 'socketio', 'sse', 'polling', 'disconnected'

        if (opts.autoConnect) this.connect();
    }

    get mode() { return this._mode; }
    get connected() { return this._connected; }

    _u(path) { return `${this.realtimeUrl}${path}`; }

    // ── subscription management ────────────────────────────────
    /**
     * Register a handler for a topic. Returns an unsubscribe function.
     * Sends topic:subscribe to the server if already connected.
     */
    subscribe(topic, handler) {
        if (typeof topic !== 'string' || !topic) throw new Error('subscribe: topic required');
        if (typeof handler !== 'function') throw new Error('subscribe: handler must be a function');
        if (!this._handlers.has(topic)) this._handlers.set(topic, new Set());
        this._handlers.get(topic).add(handler);
        if (!this.topics.includes(topic)) {
            this.topics.push(topic);
            if (this._connected) this._sendTopicSubscribe(topic);
            else if (this._sseSource) this._reconnectSSE();
        }
        return () => this.unsubscribe(topic, handler);
    }

    unsubscribe(topic, handler) {
        const handlers = this._handlers.get(topic);
        if (!handlers) return;
        handlers.delete(handler);
        if (!handlers.size) {
            this._handlers.delete(topic);
            const idx = this.topics.indexOf(topic);
            if (idx !== -1) this.topics.splice(idx, 1);
            if (this._socket) this._socket.emit('topic:unsubscribe', { topic });
        }
    }

    /**
     * Register a handler for a dot-notation event name (e.g. 'stream.started').
     * Use '*' to receive all events.
     */
    on(eventName, handler) {
        if (!this._eventHandlers.has(eventName)) this._eventHandlers.set(eventName, new Set());
        this._eventHandlers.get(eventName).add(handler);
        return () => this.off(eventName, handler);
    }

    off(eventName, handler) {
        const handlers = this._eventHandlers.get(eventName);
        if (!handlers) return;
        handlers.delete(handler);
    }

    // ── connection ─────────────────────────────────────────────
    connect() {
        this._stopped = false;
        const useSocketIO = this._transport === 'socketio' || (this._transport === 'auto' && !!SocketIO);
        if (useSocketIO && SocketIO) {
            this._connectSocketIO();
        } else {
            this._connectSSE();
        }
        return this;
    }

    disconnect() {
        this._stopped = true;
        this._connected = false;
        this._mode = 'disconnected';
        this._closeSocket();
        this._closeSSE();
    }

    // ── Socket.IO transport ───────────────────────────────────
    _connectSocketIO() {
        if (this._socket) this._closeSocket();
        const socket = SocketIO(this._u('/realtime'), {
            transports: ['websocket'],
            reconnection: false, // we handle reconnect ourselves
            auth: this.internalKey ? { key: this.internalKey } : undefined,
        });
        this._socket = socket;
        this._mode = 'socketio';

        socket.on('connect', () => {
            this._reconnectAttempt = 0;
            this._connected = true;
            this._emit('connected', { transport: 'socketio', socket_id: socket.id });
            // Subscribe to all requested topics
            for (const topic of this.topics) {
                this._sendTopicSubscribe(topic);
            }
        });

        socket.on('disconnect', (reason) => {
            this._connected = false;
            this._emit('disconnected', { reason });
            if (!this._stopped) this._scheduleReconnect(() => this._connectSocketIO());
        });

        socket.on('connect_error', (err) => {
            this._emit('error', { message: err && err.message });
            if (!this._stopped) this._scheduleReconnect(() => this._connectSocketIO());
        });

        // Receive events from Socket.IO namespaces.
        // The server emits events with the dot-notation event_type as the event name.
        socket.onAny((eventName, data) => {
            if (!eventName || eventName.startsWith('system:') || eventName.startsWith('topic:') || eventName.startsWith('room:')) return;
            const normalized = normalizeEventName(eventName);
            this._dispatchMessage(normalized, data || {});
        });
    }

    _sendTopicSubscribe(topic) {
        if (!this._socket || !this._socket.connected) return;
        this._socket.emit('topic:subscribe', { topic });
    }

    _closeSocket() {
        if (this._socket) {
            this._socket.disconnect();
            this._socket = null;
        }
    }

    // ── SSE transport ─────────────────────────────────────────
    _sseUrl() {
        const topicsParam = this.topics.length ? encodeURIComponent(this.topics.join(',')) : '';
        const lastId = this._lastEventId ? `&last_event_id=${encodeURIComponent(this._lastEventId)}` : '';
        return this._u(`/events${topicsParam ? '?topics=' + topicsParam : ''}${lastId}`);
    }

    _connectSSE() {
        if (this._sseSource) this._closeSSE();
        this._mode = 'sse';

        let EventSourceImpl = null;
        if (typeof EventSource !== 'undefined') {
            // eslint-disable-next-line no-undef
            EventSourceImpl = EventSource;
        } else {
            try { EventSourceImpl = require('eventsource'); } catch { /* no polyfill */ }
        }

        if (!EventSourceImpl) {
            this._startPollingFallback();
            return;
        }

        const source = new EventSourceImpl(this._sseUrl(), { withCredentials: false });
        this._sseSource = source;

        source.addEventListener('connected', (e) => {
            this._reconnectAttempt = 0;
            this._connected = true;
            this._emit('connected', Object.assign({ transport: 'sse' }, this._parseData(e.data)));
        });

        source.addEventListener('error', () => {
            this._connected = false;
            if (!this._stopped) this._scheduleSSEReconnect();
        });

        // Default message handler for any event not otherwise handled
        source.onmessage = (e) => {
            if (e.lastEventId) this._lastEventId = e.lastEventId;
            this._dispatchMessage(normalizeEventName(e.type || 'message'), this._parseData(e.data));
        };

        // Attach handlers for all dot-notation event names via a proxy that
        // intercepts every named SSE event. EventSource does not support wildcard
        // listeners natively, so we attach a generic handler via the readyState
        // change path and rely on the onmessage + named event listener strategy.
        // We handle named events by redefining addEventListener to track all listeners:
        const origAdd = source.addEventListener.bind(source);
        const trackedEvents = new Set(['connected', 'error', 'open', 'message']);
        const proxyAdd = (type, fn, opts) => {
            trackedEvents.add(type);
            origAdd(type, fn, opts);
        };
        source.addEventListener = proxyAdd;

        // The bridge fans out with event_type as the SSE event name.
        // We intercept everything by also listening on 'message' (catches unnamed events)
        // plus attaching a listener for every event name in our _eventHandlers map.
        const attachKnownHandlers = () => {
            for (const [evtName] of this._eventHandlers) {
                if (!trackedEvents.has(evtName)) {
                    source.addEventListener(evtName, (e) => {
                        if (e.lastEventId) this._lastEventId = e.lastEventId;
                        this._dispatchMessage(normalizeEventName(evtName), this._parseData(e.data));
                    });
                }
            }
        };
        attachKnownHandlers();

        // Wrap on() to also add the SSE event listener on-the-fly
        const origOn = this.on.bind(this);
        this.on = (eventName, handler) => {
            const unsub = origOn(eventName, handler);
            if (this._sseSource && !trackedEvents.has(eventName) && eventName !== '*') {
                this._sseSource.addEventListener(eventName, (e) => {
                    if (e.lastEventId) this._lastEventId = e.lastEventId;
                    this._dispatchMessage(normalizeEventName(eventName), this._parseData(e.data));
                });
                trackedEvents.add(eventName);
            }
            return unsub;
        };

        // Also listen on common stream/community/chat events for convenience.
        // Use canonical names (post-normalization) so both old and new server versions work.
        const AUTO_EVENTS = [
            // canonical stream events
            'stream.started', 'stream.ended', 'stream.created',
            'stream.vod.attached', 'stream.ingest.connected', 'stream.ingest.disconnected',
            'stream.mirrored.to.live',
            // legacy stream aliases (handled server-side now, keep for old servers)
            'stream.vod_attached', 'stream.mirrored_to_live',
            'stream.ingest_connected', 'stream.ingest_disconnected',
            // canonical chat
            'chat.message.sent', 'chat.message.edited', 'chat.message.deleted',
            // legacy chat aliases
            'chat.message.created',
            // canonical community
            'thread.created', 'comment.created', 'paste.created', 'paste.updated',
            // legacy community aliases
            'community.thread.created', 'community.post.created', 'community.paste.created',
            // media / vod / clip
            'media.upload.completed', 'media.lifecycle.promoted', 'media.lifecycle.demoted',
            'vod.created', 'vod.finalized', 'clip.created', 'clip.materialized',
            // discord
            'discord.message.received',
            // user / auth / billing
            'user.updated', 'auth.login',
            'billing.tip.sent', 'billing.sub.created',
        ];
        for (const evtName of AUTO_EVENTS) {
            if (!trackedEvents.has(evtName)) {
                source.addEventListener(evtName, (e) => {
                    if (e.lastEventId) this._lastEventId = e.lastEventId;
                    this._dispatchMessage(normalizeEventName(evtName), this._parseData(e.data));
                });
                trackedEvents.add(evtName);
            }
        }
    }

    _parseData(raw) {
        if (typeof raw !== 'string') return raw || {};
        try { return JSON.parse(raw); } catch { return { raw }; }
    }

    _dispatchMessage(rawEventName, data) {
        const eventName = normalizeEventName(rawEventName);
        const envelope = Object.assign({ _event: eventName }, data || {});

        // Dispatch to exact named event handlers (canonical name)
        const namedHandlers = this._eventHandlers.get(eventName);
        if (namedHandlers) namedHandlers.forEach((h) => { try { h(data); } catch { /* ignore */ } });

        // Also fire legacy alias names so old-style handlers still work
        const legacyNames = EVENT_ALIASES_REVERSE[eventName];
        if (legacyNames) {
            for (const legacyName of legacyNames) {
                const legacyHandlers = this._eventHandlers.get(legacyName);
                if (legacyHandlers) legacyHandlers.forEach((h) => { try { h(data); } catch { /* ignore */ } });
            }
        }

        // Dispatch to topic handlers using data.topic
        const topic = data && data.topic;
        if (topic) {
            const topicHandlers = this._handlers.get(topic);
            if (topicHandlers) topicHandlers.forEach((h) => { try { h(data); } catch { /* ignore */ } });
        }

        // Wildcard handlers receive all events
        const wildcardHandlers = this._handlers.get('*');
        if (wildcardHandlers) wildcardHandlers.forEach((h) => { try { h(envelope); } catch { /* ignore */ } });
        const wildcardEventHandlers = this._eventHandlers.get('*');
        if (wildcardEventHandlers) wildcardEventHandlers.forEach((h) => { try { h(envelope); } catch { /* ignore */ } });
    }

    _emit(eventName, data) {
        const handlers = this._eventHandlers.get(eventName);
        if (handlers) handlers.forEach((h) => { try { h(data); } catch { /* ignore */ } });
    }

    _closeSSE() {
        if (this._sseSource) {
            this._sseSource.close();
            this._sseSource = null;
        }
        if (this._pollingTimer) {
            clearTimeout(this._pollingTimer);
            this._pollingTimer = null;
        }
        this._connected = false;
    }

    _reconnectSSE() {
        this._closeSSE();
        if (!this._stopped) this._connectSSE();
    }

    _scheduleSSEReconnect() {
        this._scheduleReconnect(() => this._connectSSE());
    }

    _scheduleReconnect(connectFn) {
        if (this._reconnecting || this._stopped) return;
        this._reconnecting = true;
        const delay = exponentialBackoff(this._reconnectAttempt, this._reconnectBase, this._reconnectMax);
        this._reconnectAttempt += 1;
        setTimeout(() => {
            this._reconnecting = false;
            if (!this._stopped) connectFn();
        }, delay);
    }

    _startPollingFallback() {
        this._mode = 'polling';
        const poll = async () => {
            if (this._stopped) return;
            try {
                const qs = this.topics.length ? `?topics=${encodeURIComponent(this.topics.join(','))}` : '';
                const result = await jsonRequest(this._u(`/api/v1/realtime/stats${qs}`));
                this._emit('stats', result);
            } catch { /* network error during poll */ }
            if (!this._stopped) this._pollingTimer = setTimeout(poll, 5000);
        };
        this._pollingTimer = setTimeout(poll, 1000);
    }

    // ── internal publish (server-side use) ────────────────────
    async publish({ namespace, room, event: eventName, payload, topics }) {
        if (!this.internalKey) throw new Error('RealtimeClient.publish: internalKey required');
        return jsonRequest(this._u('/internal/publish'), {
            method: 'POST',
            internalKey: this.internalKey,
            body: { namespace, room, event: eventName, payload, topics },
        });
    }

    // ── query API ─────────────────────────────────────────────
    getStats() {
        return jsonRequest(this._u('/api/v1/realtime/stats'));
    }

    getNamespaces() {
        return jsonRequest(this._u('/api/v1/realtime/namespaces'));
    }

    getBridgeStatus() {
        return jsonRequest(this._u('/api/v1/realtime/bridge'));
    }
}

module.exports = { RealtimeClient };
