'use strict';

const assert = require('assert');

const {
    authenticateSocket,
    canJoinRoom,
    roomAdmin,
    roomDm,
    roomGlobalChat,
    roomStreamChat,
    roomUser,
} = require('@openvibe/realtime');

(function authenticatesUserTokens() {
    const actor = authenticateSocket({ auth: { token: 'user:42' }, headers: {} }, { allowAnonymous: false });
    assert.deepStrictEqual(actor, { type: 'user', id: '42' });
})();

(function enforcesRoomPolicies() {
    assert.strictEqual(canJoinRoom({ type: 'anonymous', id: null }, roomGlobalChat()), true);
    assert.strictEqual(canJoinRoom({ type: 'anonymous', id: null }, roomStreamChat('stream_1')), true);
    assert.strictEqual(canJoinRoom({ type: 'anonymous', id: null }, roomAdmin()), false);
    assert.strictEqual(canJoinRoom({ type: 'user', id: '42' }, roomDm('42:77')), true);
    assert.strictEqual(canJoinRoom({ type: 'user', id: '42' }, roomDm('7:99')), false);
    assert.strictEqual(canJoinRoom({ type: 'user', id: '42' }, roomUser('42')), true);
    assert.strictEqual(canJoinRoom({ type: 'user', id: '42' }, roomUser('77')), false);
})();

console.log('openvibe-realtime socket auth tests OK');
