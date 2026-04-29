'use strict';

// openvibe-chat — model + policy smoke test (no HTTP).

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-chat-test-')), 'chat.db');
process.env.OPENVIBE_EVENTS_URL = 'http://127.0.0.1:1';

const config = require('../server/config');
const db = require('../server/db');
db.init(config.db.path);

const model = require('../server/model');
const policy = require('../server/policy');

// rooms
const room = model.createRoom({ room_type: 'global', visibility: 'public', title: 'Global', external_ref_type: 'global', external_ref_id: 'global' });
assert.ok(room.id.startsWith('room_'));
assert.strictEqual(model.findRoomByExternal('global', 'global').id, room.id);

// participant
const p = model.upsertParticipant({ room_id: room.id, actor_type: 'user', actor_id: '42', role: 'owner' });
assert.strictEqual(p.role, 'owner');
const pp = model.listParticipants(room.id);
assert.strictEqual(pp.length, 1);

// messages
const msg = model.createMessage({ room_id: room.id, sender_type: 'user', sender_id: '42', body: 'hello' });
assert.ok(msg.id.startsWith('msg_'));
const list = model.listMessages({ room_id: room.id });
assert.strictEqual(list.length, 1);
const edited = model.editMessage(msg.id, { body: 'edited' });
assert.strictEqual(edited.body, 'edited');
assert.ok(edited.edited_at);
const del = model.deleteMessage(msg.id);
assert.ok(del.deleted_at);

// DM
const dmRoom = model.findOrCreateDmRoom({ actor_type: 'user', actor_id: '42' }, { actor_type: 'user', actor_id: '99' });
assert.strictEqual(dmRoom.room_type, 'dm');
const dms = model.listDmsForActor('user', '42');
assert.ok(dms.find(r => r.id === dmRoom.id));

// idempotent DM
const dmRoom2 = model.findOrCreateDmRoom({ actor_type: 'user', actor_id: '99' }, { actor_type: 'user', actor_id: '42' });
assert.strictEqual(dmRoom2.id, dmRoom.id, 'DM room should be order-independent');
const dmIncoming = model.createMessage({ room_id: dmRoom.id, sender_type: 'user', sender_id: '99', body: 'hey there' });
assert.ok(dmIncoming.id.startsWith('msg_'));
let unread = model.getDmUnreadSummary('user', '42');
assert.strictEqual(unread.total_unread, 1);
assert.strictEqual(unread.rooms[0].room_id, dmRoom.id);
const dmListWithUnread = model.listDmsForActor('user', '42');
assert.strictEqual(dmListWithUnread.find((r) => r.id === dmRoom.id).unread_count, 1);
const readParticipant = model.markRoomRead(dmRoom.id, 'user', '42');
assert.ok(readParticipant.last_read_at);
unread = model.getDmUnreadSummary('user', '42');
assert.strictEqual(unread.total_unread, 0);

// calls
const call = model.createCall({ room_id: dmRoom.id, call_type: 'voice', status: 'ringing', started_by_actor_type: 'user', started_by_actor_id: '42', target_actor_type: 'user', target_actor_id: '99' });
assert.strictEqual(call.status, 'ringing');
const accepted = model.updateCallStatus(call.id, 'active');
assert.ok(accepted.answered_at);
model.recordCallSignal({ call_id: call.id, from_actor_type: 'user', from_actor_id: '42', signal_type: 'offer', payload: { sdp: '...' } });
const sigs = model.listCallSignals(call.id);
assert.strictEqual(sigs.length, 1);

// TTS
const tts = model.upsertTtsSettings({ owner_type: 'user', owner_id: '42', voice: 'alice', volume: 80 });
assert.strictEqual(tts.voice, 'alice');
assert.strictEqual(tts.volume, 80);
// defaults for unknown owner
const defaults = model.getTtsSettings('user', 'unknown');
assert.strictEqual(defaults._defaults, true);
assert.strictEqual(defaults.voice, 'default');

// audio queue
const audio = model.enqueueAudio({ owner_type: 'user', owner_id: '42', queue_type: 'soundboard', external_url: 'https://example.com/a.mp3', source_type: 'external_url' });
assert.ok(audio.id.startsWith('aud_'));
const aq = model.listAudio({ owner_type: 'user', owner_id: '42', queue_type: 'soundboard' });
assert.strictEqual(aq.length, 1);
const skipped = model.setAudioStatus(audio.id, 'skipped');
assert.strictEqual(skipped.status, 'skipped');

// policy
const userReq = { user: { sub: '42', role: 'user' } };
const otherReq = { user: { sub: '99', role: 'user' } };
const adminReq = { user: { sub: '1', role: 'admin' } };
const svcReq = { serviceActor: 'openvibe-live' };

const privateRoom = model.createRoom({ room_type: 'dm', visibility: 'private' });
model.upsertParticipant({ room_id: privateRoom.id, actor_type: 'user', actor_id: '42', role: 'participant' });
assert.strictEqual(policy.decideRead({ req: userReq, room: privateRoom, model }).allow, true);
assert.strictEqual(policy.decideRead({ req: otherReq, room: privateRoom, model }).allow, false);
assert.strictEqual(policy.decideRead({ req: adminReq, room: privateRoom, model }).allow, true);
assert.strictEqual(policy.decideRead({ req: svcReq, room: privateRoom, model }).allow, true);

// public room: send requires non-anonymous
assert.strictEqual(policy.decideSend({ req: { }, room, model }).allow, false);
assert.strictEqual(policy.decideSend({ req: userReq, room, model }).allow, true);

// tts ownership
assert.strictEqual(policy.decideTtsOwnership({ req: userReq, owner_type: 'user', owner_id: '42' }).allow, true);
assert.strictEqual(policy.decideTtsOwnership({ req: otherReq, owner_type: 'user', owner_id: '42' }).allow, false);
assert.strictEqual(policy.decideTtsOwnership({ req: svcReq, owner_type: 'user', owner_id: '42' }).allow, true);

// legacy mapping
model.recordLegacyMap({ source: 'hobostreamer', kind: 'message', legacy_id: 'm1', new_id: msg.id });
assert.strictEqual(model.lookupLegacy('hobostreamer', 'message', 'm1').new_id, msg.id);

const shellHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
assert.ok(!shellHtml.includes('https://openvibe.network'), 'chat shell should not embed production network origin literals in inline HTML');
assert.ok(!shellHtml.includes('https://auth.openvibe.network'), 'chat shell should not embed production auth origin literals in inline HTML');

console.log('openvibe-chat smoke OK');
