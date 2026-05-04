'use strict';

// openre-stream — updateChannel, regenerateStreamKey, updateDestination, deleteDestination, listOutputsByStreamId

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.NODE_ENV = 'development';
process.env.OPENVIBE_ENV = 'development';
process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'openre-stream-dash-test-')), 'stream.db');
process.env.OPENVIBE_EVENTS_URL = 'http://127.0.0.1:1';
process.env.OPENVIBE_PERSISTENCE_MODE = 'sqlite';
process.env.OPENVIBE_OPENRE_STREAM_PERSISTENCE_MODE = 'sqlite';
process.env.OPENVIBE_DATABASE_URL = '';
process.env.OPENVIBE_STAGING_DATABASE_URL = '';
process.env.OPENVIBE_OPENRE_STREAM_DATABASE_URL = '';

const config = require('../server/config');
const db = require('../server/db');
db.init(config.db.path);

const model = require('../server/model');

// ── fixture ───────────────────────────────────────────────────────────────────
const ch = model.upsertChannel({ slug: 'testuser', owner_user_id: '42', display_name: 'Test User' });
assert.ok(ch.id.startsWith('chn_'), 'channel id prefix');

// ── updateChannel: display_name + description ─────────────────────────────────
const updated = model.updateChannel('testuser', { display_name: 'Updated Name', description: 'My stream' });
assert.ok(updated, 'updateChannel returns channel');
assert.strictEqual(updated.display_name, 'Updated Name', 'display_name updated');
const meta = updated.metadata || JSON.parse(updated.metadata_json || '{}');
assert.strictEqual(meta.description, 'My stream', 'description stored in metadata');

// ── updateChannel: unknown slug returns null ──────────────────────────────────
const notFound = model.updateChannel('does-not-exist', { display_name: 'x' });
assert.strictEqual(notFound, null, 'updateChannel on missing slug returns null');

// ── updateChannel: visibility and flags ───────────────────────────────────────
const withFlags = model.updateChannel('testuser', { visibility: 'private', nsfw: true, recording_enabled: false });
assert.ok(withFlags, 'flag update returns channel');
const flagMeta = withFlags.metadata || JSON.parse(withFlags.metadata_json || '{}');
assert.strictEqual(flagMeta.visibility, 'private', 'visibility set');
assert.strictEqual(flagMeta.nsfw, true, 'nsfw flag');
assert.strictEqual(flagMeta.recording_enabled, false, 'recording_enabled flag');

// ── regenerateStreamKey ────────────────────────────────────────────────────────
const regen = model.regenerateStreamKey('testuser');
assert.ok(regen, 'regenerateStreamKey returns channel');
assert.ok(typeof regen.stream_key === 'string' && regen.stream_key.length >= 20, 'stream_key is hex string');

const regen2 = model.regenerateStreamKey('testuser');
assert.notStrictEqual(regen.stream_key, regen2.stream_key, 'each regen produces a different key');

// ── regenerateStreamKey: missing slug ─────────────────────────────────────────
const regenMissing = model.regenerateStreamKey('no-such-channel');
assert.strictEqual(regenMissing, null, 'regenerateStreamKey on missing slug returns null');

// ── destination create + update ───────────────────────────────────────────────
const dst = model.createDestination({ owner_user_id: '42', kind: 'twitch', target_url: 'rtmp://twitch/x', target_key: 'oldkey' });
assert.ok(dst.id.startsWith('dst_'), 'destination id prefix');
assert.strictEqual(dst.kind, 'twitch');
assert.strictEqual(dst.enabled, true, 'enabled by default');

const dstUpd = model.updateDestination(dst.id, { kind: 'youtube', label: 'My YT', target_url: 'rtmp://yt/live', target_key: 'newkey', enabled: true });
assert.ok(dstUpd, 'updateDestination returns destination');
assert.strictEqual(dstUpd.kind, 'youtube');
assert.strictEqual(dstUpd.label, 'My YT');
assert.strictEqual(dstUpd.target_url, 'rtmp://yt/live');
assert.strictEqual(dstUpd.target_key, 'newkey');
assert.strictEqual(dstUpd.enabled, true);

// ── updateDestination: partial update preserves other fields ─────────────────
const dstPartial = model.updateDestination(dst.id, { label: 'Renamed' });
assert.strictEqual(dstPartial.kind, 'youtube', 'kind preserved on partial update');
assert.strictEqual(dstPartial.label, 'Renamed');
assert.strictEqual(dstPartial.enabled, true, 'enabled preserved');

// ── updateDestination: missing id returns null ────────────────────────────────
const dstNotFound = model.updateDestination('dst_doesnotexist', { label: 'x' });
assert.strictEqual(dstNotFound, null, 'updateDestination on missing id returns null');

// ── listOutputsByStreamId ─────────────────────────────────────────────────────
const stream = model.createStream({ channel_id: ch.id, protocol: 'rtmp', title: 'test stream' });
model.setOutputState({ stream_id: stream.id, destination_id: dst.id, state: 'started' });
const outputs = model.listOutputsByStreamId(stream.id);
assert.strictEqual(outputs.length, 1, 'one output state row');
assert.strictEqual(outputs[0].state, 'started');
assert.strictEqual(outputs[0].destination_id, dst.id);

// no outputs for nonexistent stream
const noOutputs = model.listOutputsByStreamId('strm_doesnotexist');
assert.strictEqual(noOutputs.length, 0, 'no outputs for unknown stream_id');

// ── deleteDestination ─────────────────────────────────────────────────────────
const dst2 = model.createDestination({ owner_user_id: '42', kind: 'twitch', target_url: 'rtmp://t2/x', target_key: 'k2' });
const deleted = model.deleteDestination(dst2.id);
assert.strictEqual(deleted, true, 'deleteDestination returns true on success');
assert.strictEqual(model.getDestinationById(dst2.id), null, 'destination gone after delete');

// ── deleteDestination: idempotent for missing id ──────────────────────────────
const deletedMissing = model.deleteDestination(dst2.id);
assert.strictEqual(deletedMissing, false, 'deleteDestination returns false when not found');

console.log('dashboard-actions: all assertions passed');
