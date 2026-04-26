'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-community-test-')), 'community.db');
process.env.OPENVIBE_EVENTS_URL = 'http://127.0.0.1:1';

const config = require('../server/config');
const db = require('../server/db');
db.init(config.db.path);

const model = require('../server/model');
const policy = require('../server/policy');

// space
const space = model.createSpace({ name: 'Hobotown', visibility: 'public', created_by_actor_type: 'user', created_by_actor_id: '42' });
assert.ok(space.id.startsWith('cmty_'));
assert.strictEqual(model.getSpace(space.slug).id, space.id);

// category
const cat = model.createCategory({ community_id: space.id, name: 'General' });
assert.ok(cat.id.startsWith('cat_'));
assert.strictEqual(model.listCategories(space.id).length, 1);

// thread
const thread = model.createThread({ community_id: space.id, category_id: cat.id, title: 'Hello world', created_by_actor_type: 'user', created_by_actor_id: '42' });
assert.ok(thread.id.startsWith('thr_'));
const threadList = model.listThreads({ community_id: space.id });
assert.strictEqual(threadList.length, 1);

// post
const post = model.createPost({ thread_id: thread.id, author_type: 'user', author_id: '42', body: 'first post' });
assert.ok(post.id.startsWith('post_'));
assert.strictEqual(model.listPosts(thread.id).length, 1);
const edited = model.updatePost(post.id, { body: 'edited' });
assert.strictEqual(edited.body, 'edited');
assert.ok(edited.edited_at);

// comments via ensureThreadForRef
const t2 = model.ensureThreadForRef('vod', 'vod-123', { title: 'VOD vod-123', thread_type: 'comments' });
const t2b = model.ensureThreadForRef('vod', 'vod-123', {});
assert.strictEqual(t2.id, t2b.id, 'ensureThreadForRef should be idempotent');

// paste
const paste = model.createPaste({ title: 'My paste', body: 'console.log(1)', language: 'js', visibility: 'public', created_by_actor_type: 'user', created_by_actor_id: '42' });
assert.ok(paste.slug);
const fetched = model.getPasteBySlug(paste.slug);
assert.strictEqual(fetched.body, 'console.log(1)');
model.bumpPasteView(paste.slug);
assert.strictEqual(model.getPasteBySlug(paste.slug).view_count, 1);

// pastes — slug uniqueness
const p1 = model.createPaste({ slug: 'same', body: 'a', created_by_actor_type: 'user', created_by_actor_id: '42' });
const p2 = model.createPaste({ slug: 'same', body: 'b', created_by_actor_type: 'user', created_by_actor_id: '42' });
assert.notStrictEqual(p1.slug, p2.slug, 'duplicate slug should be auto-suffixed');

// attachments — must reference media_id
const att = model.attachMedia({ attached_to_type: 'post', attached_to_id: post.id, media_id: 'med_test_1' });
assert.ok(att.id.startsWith('att_'));
assert.strictEqual(model.listAttachments('post', post.id).length, 1);

// discord relay loop prevention
const relay = model.createRelay({ discord_channel_id: 'chan_1', enabled: true });
assert.strictEqual(model.findRelayByChannel('chan_1').id, relay.id);
model.recordDiscordMessage({ discord_message_id: 'dm_1', discord_channel_id: 'chan_1', openvibe_post_id: post.id, openvibe_thread_id: thread.id });
assert.ok(model.findDiscordMessage('dm_1'));

// policy
const userReq = { user: { sub: '42', role: 'user' } };
const otherReq = { user: { sub: '99', role: 'user' } };
const adminReq = { user: { sub: '1', role: 'admin' } };
const anonReq = {};
const svcReq = { serviceActor: 'openvibe-live' };

const privatePaste = model.createPaste({ body: 'secret', visibility: 'private', created_by_actor_type: 'user', created_by_actor_id: '42' });
assert.strictEqual(policy.decideRead({ req: userReq, target: { visibility: privatePaste.visibility, created_by_actor_type: privatePaste.created_by_actor_type, created_by_actor_id: privatePaste.created_by_actor_id } }).allow, true);
assert.strictEqual(policy.decideRead({ req: otherReq, target: { visibility: privatePaste.visibility, created_by_actor_type: privatePaste.created_by_actor_type, created_by_actor_id: privatePaste.created_by_actor_id } }).allow, false);
assert.strictEqual(policy.decideRead({ req: adminReq, target: { visibility: privatePaste.visibility } }).allow, true);

assert.strictEqual(policy.decidePost({ req: anonReq, thread }).allow, false);
assert.strictEqual(policy.decidePost({ req: userReq, thread }).allow, true);
const lockedThread = Object.assign({}, thread, { status: 'locked' });
assert.strictEqual(policy.decidePost({ req: userReq, thread: lockedThread }).allow, false);
assert.strictEqual(policy.decidePost({ req: adminReq, thread: lockedThread }).allow, true);

assert.strictEqual(policy.decideEdit({ req: userReq, post }).allow, true);
assert.strictEqual(policy.decideEdit({ req: otherReq, post }).allow, false);

assert.strictEqual(policy.decidePasteOwnership({ req: userReq, paste: privatePaste }).allow, true);
assert.strictEqual(policy.decidePasteOwnership({ req: otherReq, paste: privatePaste }).allow, false);

assert.strictEqual(policy.decideRelayManage({ req: userReq }).allow, false);
assert.strictEqual(policy.decideRelayManage({ req: adminReq }).allow, true);
assert.strictEqual(policy.decideRelayManage({ req: svcReq }).allow, true);

// legacy
model.recordLegacyMap({ source: 'hobostreamer', kind: 'paste', legacy_id: 'p1', new_id: paste.id });
assert.strictEqual(model.lookupLegacy('hobostreamer', 'paste', 'p1').new_id, paste.id);

console.log('openvibe-community smoke OK');
