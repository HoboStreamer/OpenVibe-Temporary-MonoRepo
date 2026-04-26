'use strict';

// openvibe-live — SSR contains real <title>, <meta>, OG tags.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-live-test-')), 'live.db');
process.env.OPENVIBE_EVENTS_URL = 'http://127.0.0.1:1';

const config = require('../server/config');
const db = require('../server/db');
db.init(config.db.path);

const model = require('../server/model');
const ssr = require('../server/ssr');
const { applyStreamEvent } = require('../server/ingestion');
const { STREAM_EVENT_TYPES } = require('@openvibe/contracts/stream-events');

const ch = model.upsertChannel({ slug: 'alice', display_name: 'Alice', description: 'streamer' });
const s = model.upsertStream({ id: 'strm_1', channel_slug: 'alice', status: 'started', title: 'speedrun', started_at: '2026-01-01T00:00:00Z' });

const channelHtml = ssr.renderChannelPage({ channel: ch, currentStream: s, recentStreams: [s], baseUrl: config.publicBaseUrl });
assert.ok(/<title>Alice on openvibe\.live — LIVE NOW<\/title>/.test(channelHtml), 'channel page has live title');
assert.ok(/<meta name="description" content="[^"]+"/.test(channelHtml), 'has meta description');
assert.ok(/<link rel="canonical"/.test(channelHtml), 'has canonical');
assert.ok(/<meta property="og:title"/.test(channelHtml), 'has og:title');
assert.ok(/<meta property="og:url"/.test(channelHtml), 'has og:url');
assert.ok(/<meta name="twitter:card"/.test(channelHtml), 'has twitter:card');
assert.ok(/speedrun/.test(channelHtml), 'shows current stream title in body');
assert.ok(/LIVE/.test(channelHtml), 'live badge rendered');

const streamHtml = ssr.renderStreamPage({ channel: ch, stream: s, baseUrl: config.publicBaseUrl });
assert.ok(/<title>speedrun — Alice on openvibe\.live<\/title>/.test(streamHtml));
assert.ok(/<link rel="canonical" href="[^"]+\/c\/alice\/s\/strm_1"/.test(streamHtml));

// ingestion applies stream events to the read-model
const result = applyStreamEvent({
    event_type: STREAM_EVENT_TYPES.STARTED,
    occurred_at: '2026-02-01T00:00:00Z',
    payload: { stream_id: 'strm_2', channel_slug: 'bob', creator_id: '99', title: 'new stream' },
});
assert.strictEqual(result.ok, true);
const live = model.getStreamById('strm_2');
assert.strictEqual(live.status, 'started');
assert.strictEqual(live.channel_slug, 'bob');

console.log('openvibe-live SSR + ingestion tests OK');
