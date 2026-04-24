'use strict';

// OpenVibe — events backbone client. Wraps the openvibe-events HTTP API so
// publishers and consumers don't talk to it directly. The transport can later
// be swapped for Redis/NATS/Kafka without touching publishers.

const { jsonRequest } = require('./http');
const { createEnvelope, validateEnvelope } = require('@openvibe/contracts/envelope');

class EventsClient {
    constructor(opts) {
        if (!opts || !opts.eventsUrl) throw new Error('EventsClient: eventsUrl required');
        this.eventsUrl = String(opts.eventsUrl).replace(/\/$/, '');
        this.internalKey = opts.internalKey || null;
        this.defaultSource = opts.source || null;
    }

    _u(p) { return `${this.eventsUrl}${p}`; }

    /**
     * Publish a single event. Caller may pass a partial envelope; missing
     * fields are filled by `createEnvelope`. Throws on transport failure or
     * 4xx/5xx — callers are expected to log/swallow as appropriate.
     */
    async publish(topic, partial) {
        if (!topic) throw new Error('publish: topic required');
        const env = createEnvelope({
            ...(partial || {}),
            source: (partial && partial.source) || this.defaultSource || 'unknown',
        });
        const errs = validateEnvelope(env);
        if (errs.length) throw new Error(`publish: invalid envelope: ${errs.join('; ')}`);
        try {
            return await jsonRequest(this._u('/api/v1/events'), {
                method: 'POST',
                internalKey: this.internalKey,
                body: { topic, envelope: env },
            });
        } catch (err) {
            console.error(`[EventsClient] publish failed for topic=${topic} type=${env.event_type}: ${err.message}`);
            throw err;
        }
    }

    listEvents(query) {
        const qs = new URLSearchParams(query || {}).toString();
        return jsonRequest(this._u(`/api/v1/events${qs ? '?' + qs : ''}`));
    }

    listSubscriptions() {
        return jsonRequest(this._u('/api/v1/subscriptions'));
    }

    createSubscription(record) {
        return jsonRequest(this._u('/api/v1/subscriptions'), {
            method: 'POST', internalKey: this.internalKey, body: record,
        });
    }

    listDeadLetters() {
        return jsonRequest(this._u('/api/v1/dlq'));
    }

    /**
     * Replay a previously persisted event back into the bus. Useful after a
     * consumer bug fix.
     */
    replay(eventId) {
        return jsonRequest(this._u(`/api/v1/events/${encodeURIComponent(eventId)}/replay`), {
            method: 'POST', internalKey: this.internalKey, body: {},
        });
    }
}

module.exports = { EventsClient };
