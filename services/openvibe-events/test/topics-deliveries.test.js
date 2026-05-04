'use strict';

// Tests for:
//   - GET  /api/v1/topics  (bus.listTopics)
//   - GET  /api/v1/events/:id/deliveries
//   - POST /api/v1/replay  (bulk replay by query)
//
// Uses the same approach as bus.test.js — temp SQLite, no HTTP server.

const assert = require('assert');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');

process.env.OPENVIBE_URL_MODE   = 'local';
process.env.OPENVIBE_LOCAL_HOST_SUFFIX = 'localhost';
process.env.OPENVIBE_LOCAL_PROTOCOL = 'http';
process.env.INTERNAL_API_KEY = 'test-internal-key';

const tmp    = fs.mkdtempSync(path.join(os.tmpdir(), 'ov-events-topics-'));
const dbPath = path.join(tmp, 'events.db');

const db  = require('../server/db');
const bus = require('../server/bus');
const { createEnvelope } = require('@openvibe/contracts/envelope');

db.init(dbPath);

// ── seed some events ─────────────────────────────────────────────────────────
const env1 = createEnvelope({ event_type: 'stream.started', source: 'openre-stream', payload: { stream_id: 's1' } });
const env2 = createEnvelope({ event_type: 'stream.ended',   source: 'openre-stream', payload: { stream_id: 's1' } });
const env3 = createEnvelope({ event_type: 'chat.message',   source: 'openvibe-chat', payload: { text: 'hi' } });
bus.persistEvent('stream.events', env1);
bus.persistEvent('stream.events', env2);
bus.persistEvent('chat.events',   env3);

// ── 1. listTopics returns canonical + observed topics ────────────────────────
{
    const topics = bus.listTopics();
    assert.ok(Array.isArray(topics), 'listTopics returns array');
    assert.ok(topics.length > 0, 'has at least one topic');

    // Canonical topics should be present (from contracts)
    const canonical = topics.filter((t) => t.canonical);
    assert.ok(canonical.length > 0, 'some canonical topics present');

    // Topics we published should appear
    const streamTopic = topics.find((t) => t.topic === 'stream.events');
    assert.ok(streamTopic, 'stream.events in topics');
    assert.ok(streamTopic.event_count >= 2, 'stream.events has at least 2 events');

    const chatTopic = topics.find((t) => t.topic === 'chat.events');
    assert.ok(chatTopic, 'chat.events in topics');
    assert.strictEqual(chatTopic.event_count, 1);

    console.log('  topics.listTopics: ok');
}

// ── 2. getEventDeliveries returns empty array for event with no subscribers ──
{
    const deliveries = bus.getEventDeliveries(env1.event_id);
    assert.ok(Array.isArray(deliveries), 'getEventDeliveries returns array');
    // No subscribers registered, so delivery list is empty
    assert.strictEqual(deliveries.length, 0);
    console.log('  topics.getEventDeliveries (no subs): ok');
}

// ── 3. getEventDeliveries returns deliveries when subscriber exists ───────────
{
    bus.createSubscription({
        subscription_id: 'sub-deliv-test',
        consumer: 'tester',
        topic: 'stream.events',
        delivery: 'log',
    });
    const env4 = createEnvelope({ event_type: 'stream.started', source: 'openre-stream', payload: { stream_id: 's2' } });
    bus.persistEvent('stream.events', env4);
    const deliveries = bus.getEventDeliveries(env4.event_id);
    assert.ok(Array.isArray(deliveries), 'getEventDeliveries returns array');
    assert.ok(deliveries.length >= 1, 'should have at least 1 delivery row');
    const d = deliveries[0];
    assert.ok(d.subscription_id, 'delivery has subscription_id');
    assert.ok(d.state, 'delivery has state');
    console.log('  topics.getEventDeliveries (with sub): ok');
}

// ── 4. replayByQuery replays by topic ────────────────────────────────────────
{
    const result = bus.replayByQuery({ topic: 'stream.events', limit: 10 });
    assert.ok(typeof result.replayed === 'number', 'replayed is a number');
    assert.ok(typeof result.enqueued === 'number', 'enqueued is a number');
    assert.ok(result.replayed >= 1, 'replayed at least one event');
    console.log('  topics.replayByQuery (by topic): ok');
}

// ── 5. replayByQuery with event_type filter ───────────────────────────────────
{
    const result = bus.replayByQuery({ topic: 'stream.events', eventType: 'stream.ended', limit: 10 });
    assert.ok(result.replayed >= 1, 'replayed stream.ended events');
    console.log('  topics.replayByQuery (by event_type): ok');
}

// ── 6. replayByQuery with unknown topic returns 0 ────────────────────────────
{
    const result = bus.replayByQuery({ topic: 'no.such.topic.xyz', limit: 10 });
    assert.strictEqual(result.replayed, 0, 'no events for unknown topic');
    console.log('  topics.replayByQuery (unknown topic): ok');
}

// cleanup
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }

console.log('topics-deliveries: ok');
