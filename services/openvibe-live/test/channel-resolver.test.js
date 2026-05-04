'use strict';

// openvibe-live — channel-resolver: sync resolution with known channel data.
// Tests the pure sync path (no network calls).

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.NODE_ENV = 'test';
process.env.OPENVIBE_ENV = 'test';
process.env.OPENVIBE_EVENTS_URL = 'http://127.0.0.1:1';
process.env.OPENVIBE_PERSISTENCE_MODE = 'sqlite';
process.env.OPENVIBE_OPENVIBE_LIVE_PERSISTENCE_MODE = 'sqlite';
process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-live-resolver-test-')), 'live.db');
process.env.OPENVIBE_DATABASE_URL = '';
process.env.OPENVIBE_STAGING_DATABASE_URL = '';
process.env.OPENVIBE_OPENVIBE_LIVE_DATABASE_URL = '';

const { resolveChannelSlugSync, cacheStats } = require('../server/channel-resolver');

// ── direct channel_slug field ─────────────────────────────────────────────────
const r1 = resolveChannelSlugSync({ channel_slug: 'alice-streams' });
assert.strictEqual(r1, 'alice-streams', 'item.channel_slug returned');

// ── nested channel object ─────────────────────────────────────────────────────
const r2 = resolveChannelSlugSync({ channel: { slug: 'bobthebuilder' } });
assert.strictEqual(r2, 'bobthebuilder', 'item.channel.slug returned');

// ── channel_name slugification ────────────────────────────────────────────────
const r3 = resolveChannelSlugSync({ channel_name: 'Charlie Gaming' });
assert.strictEqual(r3, 'charlie-gaming', 'channel_name slugified');

// ── owner_user_id fallback → null (no network) ────────────────────────────────
// The sync resolver returns null for owner_user_id-only items (async needed)
const r4 = resolveChannelSlugSync({ owner_user_id: '42' });
assert.strictEqual(r4, null, 'owner_user_id alone returns null from sync resolver');

// ── completely empty item ─────────────────────────────────────────────────────
const r5 = resolveChannelSlugSync({});
assert.strictEqual(r5, null, 'empty item returns null');

// ── null/undefined input ──────────────────────────────────────────────────────
const r6 = resolveChannelSlugSync(null);
assert.strictEqual(r6, null, 'null input returns null');

// ── special characters in channel_name ───────────────────────────────────────
const r7 = resolveChannelSlugSync({ channel_name: 'Xtreme!!! Gaming 2024' });
assert.ok(typeof r7 === 'string' && r7.length > 0, 'special chars handled');
assert.ok(!/[^a-z0-9-]/.test(r7), 'slug contains only safe chars');

// ── cacheStats ────────────────────────────────────────────────────────────────
const stats = cacheStats();
assert.ok(typeof stats.total === 'number', 'cacheStats returns total');

console.log('openvibe-live: channel-resolver tests passed');
