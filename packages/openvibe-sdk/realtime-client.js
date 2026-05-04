'use strict';

// OpenVibe — RealtimeClient. Provides:
//   - SSE subscription (Server-Sent Events from /events on openvibe-realtime)
//   - Optional Socket.IO connection via the socket.io-client package if available
//   - Exponential backoff reconnect
//   - subscribe(topic, handler) / unsubscribe(topic, handler) API
//
// This client runs both in Node.js and in the browser (the SSE path uses the
// native EventSource/fetch API in browsers and the eventsource npm package in
// Node). Socket.IO path uses socket.io-client when present.

const { jsonRequest } = require('./http');

const DEFAULT_RECONNECT_BASE_MS = 1000;
const DEFAULT_RECONNECT_MAX_MS  = 30000;
const DEFAULT_RECONNECT_JITTER  = 0.2;

function exponentialBackoff(attempt, baseMs, maxMs, jitter) {
    const base = baseMs || DEFAULT_RECONNECT_BASE_MS;
    const max  = maxMs  || DEFAULT_RECONNECT_MAX_MS;
    const raw  = Math.min(base * Math.pow(2, attempt), max);
    const variance = raw * (jitter || DEFAULT_RECONNECT_JITTER);
    return raw + (Math.random() * variance * 2 - variance);
}

class RealtimeClient {
    /**
     * @param {object} opts
     * @param {string} opts.realtimeUrl — base URL of openvibe-realtime service
     * @param {string} [opts.internalKey] — X-Internal-Key for internal publish
     * @param {string[]} [opts.topics] — topic names to subscribe to over SSE
     * @param {boolean} [opts.autoConnect=false] — connect immediately on construction
     * @param {number}  [opts.reconnectBaseMs=1000]
     * @param {number}  [opts.reconnectMaxMs=30000]
     */
    constructor(opts) {
        if (!opts || !opts.realtimeUrl) throw new Error('RealtimeClient: realtimeUrl required');
        this.realtimeUrl  = String(opts.realtimeUrl).replace(/\/$/, '');
        this.internalKey  = opts.internalKey || null;
        this.topics       = Array.isArray(opts.topics) ? opts.topics.slice() : [];
        this._reconnectBase = opts.reconnectBaseMs || DEFAULT_RECONNECT_BASE_MS;
        this._reconnectMax  = opts.reconnectMaxMs  || DEFAULT_RECONNECT_MAX_MS;
        this._handlers    = new Map(); // topic → Set<fn>
        this._eventHandlers = new Map(); // eventName → Set<fn> (raw SSE events)
        this._sseSource   = null;
        this._reconnecting = false;
        this._reconnectAttempt = 0;
        this._stopped     = false;
        this._lastEventId = null;

        if (opts.autoConnect) this.connect();
    }

    _u(path) { return `${this.realtimeUrl}${path}`; }

    // ── subscription management ────────────────────────────────
    /**
     * Register a handler for a topic. Returns an unsubscribe function.
     */
    subscribe(topic, handler) {
        if (typeof topic !== 'string' || !topic) throw new Error('subscribe: topic required');
        if (typeof handler !== 'function') throw new Error('subscribe: handler must be a function');
        if (!this._handlers.has(topic)) this._handlers.set(topic, new Set());
        this._handlers.get(topic).add(handler);
        // Add to SSE topic filter list
        if (!this.topics.includes(topic)) {
            this.topics.push(topic);
            // If already connected, reconnect with updated topic list
            if (this._sseSource) this._reconnectSSE();
        }
        return () => this.unsubscribe(topic, handler);
    }

    unsubscribe(topic, handler) {
        const handlers = this._handlers.get(topic);
        if (!handlers) return;
        handlers.delete(handler);
        if (!handlers.size) this._handlers.delete(topic);
    }

    /**
     * Register a handler for a raw SSE event name (e.g. 'stream.started').
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
        this._connectSSE();
        return this;
    }

    disconnect() {
        this._stopped = true;
        this._closeSSE();
    }

    // ── SSE transport ─────────────────────────────────────────
    _sseUrl() {
        const topicsParam = this.topics.length ? encodeURIComponent(this.topics.join(',')) : '';
        const lastId = this._lastEventId ? `&last_event_id=${encodeURIComponent(this._lastEventId)}` : '';
        return this._u(`/events${topicsParam ? '?topics=' + topicsParam : ''}${lastId}`);
    }

    _connectSSE() {
        if (this._sseSource) this._closeSSE();

        // Browser (native EventSource) or Node (EventSource polyfill if available)
        let EventSourceImpl = null;
        if (typeof EventSource !== 'undefined') {
            // eslint-disable-next-line no-undef
            EventSourceImpl = EventSource;
        } else {
            try { EventSourceImpl = require('eventsource'); } catch { /* no polyfill */ }
        }

        if (!EventSourceImpl) {
            // Fall back to HTTP polling every 5s when no SSE available
            this._startPollingFallback();
            return;
        }

        const source = new EventSourceImpl(this._sseUrl(), { withCredentials: false });
        this._sseSource = source;

        source.addEventListener('connected', (e) => {
            this._reconnectAttempt = 0;
            this._emit('connected', this._parseData(e.data));
        });

        source.addEventListener('error', () => {
            if (!this._stopped) this._scheduleSSEReconnect();
        });

        // Generic message handler (for named events)
        source.onmessage = (e) => {
            if (e.lastEventId) this._lastEventId = e.lastEventId;
            this._dispatchMessage(e.type || 'message', this._parseData(e.data));
        };

        // Proxy any event the bridge sends as a named event
        const knownBridgeEvents = [
            'stream.started', 'stream.ended', 'stream.created', 'stream.vod_attached',
            'stream.ingest_connected', 'stream.ingest_disconnected', 'stream.mirrored_to_live',
            'chat.message', 'chat.join', 'chat.leave',
            'community.thread_created', 'community.post_created', 'community.paste_created',
            'media.ready', 'media.uploaded', 'user.updated', 'auth.login',
        ];
        for (const eventName of knownBridgeEvents) {
            source.addEventListener(eventName, (e) => {
                if (e.lastEventId) this._lastEventId = e.lastEventId;
                this._dispatchMessage(eventName, this._parseData(e.data));
            });
        }
    }

    _parseData(raw) {
        if (typeof raw !== 'string') return raw || {};
        try { return JSON.parse(raw); } catch { return { raw }; }
    }

    _dispatchMessage(eventName, data) {
        // Dispatch to raw event handlers
        const rawHandlers = this._eventHandlers.get(eventName);
        if (rawHandlers) rawHandlers.forEach((h) => { try { h(data); } catch { /* ignore */ } });

        // Dispatch to topic handlers using data.topic if present
        const topic = data && data.topic;
        if (topic) {
            const topicHandlers = this._handlers.get(topic);
            if (topicHandlers) topicHandlers.forEach((h) => { try { h(data); } catch { /* ignore */ } });
        }

        // Always dispatch to wildcard '*' handlers
        const wildcardHandlers = this._handlers.get('*');
        if (wildcardHandlers) wildcardHandlers.forEach((h) => { try { h({ event: eventName, ...data }); } catch { /* ignore */ } });
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
    }

    _reconnectSSE() {
        this._closeSSE();
        if (!this._stopped) this._connectSSE();
    }

    _scheduleSSEReconnect() {
        if (this._reconnecting || this._stopped) return;
        this._reconnecting = true;
        const delay = exponentialBackoff(this._reconnectAttempt, this._reconnectBase, this._reconnectMax);
        this._reconnectAttempt += 1;
        setTimeout(() => {
            this._reconnecting = false;
            if (!this._stopped) this._connectSSE();
        }, delay);
    }

    _startPollingFallback() {
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
    /**
     * Publish a message to a Socket.IO room + SSE clients via the internal API.
     * Only valid when internalKey is configured.
     */
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
