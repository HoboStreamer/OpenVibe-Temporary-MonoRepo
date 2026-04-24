'use strict';

const assert = require('assert');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { OpenVibeAuthClient } = require('../auth-client');

function genKey() {
    return crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).toJSON ? null : null; // unused, see below
}

// Generate two RS256 keypairs (one per issuer).
function rsa() {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    return { privateKey, publicKey };
}

const ISSUER_OV = 'https://auth.openvibe.network';
const ISSUER_HT = 'https://hobo.tools';

const ov = rsa();
const ht = rsa();

const client = new OpenVibeAuthClient();
client.addIssuer({ issuer: ISSUER_OV, publicKey: ov.publicKey, label: 'openvibe' });
client.addIssuer({ issuer: ISSUER_HT, publicKey: ht.publicKey, label: 'hobo-tools' });

assert.strictEqual(client.listIssuers().length, 2, 'two issuers registered');

// 1. token signed by openvibe key + iss=ov is accepted
{
    const tok = jwt.sign({ sub: '7', role: 'admin' }, ov.privateKey, { algorithm: 'RS256', issuer: ISSUER_OV });
    const u = client.verifyToken(tok);
    assert.ok(u, `should verify, lastError=${client.lastError}`);
    assert.strictEqual(u.sub, '7');
    assert.strictEqual(u.role, 'admin');
}

// 2. token signed by hobo-tools key + iss=hobo is accepted (federation)
{
    const tok = jwt.sign({ sub: '8' }, ht.privateKey, { algorithm: 'RS256', issuer: ISSUER_HT });
    const u = client.verifyToken(tok);
    assert.ok(u, `hobo token should verify, lastError=${client.lastError}`);
    assert.strictEqual(u.sub, '8');
}

// 3. cross-signed token (signed by ov private key but iss=hobo) is REJECTED
{
    const tok = jwt.sign({ sub: '9' }, ov.privateKey, { algorithm: 'RS256', issuer: ISSUER_HT });
    const u = client.verifyToken(tok);
    assert.strictEqual(u, null, 'cross-signed token must be rejected');
    assert.match(client.lastError, /verify failed/);
}

// 4. unknown issuer is rejected
{
    const tok = jwt.sign({ sub: '0' }, ov.privateKey, { algorithm: 'RS256', issuer: 'https://attacker.example' });
    const u = client.verifyToken(tok);
    assert.strictEqual(u, null);
    assert.match(client.lastError, /not trusted/);
}

// 5. malformed / missing token rejected without throwing
assert.strictEqual(client.verifyToken(null), null);
assert.strictEqual(client.verifyToken('not-a-jwt'), null);

console.log('auth-client: ok');
void genKey; // silence unused
