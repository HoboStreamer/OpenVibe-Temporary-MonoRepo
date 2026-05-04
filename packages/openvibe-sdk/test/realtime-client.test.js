'use strict';

// Tests for the RealtimeClient class.
// No EventSource or HTTP calls — tests focus on subscribe/unsubscribe/emit logic.

const assert = require('assert');

process.env.OPENVIBE_URL_MODE = 'local';
process.env.OPENVIBE_LOCAL_HOST_SUFFIX = 'localhost';
process.env.OPENVIBE_LOCAL_PROTOCOL = 'http';

const { RealtimeClient } = require('../realtime-client');

// ── 1. constructor requires realtimeUrl ──────────────────────────────────────
{
    assert.throws(() => new RealtimeClient({}), /realtimeUrl required/);
    assert.throws(() => new RealtimeClient(), /realtimeUrl required/);
    console.log('  realtime-client: constructor validation: ok');
}

// ── 2. constructor stores topics ─────────────────────────────────────────────
{
    const c = new RealtimeClient({ realtimeUrl: 'http://localhost:5400', topics: ['stream.events', 'chat.events'] });
    assert.deepStrictEqual(c.topics, ['stream.events', 'chat.events']);
    console.log('  realtime-client: topics stored: ok');
}

// ── 3. subscribe registers handler and adds topic ────────────────────────────
{
    const c = new RealtimeClient({ realtimeUrl: 'http://localhost:5400' });
    const received = [];
    const unsub = c.subscribe('stream.events', (d) => received.push(d));
    assert.strictEqual(typeof unsub, 'function', 'subscribe returns unsubscribe fn');
    assert.ok(c.topics.includes('stream.events'), 'topic added to client list');
    console.log('  realtime-client: subscribe adds topic: ok');
}

// ── 4. subscribe does not duplicate topic ────────────────────────────────────
{
    const c = new RealtimeClient({ realtimeUrl: 'http://localhost:5400', topics: ['stream.events'] });
    const topicsBefore = c.topics.length;
    c.subscribe('stream.events', () => {});
    assert.strictEqual(c.topics.length, topicsBefore, 'no duplicate topic added');
    console.log('  realtime-client: no duplicate topic: ok');
}

// ── 5. subscribe validates arguments ─────────────────────────────────────────
{
    const c = new RealtimeClient({ realtimeUrl: 'http://localhost:5400' });
    assert.throws(() => c.subscribe('', () => {}), /topic required/);
    assert.throws(() => c.subscribe('stream.events', null), /handler must be a function/);
    console.log('  realtime-client: subscribe validation: ok');
}

// ── 6. unsubscribe removes handler ───────────────────────────────────────────
{
    const c = new RealtimeClient({ realtimeUrl: 'http://localhost:5400' });
    const fn = () => {};
    c.subscribe('stream.events', fn);
    assert.ok(c._handlers.has('stream.events'), 'handler registered');
    c.unsubscribe('stream.events', fn);
    assert.ok(!c._handlers.has('stream.events'), 'handler removed');
    console.log('  realtime-client: unsubscribe removes handler: ok');
}

// ── 7. unsubscribe via returned function ─────────────────────────────────────
{
    const c = new RealtimeClient({ realtimeUrl: 'http://localhost:5400' });
    const received = [];
    const unsub = c.subscribe('chat.events', (d) => received.push(d));
    unsub();
    assert.ok(!c._handlers.has('chat.events'), 'handler removed via unsub fn');
    console.log('  realtime-client: unsubscribe fn works: ok');
}

// ── 8. _dispatchMessage routes by topic ──────────────────────────────────────
{
    const c = new RealtimeClient({ realtimeUrl: 'http://localhost:5400' });
    const received = [];
    c.subscribe('stream.events', (d) => received.push(d));

    c._dispatchMessage('stream.started', { topic: 'stream.events', stream_id: 'abc' });
    assert.strictEqual(received.length, 1);
    assert.strictEqual(received[0].stream_id, 'abc');
    console.log('  realtime-client: _dispatchMessage by topic: ok');
}

// ── 9. wildcard '*' handler receives all messages ────────────────────────────
{
    const c = new RealtimeClient({ realtimeUrl: 'http://localhost:5400' });
    const received = [];
    c.subscribe('*', (d) => received.push(d));

    c._dispatchMessage('stream.started', { topic: 'stream.events', stream_id: 'x' });
    c._dispatchMessage('chat.message',   { topic: 'chat.events',   text: 'hi' });
    assert.strictEqual(received.length, 2, 'wildcard receives both messages');
    console.log('  realtime-client: wildcard handler: ok');
}

// ── 10. on() / off() raw event handlers ─────────────────────────────────────
{
    const c = new RealtimeClient({ realtimeUrl: 'http://localhost:5400' });
    const received = [];
    const fn = (d) => received.push(d);
    c.on('stream.started', fn);
    c._dispatchMessage('stream.started', { topic: 'stream.events', stream_id: 'y' });
    assert.strictEqual(received.length, 1);
    c.off('stream.started', fn);
    c._dispatchMessage('stream.started', { topic: 'stream.events', stream_id: 'z' });
    assert.strictEqual(received.length, 1, 'handler removed via off()');
    console.log('  realtime-client: on/off raw handlers: ok');
}

// ── 11. disconnect sets _stopped flag ────────────────────────────────────────
{
    const c = new RealtimeClient({ realtimeUrl: 'http://localhost:5400' });
    assert.strictEqual(c._stopped, false);
    c.disconnect();
    assert.strictEqual(c._stopped, true);
    console.log('  realtime-client: disconnect sets _stopped: ok');
}

// ── 12. publish throws without internalKey ───────────────────────────────────
{
    const c = new RealtimeClient({ realtimeUrl: 'http://localhost:5400' });
    c.publish({ namespace: '/', room: 'test', event: 'test', payload: {} })
        .then(() => { throw new Error('should have rejected'); })
        .catch((err) => {
            assert.ok(err.message.includes('internalKey required'), `expected internalKey error, got: ${err.message}`);
        });
    console.log('  realtime-client: publish requires internalKey: ok');
}

console.log('realtime-client: ok');
