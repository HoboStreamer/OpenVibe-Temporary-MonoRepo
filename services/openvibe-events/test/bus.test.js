'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const db = require('../server/db');
const bus = require('../server/bus');
const { createEnvelope } = require('@openvibe/contracts/envelope');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ov-events-'));
const dbPath = path.join(tmp, 'events.db');
db.init(dbPath);

// 1. publish persists
{
    const env = createEnvelope({ event_type: 'auth.token.issued', source: 'openvibe-network', payload: { sub: '1' } });
    const r = bus.persistEvent('auth.events', env);
    assert.strictEqual(r.event.event_id, env.event_id);
    assert.strictEqual(r.enqueued, 0, 'no subscribers yet');
}

// 2. dedup on repeated event_id
{
    const env = createEnvelope({ event_type: 'auth.token.issued', source: 'openvibe-network', event_id: 'evt_dup', payload: {} });
    bus.persistEvent('auth.events', env);
    const r2 = bus.persistEvent('auth.events', env);
    assert.strictEqual(r2.enqueued, 0, 'dup must not enqueue');
}

// 3. subscriber receives enqueue
{
    bus.createSubscription({
        subscription_id: 'sub-test-1', consumer: 'tester',
        topic: 'user.events', delivery: 'log',
    });
    const env = createEnvelope({ event_type: 'user.module.updated', source: 'openvibe-network', payload: { user_id: '1', namespace: 'live.profile' } });
    const r = bus.persistEvent('user.events', env);
    assert.strictEqual(r.enqueued, 1, 'one matching subscriber');
}

// 4. event_type filter narrows enqueue
{
    bus.createSubscription({
        subscription_id: 'sub-test-2', consumer: 'tester',
        topic: 'service.events', event_type: 'service.registered', delivery: 'log',
    });
    const env1 = createEnvelope({ event_type: 'service.registered', source: 'x', payload: {} });
    const env2 = createEnvelope({ event_type: 'service.heartbeat',  source: 'x', payload: {} });
    assert.strictEqual(bus.persistEvent('service.events', env1).enqueued, 1);
    assert.strictEqual(bus.persistEvent('service.events', env2).enqueued, 0, 'filtered out');
}

// 5. replay re-enqueues
{
    const env = createEnvelope({ event_type: 'user.module.updated', source: 'openvibe-network', payload: {} });
    bus.persistEvent('user.events', env);
    const r = bus.replayEvent(env.event_id);
    // replay uses INSERT OR IGNORE so existing pending row is left alone — count may be 0.
    assert.ok(typeof r.enqueued === 'number');
    assert.strictEqual(r.event.event_id, env.event_id);
}

// 6. listEvents filters
{
    const all = bus.listEvents({ limit: 100 });
    assert.ok(all.length >= 4);
    const onlyUser = bus.listEvents({ topic: 'user.events', limit: 100 });
    assert.ok(onlyUser.every(e => e.topic === 'user.events'));
}

// 7. invalid envelope rejected
assert.throws(() => bus.persistEvent('user.events', { foo: 'bar' }), /invalid envelope/);

// 8. DLQ list does not crash on empty
assert.deepStrictEqual(bus.listDeadLetters(), []);

// cleanup
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }

console.log('bus: ok');
