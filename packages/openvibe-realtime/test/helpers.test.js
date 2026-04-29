'use strict';

const assert = require('assert');

const {
    authenticateSocket,
    canJoinRoom,
    normalizeRoomName,
    parseToken,
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
    assert.strictEqual(canJoinRoom({ type: 'anonymous', id: null }, 'private:mods'), false);
    assert.strictEqual(canJoinRoom({ type: 'user', id: '42' }, 'dm:42:77'), true);
})();

console.log('openvibe-realtime helpers: OK');