'use strict';

// openvibe-community — listDiscordMessages + renderChatPage + renderThreadDetailPage

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.NODE_ENV = 'development';
process.env.OPENVIBE_ENV = 'development';
process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-community-chat-test-')), 'community.db');
process.env.OPENVIBE_EVENTS_URL = 'http://127.0.0.1:1';
process.env.OPENVIBE_PERSISTENCE_MODE = 'sqlite';
process.env.OPENVIBE_OPENVIBE_COMMUNITY_PERSISTENCE_MODE = 'sqlite';
process.env.OPENVIBE_DATABASE_URL = '';
process.env.OPENVIBE_STAGING_DATABASE_URL = '';
process.env.OPENVIBE_OPENVIBE_COMMUNITY_DATABASE_URL = '';

const config = require('../server/config');
const db = require('../server/db');
db.init(config.db.path);

const model = require('../server/model');
const ssr = require('../server/ssr');

// ── listDiscordMessages: empty by default ─────────────────────────────────────
const empty = model.listDiscordMessages();
assert.ok(Array.isArray(empty), 'returns array');
assert.strictEqual(empty.length, 0, 'empty on fresh db');

// ── fixture: relay + messages ─────────────────────────────────────────────────
const relay = model.createRelay({ discord_channel_id: 'chan_test', enabled: true });
assert.ok(relay.id, 'relay created');

const space = model.createSpace({ name: 'DiscordTest', visibility: 'public', created_by_actor_type: 'user', created_by_actor_id: '1' });
const cat = model.createCategory({ community_id: space.id, name: 'General' });
const thread = model.createThread({
    community_id: space.id,
    category_id: cat.id,
    title: 'Chat thread',
    created_by_actor_type: 'user',
    created_by_actor_id: '1',
});
const post = model.createPost({ thread_id: thread.id, author_type: 'user', author_id: '1', body: 'hello' });

model.recordDiscordMessage({
    discord_message_id: 'dm_chat_1',
    discord_channel_id: 'chan_test',
    openvibe_post_id: post.id,
    openvibe_thread_id: thread.id,
    metadata: { username: 'hobouser', content: 'Hello community!' },
});
model.recordDiscordMessage({
    discord_message_id: 'dm_chat_2',
    discord_channel_id: 'chan_test',
    openvibe_post_id: post.id,
    openvibe_thread_id: thread.id,
    metadata: { username: 'anotheruser', content: 'Nice stream today.' },
});

// ── listDiscordMessages: returns all messages ─────────────────────────────────
const all = model.listDiscordMessages();
assert.strictEqual(all.length, 2, 'returns both messages');
assert.ok(all.every(m => m.discord_message_id), 'rows have discord_message_id');
assert.ok(all.every(m => m.metadata !== undefined), 'rows have metadata object');

// ── listDiscordMessages: filter by relay_id ───────────────────────────────────
const byRelay = model.listDiscordMessages({ relay_id: relay.id });
assert.strictEqual(byRelay.length, 2, 'relay filter returns matching messages');

const noRelay = model.listDiscordMessages({ relay_id: 'relay_nonexistent' });
assert.strictEqual(noRelay.length, 0, 'unknown relay_id returns empty array');

// ── listDiscordMessages: limit and offset ─────────────────────────────────────
const limited = model.listDiscordMessages({ limit: 1 });
assert.strictEqual(limited.length, 1, 'limit works');

const offset1 = model.listDiscordMessages({ limit: 10, offset: 1 });
assert.strictEqual(offset1.length, 1, 'offset=1 returns remaining 1 row');

const offset2 = model.listDiscordMessages({ limit: 10, offset: 2 });
assert.strictEqual(offset2.length, 0, 'offset=2 exhausts the rows');

// ── listDiscordMessages: idempotency (duplicate message_id ignored) ────────────
model.recordDiscordMessage({
    discord_message_id: 'dm_chat_1',
    discord_channel_id: 'chan_test',
    openvibe_post_id: post.id,
    openvibe_thread_id: thread.id,
    metadata: { username: 'hobouser', content: 'duplicate' },
});
const afterDup = model.listDiscordMessages();
assert.strictEqual(afterDup.length, 2, 'duplicate message_id is ignored');

// ── renderChatPage: HTML output ───────────────────────────────────────────────
const messages = model.listDiscordMessages({ limit: 50 });
const html = ssr.renderChatPage(messages);
assert.ok(typeof html === 'string', 'renderChatPage returns string');
assert.ok(html.includes('<html'), 'renders full HTML page');
assert.ok(html.includes('Chat'), 'title includes Chat');
assert.ok(html.includes('hobouser'), 'includes first message username');
assert.ok(html.includes('Nice stream today'), 'includes second message content');
assert.ok(html.includes('data-chat-messages'), 'includes data-chat-messages container attribute');

// ── renderChatPage: empty messages ───────────────────────────────────────────
const emptyHtml = ssr.renderChatPage([]);
assert.ok(emptyHtml.includes('No messages yet'), 'empty state message shown');
assert.ok(!emptyHtml.includes('hobouser'), 'no user data in empty state');

// ── renderThreadDetailPage: normal thread ─────────────────────────────────────
const threadHtml = ssr.renderThreadDetailPage(thread, [post]);
assert.ok(typeof threadHtml === 'string', 'renderThreadDetailPage returns string');
assert.ok(threadHtml.includes('Chat thread'), 'thread title in HTML');
assert.ok(threadHtml.includes('hello'), 'post body in HTML');
assert.ok(threadHtml.includes('/threads'), 'includes back link');

// ── renderThreadDetailPage: null thread → 404 page ───────────────────────────
const notFoundHtml = ssr.renderThreadDetailPage(null, []);
assert.ok(notFoundHtml.includes('Thread not found'), 'shows not-found state');

console.log('chat-page: all assertions passed');
