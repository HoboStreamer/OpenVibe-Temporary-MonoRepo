'use strict';

// openre-stream — model lifecycle smoke.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.NODE_ENV = 'development';
process.env.OPENVIBE_ENV = 'development';
process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'openre-stream-test-')), 'stream.db');
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

const recording = model.upsertRecording({ stream_id: s.id, channel_slug: 'alice', status: 'recording', dvr_playlist_url: 'http://example/playlist.m3u8' });
assert.strictEqual(recording.stream_id, s.id);

const segment = model.upsertRecordingSegment({ recording_id: recording.id, segment_index: 1, start_ms: 0, duration_ms: 6000, media_id: 'med_seg_1' });
assert.strictEqual(segment.segment_index, 1);

const clip = model.createClipProject({ stream_id: s.id, owner_user_id: '42', title: 'Best moment', start_ms: 1000, end_ms: 5000 });
assert.strictEqual(clip.stream_id, s.id);
assert.ok(model.listClipProjects({ stream_id: s.id }).length >= 1);

console.log('openre-stream lifecycle tests OK');
