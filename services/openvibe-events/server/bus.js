'use strict';

// openvibe-events — bus core. Pure DB ops; HTTP wrapping lives in routes.js,
// background dispatch lives in worker.js.

const db = require('./db');
const { validateEnvelope } = require('@openvibe/contracts/envelope');
const { isKnownTopic } = require('@openvibe/contracts/topics');
const {
    buildStreamKey,
    createStreamClient,
    getLag,
    getPending,
    publish: publishToStream,
} = require('@openvibe/queue');

let fanout = {
    client: null,
    namespace: 'events',
};

function configureFanout(options) {
    const opts = options || {};
    fanout = {
        client: opts.redisUrl ? createStreamClient({
            url: opts.redisUrl,
            name: 'openvibe-events',
            prefix: opts.queuePrefix || 'openvibe',
        }) : null,
        namespace: opts.streamNamespace || 'events',
    };
    return fanout;
}

function fanoutStreamKey(topic) {
    return buildStreamKey(fanout.namespace || 'events', topic || 'events');
}

function fanoutEvent(topic, envelope) {
    if (!fanout.client) {
        return { configured: false, stream: fanoutStreamKey(topic) };
    }
    const stream = fanoutStreamKey(topic);
    void publishToStream(fanout.client, stream, {
        event_id: envelope.event_id,
        trace_id: envelope.trace_id,
        topic,
        event_type: envelope.event_type,
        envelope,
    }).catch((error) => {
        console.warn(`[Bus] redis stream fanout failed for ${topic}: ${error.message}`);
    });
    return { configured: true, stream };
}

async function getFanoutLag(topic, groupName) {
    if (!fanout.client) return { configured: false, lag: null, stream: fanoutStreamKey(topic) };
    return {
        configured: true,
        stream: fanoutStreamKey(topic),
        group_name: groupName,
        lag: await getLag(fanout.client, fanoutStreamKey(topic), groupName),
    };
}

async function getFanoutPending(topic, groupName) {
    if (!fanout.client) return { configured: false, pending: null, stream: fanoutStreamKey(topic) };
    return {
        configured: true,
        stream: fanoutStreamKey(topic),
        group_name: groupName,
        pending: await getPending(fanout.client, fanoutStreamKey(topic), groupName),
    };
}

function persistEvent(topic, envelope) {
    const errs = validateEnvelope(envelope);
    if (errs.length) {
        const err = new Error(`invalid envelope: ${errs.join('; ')}`);
        err.code = 'EBADENVELOPE';
        throw err;
    }
    if (!topic || typeof topic !== 'string') {
        const err = new Error('topic required');
        err.code = 'EBADTOPIC';
        throw err;
    }
    if (!isKnownTopic(topic)) {
        // We accept unknown topics but warn — this lets product services move
        // before we register every topic in @openvibe/contracts.
        console.warn(`[Bus] publishing to unknown topic "${topic}" (not in @openvibe/contracts/topics)`);
    }

    const sql = db.get();
    const insert = sql.prepare(`
        INSERT INTO events (event_id, trace_id, topic, event_type, version, source, actor_type, actor_id, timestamp, payload_json)
        VALUES (@event_id, @trace_id, @topic, @event_type, @version, @source, @actor_type, @actor_id, @timestamp, @payload_json)
    `);
    try {
        insert.run({
            event_id:   envelope.event_id,
            trace_id:   envelope.trace_id,
            topic,
            event_type: envelope.event_type,
            version:    envelope.version,
            source:     envelope.source,
            actor_type: envelope.actor_type || null,
            actor_id:   envelope.actor_id || null,
            timestamp:  envelope.timestamp,
            payload_json: JSON.stringify(envelope.payload || {}),
        });
    } catch (err) {
        if (String(err.message).includes('UNIQUE')) {
            // idempotent re-publish — return the existing row, do not enqueue twice
            console.log(`[Bus] dedup hit for event_id=${envelope.event_id}`);
            return { event: getEventById(envelope.event_id), enqueued: 0 };
        }
        throw err;
    }

    const enqueued = enqueueForTopic(topic, envelope.event_id, envelope.event_type);
    const fanoutResult = fanoutEvent(topic, envelope);
    console.log(`[Bus] published topic=${topic} type=${envelope.event_type} event_id=${envelope.event_id} subs=${enqueued}`);
    return { event: getEventById(envelope.event_id), enqueued, fanout: fanoutResult };
}

function enqueueForTopic(topic, eventId, eventType) {
    const sql = db.get();
    const subs = sql.prepare(
        `SELECT subscription_id, event_type FROM subscriptions WHERE topic = ? AND active = 1`
    ).all(topic);

    const ins = sql.prepare(`
        INSERT OR IGNORE INTO delivery_queue (event_id, subscription_id, state, attempts, next_attempt_at)
        VALUES (?, ?, 'pending', 0, CURRENT_TIMESTAMP)
    `);

    let count = 0;
    for (const s of subs) {
        if (s.event_type && s.event_type !== eventType) continue; // exact-match filter
        const r = ins.run(eventId, s.subscription_id);
        if (r.changes > 0) count += 1;
    }
    return count;
}

function getEventById(eventId) {
    const row = db.get().prepare(`SELECT * FROM events WHERE event_id = ?`).get(eventId);
    return row ? hydrateEventRow(row) : null;
}

function listEvents({ topic, eventType, limit = 50, sinceId = 0 } = {}) {
    const cap = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 500);
    const sql = db.get();
    const where = ['id > ?'];
    const args = [parseInt(sinceId, 10) || 0];
    if (topic)     { where.push('topic = ?');      args.push(String(topic)); }
    if (eventType) { where.push('event_type = ?'); args.push(String(eventType)); }
    const rows = sql.prepare(
        `SELECT * FROM events WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ?`
    ).all(...args, cap);
    return rows.map(hydrateEventRow);
}

function hydrateEventRow(row) {
    let payload = {};
    try { payload = JSON.parse(row.payload_json); } catch { payload = {}; }
    return {
        id: row.id,
        event_id: row.event_id,
        trace_id: row.trace_id,
        topic: row.topic,
        event_type: row.event_type,
        version: row.version,
        source: row.source,
        actor_type: row.actor_type,
        actor_id: row.actor_id,
        timestamp: row.timestamp,
        payload,
        created_at: row.created_at,
    };
}

// ── subscriptions ─────────────────────────────────────────────
function createSubscription(record) {
    const r = record || {};
    if (!r.subscription_id) throw new Error('subscription_id required');
    if (!r.consumer)        throw new Error('consumer required');
    if (!r.topic)           throw new Error('topic required');
    const delivery = r.delivery || 'log';
    if (delivery !== 'log' && delivery !== 'http') throw new Error("delivery must be 'log' or 'http'");
    if (delivery === 'http' && !r.target_url) throw new Error("target_url required when delivery='http'");

    db.get().prepare(`
        INSERT INTO subscriptions (subscription_id, consumer, topic, event_type, delivery, target_url, internal_key, active)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(subscription_id) DO UPDATE SET
            consumer = excluded.consumer,
            topic = excluded.topic,
            event_type = excluded.event_type,
            delivery = excluded.delivery,
            target_url = excluded.target_url,
            internal_key = excluded.internal_key,
            active = 1
    `).run(
        r.subscription_id, r.consumer, r.topic,
        r.event_type || null, delivery, r.target_url || null, r.internal_key || null
    );
    return getSubscription(r.subscription_id);
}

function listSubscriptions() {
    return db.get().prepare(
        `SELECT subscription_id, consumer, topic, event_type, delivery, target_url, active, created_at
         FROM subscriptions ORDER BY created_at DESC`
    ).all();
}

function getSubscription(id) {
    return db.get().prepare(
        `SELECT subscription_id, consumer, topic, event_type, delivery, target_url, active, created_at
         FROM subscriptions WHERE subscription_id = ?`
    ).get(id) || null;
}

function deactivateSubscription(id) {
    db.get().prepare(`UPDATE subscriptions SET active = 0 WHERE subscription_id = ?`).run(id);
}

// ── DLQ ───────────────────────────────────────────────────────
function listDeadLetters({ limit = 100 } = {}) {
    const cap = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);
    return db.get().prepare(
        `SELECT id, event_id, subscription_id, attempts, last_error, failed_at
         FROM dead_letters ORDER BY id DESC LIMIT ?`
    ).all(cap);
}

// ── replay ────────────────────────────────────────────────────
function replayEvent(eventId) {
    const evt = getEventById(eventId);
    if (!evt) {
        const err = new Error(`event not found: ${eventId}`);
        err.code = 'ENOTFOUND';
        throw err;
    }
    const enqueued = enqueueForTopic(evt.topic, evt.event_id, evt.event_type);
    const fanoutResult = fanoutEvent(evt.topic, evt);
    console.log(`[Bus] replay event_id=${eventId} subs=${enqueued}`);
    return { event: evt, enqueued, fanout: fanoutResult };
}

// ── topics registry ───────────────────────────────────────────
function listTopics() {
    const { TOPIC_LIST } = require('@openvibe/contracts/topics');
    const sql = db.get();
    // Canonical topics from contracts
    const canonical = TOPIC_LIST.map((topic) => ({ topic, canonical: true, event_count: 0 }));
    // Observed topics from the event log
    const observed = sql.prepare(
        `SELECT topic, COUNT(*) as event_count FROM events GROUP BY topic ORDER BY event_count DESC`
    ).all();
    const observedMap = Object.fromEntries(observed.map((row) => [row.topic, row.event_count]));
    // Merge counts into canonical list, then append any extra observed topics
    const result = canonical.map((entry) => ({
        ...entry,
        event_count: observedMap[entry.topic] || 0,
    }));
    for (const row of observed) {
        if (!TOPIC_LIST.includes(row.topic)) {
            result.push({ topic: row.topic, canonical: false, event_count: row.event_count });
        }
    }
    return result;
}

// ── delivery status for an event ─────────────────────────────
function getEventDeliveries(eventId) {
    const sql = db.get();
    return sql.prepare(
        `SELECT dq.event_id, dq.subscription_id, dq.state, dq.attempts,
                dq.next_attempt_at, dq.last_error, dq.created_at, dq.updated_at,
                s.consumer, s.topic, s.delivery
         FROM delivery_queue dq
         LEFT JOIN subscriptions s ON s.subscription_id = dq.subscription_id
         WHERE dq.event_id = ?
         ORDER BY dq.created_at ASC`
    ).all(eventId);
}

// ── bulk replay by query ──────────────────────────────────────
function replayByQuery({ topic, since, eventType, limit = 100 } = {}) {
    const cap = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);
    const sql = db.get();
    const where = [];
    const args = [];
    if (topic)     { where.push('topic = ?');      args.push(String(topic)); }
    if (eventType) { where.push('event_type = ?'); args.push(String(eventType)); }
    if (since)     { where.push('timestamp >= ?'); args.push(String(since)); }
    const rows = sql.prepare(
        `SELECT * FROM events ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id ASC LIMIT ?`
    ).all(...args, cap);
    const events = rows.map(hydrateEventRow);
    let totalEnqueued = 0;
    for (const evt of events) {
        const enqueued = enqueueForTopic(evt.topic, evt.event_id, evt.event_type);
        fanoutEvent(evt.topic, evt);
        totalEnqueued += enqueued;
    }
    console.log(`[Bus] bulk replay count=${events.length} total_enqueued=${totalEnqueued}`);
    return { replayed: events.length, enqueued: totalEnqueued };
}

module.exports = {
    configureFanout,
    getFanoutLag,
    getFanoutPending,
    persistEvent,
    getEventById,
    listEvents,
    listTopics,
    getEventDeliveries,
    replayByQuery,
    createSubscription,
    listSubscriptions,
    getSubscription,
    deactivateSubscription,
    listDeadLetters,
    replayEvent,
    enqueueForTopic, // exported for worker.js
};
