'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const jwt = require('jsonwebtoken');

const { buildAuthClient } = require('../server/middleware');
const { actorFromSocket } = require('../server/realtime');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-games-auth-'));
const keyPair = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
const publicKeyPath = path.join(tmp, 'openvibe-public.pem');
fs.writeFileSync(publicKeyPath, keyPair.publicKey, 'utf8');

const issuer = 'http://auth.openvibe.network.localhost:4100';
const authClient = buildAuthClient({
    auth: {
        issuer,
        publicKeyPath,
    },
});

const token = jwt.sign({
    sub: 'user_auth_1',
    username: 'alice',
    display_name: 'Alice Example',
    role: 'user',
}, keyPair.privateKey, {
    algorithm: 'RS256',
    issuer,
});

const actor = actorFromSocket({
    id: 'socket-auth',
    handshake: {
        auth: { token },
        headers: {},
    },
}, authClient);
assert.strictEqual(actor.type, 'user');
assert.strictEqual(actor.id, 'user_auth_1');
assert.strictEqual(actor.display_name, 'Alice Example');
assert.strictEqual(actor.role, 'user');

const legacyActor = actorFromSocket({
    id: 'socket-legacy',
    handshake: {
        auth: {
            userId: 'legacy-user',
            displayName: 'Legacy User',
            role: 'user',
        },
        headers: {},
    },
}, authClient);
assert.strictEqual(legacyActor.type, 'user');
assert.strictEqual(legacyActor.id, 'legacy-user');
assert.strictEqual(legacyActor.display_name, 'Legacy User');

const guestActor = actorFromSocket({
    id: '1234567890abcdef',
    handshake: {
        auth: {},
        headers: {},
    },
}, authClient);
assert.strictEqual(guestActor.type, 'guest');
assert.ok(String(guestActor.id).startsWith('guest:'));

console.log('openvibe-games sourcevibe auth OK');
