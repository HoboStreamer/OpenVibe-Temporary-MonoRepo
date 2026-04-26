'use strict';

// openvibe-media — model + policy + quota smoke. Uses an in-memory tmpdir
// SQLite so it leaves no residue.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-media-test-')), 'media.db');
process.env.STORAGE_ROOT = path.join(path.dirname(process.env.DB_PATH), 'storage');
process.env.PUBLIC_BASE_URL = 'http://test';
process.env.OPENVIBE_EVENTS_URL = 'http://127.0.0.1:1';   // unreachable on purpose

const config = require('../server/config');
const db = require('../server/db');
db.init(config.db.path);

const model = require('../server/model');
const policy = require('../server/policy');
const quotas = require('../server/quotas');

// ── model ───────────────────────────────────────────────
const m = model.create({
    owner_type: 'user', owner_id: '42',
    namespace: 'live.thumbnails', type: 'thumbnail',
    mime_type: 'image/jpeg', size_bytes: 1234,
});
assert.ok(m.id.startsWith('med_'), 'media id format');
assert.strictEqual(m.namespace, 'live.thumbnails');
assert.strictEqual(m.visibility, 'public');     // namespace default
assert.strictEqual(m.storage_tier, 'hot');      // namespace default
assert.strictEqual(m.status, 'initialized');

const fetched = model.getById(m.id);
assert.strictEqual(fetched.id, m.id);

const updated = model.update(m.id, { status: 'ready', sha256: 'deadbeef', metadata: { foo: 'bar' } });
assert.strictEqual(updated.status, 'ready');
assert.strictEqual(updated.sha256, 'deadbeef');
assert.deepStrictEqual(updated.metadata, { foo: 'bar' });

const list = model.list({ namespace: 'live.thumbnails' });
assert.ok(list.find(x => x.id === m.id), 'list returns the media');

const deleted = model.softDelete(m.id);
assert.strictEqual(deleted.status, 'deleted');
assert.ok(deleted.deleted_at);

model.recordLegacyMap({ source: 'hobostreamer', kind: 'thumbnail', legacy_id: 't_42', media_id: m.id });
assert.strictEqual(model.lookupLegacy('hobostreamer', 'thumbnail', 't_42').media_id, m.id);

// ── policy ─────────────────────────────────────────────
const userReq = { user: { sub: '42', role: 'user' } };
const otherUserReq = { user: { sub: '99', role: 'user' } };
const adminReq = { user: { sub: '1', role: 'admin' } };
const ownerSvcReq = { serviceActor: 'openvibe-live' };

assert.strictEqual(policy.decideUpload({ req: userReq, namespace: 'user.profile_images', ownerType: 'user', ownerId: '42' }).allow, true);
assert.strictEqual(policy.decideUpload({ req: otherUserReq, namespace: 'user.profile_images', ownerType: 'user', ownerId: '42' }).allow, false);
assert.strictEqual(policy.decideUpload({ req: ownerSvcReq, namespace: 'live.vods', ownerType: 'user', ownerId: '42' }).allow, true);
assert.strictEqual(policy.decideUpload({ req: adminReq, namespace: 'live.vods', ownerType: 'user', ownerId: '42' }).allow, true);

const publicMedia = { id: 'x', namespace: 'live.thumbnails', visibility: 'public', owner_type: 'user', owner_id: '42' };
const privateMedia = { id: 'y', namespace: 'chat.attachments', visibility: 'private', owner_type: 'user', owner_id: '42' };
assert.strictEqual(policy.decideRead({ req: otherUserReq, media: publicMedia }).allow, true);
assert.strictEqual(policy.decideRead({ req: otherUserReq, media: privateMedia }).allow, false);
assert.strictEqual(policy.decideRead({ req: userReq, media: privateMedia }).allow, true);
assert.strictEqual(policy.decideRead({ req: adminReq, media: privateMedia }).allow, true);

// ── quotas ─────────────────────────────────────────────
const ok = quotas.checkUpload({ ownerType: 'user', ownerId: '7', namespace: 'live.thumbnails', type: 'thumbnail', mimeType: 'image/jpeg', intendedSize: 4096 });
assert.strictEqual(ok.allow, true, ok.reason);

const tooBig = quotas.checkUpload({ ownerType: 'user', ownerId: '7', namespace: 'live.thumbnails', type: 'thumbnail', mimeType: 'image/jpeg', intendedSize: 50 * 1024 * 1024 });
assert.strictEqual(tooBig.allow, false);

const wrongType = quotas.checkUpload({ ownerType: 'user', ownerId: '7', namespace: 'live.thumbnails', type: 'video', mimeType: 'video/mp4', intendedSize: 4096 });
assert.strictEqual(wrongType.allow, false);

quotas.setQuota({ ownerType: 'user', ownerId: '7', namespace: 'live.thumbnails', max_storage_bytes: 100, max_upload_bytes: 100, max_file_count: 1, allowed_mime_prefixes: ['image/'], allowed_types: ['thumbnail'] });
const overrideTooBig = quotas.checkUpload({ ownerType: 'user', ownerId: '7', namespace: 'live.thumbnails', type: 'thumbnail', mimeType: 'image/jpeg', intendedSize: 200 });
assert.strictEqual(overrideTooBig.allow, false);

console.log('media model+policy+quota tests OK');
