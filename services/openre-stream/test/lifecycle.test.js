'use strict';

// openre-stream — model lifecycle smoke.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'openre-stream-test-')), 'stream.db');
process.env.OPENVIBE_EVENTS_URL = 'http://127.0.0.1:1';

const config = require('../server/config');
const db = require('../server/db');
db.init(config.db.path);

const model = require('../server/model');

const ch = model.upsertChannel({ slug: 'alice', owner_user_id: '42', display_name: 'Alice' });
assert.strictEqual(ch.slug, 'alice');
assert.ok(ch.id.startsWith('chn_'));

const s = model.createStream({ channel_id: ch.id, protocol: 'rtmp', title: 'hello' });
assert.ok(s.id.startsWith('strm_'));
assert.strictEqual(s.status, 'created');

const started = model.startStream(s.id);
assert.strictEqual(started.status, 'started');
assert.ok(started.started_at);

model.recordIngestConnected({ stream_id: s.id, protocol: 'rtmp', client_addr: '1.2.3.4' });
const ended = model.endStream(s.id, { vod_media_id: 'med_abc' });
assert.strictEqual(ended.status, 'ended');
assert.strictEqual(ended.vod_media_id, 'med_abc');

const dst = model.createDestination({ owner_user_id: '42', kind: 'twitch', target_url: 'rtmp://twitch/x', target_key: 'key' });
assert.ok(dst.id.startsWith('dst_'));
model.setOutputState({ stream_id: s.id, destination_id: dst.id, state: 'started' });

model.recordMirror({ stream_id: s.id, live_url: 'http://live/@alice', channel_slug: 'alice' });
assert.ok(model.getMirrorState(s.id).live_url.includes('alice'));

console.log('openre-stream lifecycle tests OK');
