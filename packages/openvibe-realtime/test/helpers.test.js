'use strict';

const assert = require('assert');

const {
    authenticateSocket,
    canJoinRoom,
    REALTIME_NAMESPACES,
    mapEnvelopeToRealtimeTargets,
    normalizeRoomName,
    parseToken,
    roomAdmin,
    roomGlobalChat,
    roomPublicSpace,
    roomUser,
} = require('..');

(function parsesDevTokens() {
    assert.deepStrictEqual(parseToken('user:42'), { type: 'user', id: '42' });
    assert.deepStrictEqual(parseToken('Bearer service:openvibe-live'), { type: 'service', id: 'openvibe-live' });
})();

(function authenticatesInternalService() {
    const actor = authenticateSocket({ headers: { 'x-internal-key': 'secret' }, auth: { serviceId: 'openvibe-chat' } }, { internalKey: 'secret', allowAnonymous: false });
    assert.strictEqual(actor.type, 'service');
})();

(function normalizesAndAuthorizesRooms() {
    assert.strictEqual(normalizeRoomName(' public:general '), 'public:general');
    assert.strictEqual(canJoinRoom({ type: 'anonymous', id: null }, 'public:general'), true);
    assert.strictEqual(canJoinRoom({ type: 'anonymous', id: null }, roomGlobalChat()), true);
    assert.strictEqual(canJoinRoom({ type: 'anonymous', id: null }, 'private:mods'), false);
    assert.strictEqual(canJoinRoom({ type: 'user', id: '42' }, roomUser('42')), true);
    assert.strictEqual(canJoinRoom({ type: 'user', id: '42' }, roomUser('77')), false);
    assert.strictEqual(canJoinRoom({ type: 'user', id: '42' }, roomAdmin()), false);
    assert.strictEqual(canJoinRoom({ type: 'user', id: '42' }, 'dm:42:77'), true);
    assert.strictEqual(canJoinRoom({ type: 'anonymous', id: null }, roomPublicSpace('space-1')), true);
    assert.strictEqual(canJoinRoom({ type: 'user', id: '42' }, 'space:private-1'), false);
})();

(function exposesProductionNamespaces() {
    assert.ok(Array.isArray(REALTIME_NAMESPACES));
    assert.ok(REALTIME_NAMESPACES.includes('/realtime'));
    assert.ok(REALTIME_NAMESPACES.includes('/admin'));
    assert.ok(REALTIME_NAMESPACES.includes('/community'));
    assert.ok(REALTIME_NAMESPACES.includes('/billing'));
    assert.ok(REALTIME_NAMESPACES.includes('/ai'));
})();

(function mapsCanonicalEnvelopeTargets() {
    const targets = mapEnvelopeToRealtimeTargets({
        event_type: 'stream.started',
        source: 'openre-stream',
        payload: { stream_id: 'stream-1', channel_id: 'channel-9' },
    });
    assert.ok(targets.some((target) => target.namespace === '/live' && target.room === 'live:stream:stream-1'));
    assert.ok(targets.some((target) => target.namespace === '/live' && target.room === 'channel:channel-9'));
})();

console.log('openvibe-realtime helpers: OK');