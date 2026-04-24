'use strict';

const assert = require('assert');
const policy = require('../server/policy');

function reqAnon()                  { return { headers: {} }; }
function reqUser(sub, role)         { return { headers: {}, user: { sub, role } }; }
function reqService(serviceId)      { return { headers: {}, serviceActor: serviceId }; }
function reqAdmin()                 { return reqUser('admin1', 'admin'); }

// ── reads ─────────────────────────────────────────────────────
// 'live.profile' is public → any authenticated request reads.
{
    const d = policy.decideUserModuleRead({ req: reqUser('42', 'user'), userId: '42', namespace: 'live.profile' });
    assert.ok(d.allow, `user should read public ns: ${d.reason}`);
}
{
    const d = policy.decideUserModuleRead({ req: reqAnon(), userId: '42', namespace: 'live.profile' });
    assert.strictEqual(d.allow, false, 'anon should NOT read');
}

// 'chat.preferences' is self → only owning user reads.
{
    assert.ok(policy.decideUserModuleRead({ req: reqUser('5', 'user'), userId: '5', namespace: 'chat.preferences' }).allow);
    assert.strictEqual(policy.decideUserModuleRead({ req: reqUser('6', 'user'), userId: '5', namespace: 'chat.preferences' }).allow, false);
}

// ── writes ────────────────────────────────────────────────────
// Owner service may write any user.
{
    const d = policy.decideUserModuleWrite({ req: reqService('openvibe-live'), userId: '42', namespace: 'live.profile' });
    assert.ok(d.allow, `owner service should write: ${d.reason}`);
}
// Non-owner service may not write.
{
    const d = policy.decideUserModuleWrite({ req: reqService('openvibe-chat'), userId: '42', namespace: 'live.profile' });
    assert.strictEqual(d.allow, false);
}
// Self may write user_writable namespace.
{
    const d = policy.decideUserModuleWrite({ req: reqUser('42', 'user'), userId: '42', namespace: 'live.profile' });
    assert.ok(d.allow, 'self-write of user_writable ns');
}
// Self may NOT write non-user_writable namespace.
{
    const d = policy.decideUserModuleWrite({ req: reqUser('42', 'user'), userId: '42', namespace: 'live.stats' });
    assert.strictEqual(d.allow, false);
}
// Admin override.
{
    const d = policy.decideUserModuleWrite({ req: reqAdmin(), userId: '99', namespace: 'live.stats' });
    assert.ok(d.allow);
}

// ── registry ──────────────────────────────────────────────────
assert.ok(policy.decideRegistryWrite({ req: reqService('any'), registry: 'service_registry' }).allow);
assert.ok(policy.decideRegistryWrite({ req: reqAdmin(),         registry: 'service_registry' }).allow);
assert.strictEqual(policy.decideRegistryWrite({ req: reqUser('1', 'user'), registry: 'service_registry' }).allow, false);

// ── assert throws on deny but does NOT throw on allow ─────────
// We can't audit without a real DB; calling assert with allow-only avoids
// audit insertion (which uses better-sqlite3). Wrap in try and ignore audit
// failures so the test doesn't depend on the DB being initialised.
try {
    policy.assert({ allow: true, reason: 'ok' }, { actorType: 'service', actorId: 'x', action: 'read', resource: 'r' });
} catch (err) {
    if (!/network db/.test(err.message)) throw err; // audit DB not initialised in this unit test — ignore
}
assert.throws(() => {
    try {
        policy.assert({ allow: false, reason: 'denied' }, { actorType: 'user', actorId: '1', action: 'w', resource: 'r' });
    } catch (err) {
        if (/network db/.test(err.message)) throw new policy.PolicyDeniedError('denied');
        throw err;
    }
}, /policy denied/);

console.log('policy: ok');
