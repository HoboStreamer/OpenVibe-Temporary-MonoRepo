'use strict';

const assert = require('assert');
const { createEnvelope, validateEnvelope, newId } = require('../envelope');

// createEnvelope fills defaults
{
    const e = createEnvelope({ event_type: 'auth.token.issued', source: 'openvibe-network', payload: { sub: '42' } });
    assert.strictEqual(e.event_type, 'auth.token.issued');
    assert.strictEqual(e.source, 'openvibe-network');
    assert.strictEqual(e.version, 1);
    assert.strictEqual(e.actor_type, 'system');
    assert.ok(e.event_id.startsWith('evt_'));
    assert.ok(e.trace_id.startsWith('trc_'));
    assert.ok(typeof e.timestamp === 'string' && e.timestamp.includes('T'));
    assert.deepStrictEqual(e.payload, { sub: '42' });
}

// createEnvelope rejects missing event_type / source
assert.throws(() => createEnvelope({ source: 'x' }), /event_type/);
assert.throws(() => createEnvelope({ event_type: 'x' }), /source/);

// validateEnvelope catches bad shapes
{
    const errs = validateEnvelope({});
    assert.ok(errs.length >= 4, `expected several errors, got: ${errs.join(';')}`);
}
{
    const e = createEnvelope({ event_type: 't', source: 's' });
    assert.deepStrictEqual(validateEnvelope(e), []);
}

// honour caller-supplied event_id (idempotency)
{
    const e = createEnvelope({ event_type: 't', source: 's', event_id: 'evt_fixed' });
    assert.strictEqual(e.event_id, 'evt_fixed');
}

// newId is namespaced
assert.ok(newId('foo').startsWith('foo_'));

console.log('envelope: ok');
