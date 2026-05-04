'use strict';

// openvibe-tips lifecycle test.
// Exercises: DB init, creator CRUD, connector management, tip event
// normalisation (all 4 connectors), deduplication, feed query.
// Run: node test/tips-lifecycle.test.js (from /opt/openvibe)

const assert = require('assert');
const path   = require('path');
const os     = require('os');
const fs     = require('fs');

// Isolate test DB
const tmpDb = path.join(os.tmpdir(), 'tips-test-' + Date.now() + '.db');
process.env.TIPS_DB_PATH  = tmpDb;
process.env.TIPS_PORT     = '0';
process.env.OPENVIBE_INTERNAL_KEY = 'test-key';
// Blank upstream URLs so no real network calls
process.env.OPENVIBE_EVENTS_URL  = 'http://localhost:0';
process.env.OPENVIBE_NETWORK_URL = 'http://localhost:0';
process.env.OPENVIBE_BILLING_URL = 'http://localhost:0';
// Blank auth so no RSA key loading
process.env.OPENVIBE_AUTH_PUBLIC_KEY_PATH = '';

const SVC = path.join(__dirname, '..');
const db      = require(SVC + '/server/db');
const model   = require(SVC + '/server/model');
const connectors = require(SVC + '/server/connectors');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log('  ✓', name);
        passed++;
    } catch (e) {
        console.error('  ✗', name);
        console.error('    ', e.message);
        failed++;
    }
}

// ── Init ────────────────────────────────────────────────────────────────────
db.init(tmpDb);
console.log('DB initialised:', tmpDb);

// ── Creator CRUD ────────────────────────────────────────────────────────────
console.log('\nCreator CRUD');

let creator;
test('create creator', () => {
    creator = model.upsertCreator({
        id:             null,
        user_id:        'user-001',
        slug:           'teststreamer',
        display_name:   'Test Streamer',
        bio:            'Hello world',
        avatar_url:     null,
        accent_color:   '#f59e0b',
        currency:       'USD',
        native_enabled: 1,
        custom_amounts: '[1,5,10,25]',
        min_amount:     100,
        status:         'active',
        metadata_json:  '{}',
    });
    assert.ok(creator && creator.id, 'creator should have an id');
    assert.strictEqual(creator.slug, 'teststreamer');
});

test('get creator by slug', () => {
    const got = model.getCreatorBySlug('teststreamer');
    assert.ok(got, 'should find creator');
    assert.strictEqual(got.id, creator.id);
});

test('get creator by id', () => {
    const got = model.getCreatorById(creator.id);
    assert.ok(got, 'should find creator by id');
});

test('list creators', () => {
    const list = model.listCreators({ limit: 10 });
    assert.ok(list.length >= 1);
});

// ── Connectors ──────────────────────────────────────────────────────────────
console.log('\nConnectors');

let slConn;
test('add streamlabs connector', () => {
    slConn = model.upsertConnector({
        creator_id:     creator.id,
        connector_type: 'streamlabs',
        label:          'My Streamlabs',
        config_json:    '{}',
        status:         'active',
    });
    assert.ok(slConn && slConn.id, 'connector should have id');
    assert.strictEqual(slConn.connector_type, 'streamlabs');
});

test('list connectors', () => {
    const list = model.listConnectors(creator.id);
    assert.ok(list.length >= 1);
});

test('get connector by type', () => {
    const c = model.getConnectorByType(creator.id, 'streamlabs');
    assert.ok(c, 'should find connector by type');
});

// ── Webhook tokens ──────────────────────────────────────────────────────────
console.log('\nWebhook tokens');

let tok;
test('create webhook token', () => {
    tok = model.createWebhookToken({ creator_id: creator.id, label: 'test' });
    assert.ok(tok && tok.token, 'should have token string');
    assert.ok(tok.token.length >= 32, 'token should be long enough');
});

test('look up webhook token', () => {
    const found = model.getWebhookToken(tok.token);
    assert.ok(found, 'should find token');
    assert.strictEqual(found.creator_id, creator.id);
});

test('list webhook tokens', () => {
    const list = model.listWebhookTokens(creator.id);
    assert.ok(list.length >= 1);
});

// ── Connector normalisers ───────────────────────────────────────────────────
console.log('\nConnector normalisers');

test('streamlabs donation', () => {
    const sl = connectors.getConnector('streamlabs');
    assert.ok(sl, 'should find streamlabs connector');
    const events = sl.normalise({
        type: 'donation',
        message: [{ name: 'Fan1', amount: '10.00', currency: 'USD', message: 'GG!', id: 'sl-001' }]
    }, { creator_id: creator.id, connector_id: slConn.id });
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].event_type, 'tip');
    assert.strictEqual(events[0].sender, 'Fan1');
    assert.strictEqual(events[0].amount_value, '10.00');
    assert.strictEqual(events[0].external_id, 'sl-001');
});

test('streamelements tip', () => {
    const se = connectors.getConnector('streamelements');
    const events = se.normalise({
        type: 'tip',
        data: { username: 'Fan2', amount: 5, currency: 'USD', message: 'Nice!', _id: 'se-001' }
    }, { creator_id: creator.id });
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].event_type, 'tip');
    assert.strictEqual(events[0].sender, 'Fan2');
});

test('powerchat donation', () => {
    const pc = connectors.getConnector('powerchat');
    const events = pc.normalise({
        type: 'donation',
        data: { username: 'Fan3', amount: 20, currency: 'USD', message: 'Sub hype!', orderId: 'pc-001' }
    }, { creator_id: creator.id });
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].sender, 'Fan3');
    assert.strictEqual(events[0].amount_minor, 2000);
});

test('generic webhook', () => {
    const g = connectors.getConnector('generic');
    const events = g.normalise({
        name: 'Fan4', amount: '3.50', currency: 'USD', message: 'Ko-fi style', id: 'gw-001'
    }, { creator_id: creator.id, config_json: '{"service_name":"kofi"}' });
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].source, 'kofi');
    assert.strictEqual(events[0].external_id, 'gw-001');
});

// ── Tip events ──────────────────────────────────────────────────────────────
console.log('\nTip events');

let ev1;
test('insert tip event', () => {
    ev1 = model.insertTipEvent({
        creator_id:      creator.id,
        connector_id:    slConn.id,
        source:          'streamlabs',
        event_type:      'tip',
        sender:          'Fan1',
        amount_value:    '10.00',
        amount_currency: 'USD',
        amount_minor:    1000,
        message:         'GG!',
        is_anonymous:    0,
        visibility:      'public',
        external_id:     'sl-001-test',
        raw_json:        '{}',
    });
    assert.ok(ev1 && ev1.id, 'should have id');
});

test('deduplicates by external_id', () => {
    // INSERT OR IGNORE — should return null on duplicate
    const dup = model.insertTipEvent({
        creator_id:      creator.id,
        connector_id:    slConn.id,
        source:          'streamlabs',
        event_type:      'tip',
        sender:          'Fan1',
        amount_value:    '10.00',
        amount_currency: 'USD',
        amount_minor:    1000,
        message:         'GG!',
        is_anonymous:    0,
        visibility:      'public',
        external_id:     'sl-001-test',
        raw_json:        '{}',
    });
    assert.strictEqual(dup, null, 'duplicate should return null');
});

test('insert event without external_id (not deduped)', () => {
    const ev = model.insertTipEvent({
        creator_id:      creator.id,
        connector_id:    null,
        source:          'native',
        event_type:      'tip',
        sender:          'Native User',
        amount_value:    '5.00',
        amount_currency: 'USD',
        amount_minor:    500,
        message:         null,
        is_anonymous:    0,
        visibility:      'public',
        external_id:     null,
        raw_json:        '{}',
    });
    assert.ok(ev && ev.id);
});

test('list tip events', () => {
    const list = model.listTipEvents({ creator_id: creator.id, limit: 20 });
    assert.ok(list.length >= 2, 'should have at least 2 events');
});

test('list tip events by source', () => {
    const list = model.listTipEvents({ creator_id: creator.id, source: 'streamlabs', limit: 20 });
    assert.ok(list.every(e => e.source === 'streamlabs'), 'should only have streamlabs events');
});

test('list connector types', () => {
    const types = connectors.listConnectorTypes();
    assert.ok(types.length >= 4, 'should have at least 4 connector types');
    const names = types.map(t => t.type);
    assert.ok(names.includes('streamlabs'));
    assert.ok(names.includes('streamelements'));
    assert.ok(names.includes('powerchat'));
    assert.ok(names.includes('generic'));
});

// ── Cleanup ─────────────────────────────────────────────────────────────────
try { fs.unlinkSync(tmpDb); } catch { /* ignore */ }

console.log(`\n${passed + failed} tests — ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
