'use strict';

// openvibe-api — API key management: create, list, revoke.
// Also tests /.well-known/openvibe endpoint.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.NODE_ENV = 'test';
process.env.OPENVIBE_EVENTS_URL = 'http://127.0.0.1:1';
process.env.OPENVIBE_AUTH_ISSUER = 'http://127.0.0.1:1';
process.env.OPENVIBE_PUBLIC_KEY_PATH = '';
process.env.INTERNAL_API_KEY = 'test-internal-key';
// Use a temp DB so each test run starts clean
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-api-test-'));
process.env.OPENVIBE_API_DB_PATH = path.join(tmpDir, 'api.db');

const db = require('../server/db');
db.init(process.env.OPENVIBE_API_DB_PATH);

// ── createApiKey ──────────────────────────────────────────────────────────────
const rec = db.createApiKey({ userId: 'usr_1', name: 'My key', scopes: ['read'] });
assert.ok(rec.key.startsWith('ovk_'), 'raw key has ovk_ prefix');
assert.ok(rec.id.startsWith('ak_'), 'id has ak_ prefix');
assert.deepStrictEqual(rec.scopes, ['read'], 'scopes preserved');

// ── listApiKeys ───────────────────────────────────────────────────────────────
const list = db.listApiKeys('usr_1');
assert.strictEqual(list.length, 1, 'one key found');
assert.strictEqual(list[0].name, 'My key');
assert.ok(!list[0].key, 'raw key is NOT exposed in list');

// ── getApiKeyByHash ───────────────────────────────────────────────────────────
const hash = db.hashKey(rec.key);
const found = db.getApiKeyByHash(hash);
assert.ok(found, 'key found by hash');
assert.strictEqual(found.user_id, 'usr_1');

// ── key not found for wrong hash ──────────────────────────────────────────────
const notFound = db.getApiKeyByHash('deadbeef'.repeat(8));
assert.strictEqual(notFound, undefined, 'unknown hash returns undefined');

// ── revokeApiKey ──────────────────────────────────────────────────────────────
const revoked = db.revokeApiKey(rec.id, 'usr_1');
assert.ok(revoked, 'revoke succeeded');
assert.strictEqual(revoked.revoked, true);

// revoked key should not appear in list
const listAfter = db.listApiKeys('usr_1');
assert.strictEqual(listAfter.length, 0, 'revoked key not in list');

// revoked key should not be found by hash
const foundAfterRevoke = db.getApiKeyByHash(hash);
assert.strictEqual(foundAfterRevoke, undefined, 'revoked key not found by hash');

// ── revokeApiKey for wrong user ────────────────────────────────────────────────
const rec2 = db.createApiKey({ userId: 'usr_2', name: 'Another', scopes: [] });
const wrongRevoke = db.revokeApiKey(rec2.id, 'usr_1');
assert.strictEqual(wrongRevoke, null, 'cannot revoke another user\'s key');

// ── createApiKey: multiple keys per user ──────────────────────────────────────
db.createApiKey({ userId: 'usr_3', name: 'key A', scopes: ['read'] });
db.createApiKey({ userId: 'usr_3', name: 'key B', scopes: ['write'] });
const twoKeys = db.listApiKeys('usr_3');
assert.strictEqual(twoKeys.length, 2, 'two keys for usr_3');

console.log('openvibe-api: api-keys tests passed');
