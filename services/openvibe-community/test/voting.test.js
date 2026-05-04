'use strict';

// openvibe-community — voteThread and vote score computation tests.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.NODE_ENV = 'development';
process.env.OPENVIBE_ENV = 'development';
process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-community-vote-test-')), 'community.db');
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

// ── fixture: space + category + thread ──────────────────────────────────────
const space = model.createSpace({
    name: 'VoteTest',
    visibility: 'public',
    created_by_actor_type: 'user',
    created_by_actor_id: '1',
});
const cat = model.createCategory({ community_id: space.id, name: 'General' });
const thread = model.createThread({
    community_id: space.id,
    category_id: cat.id,
    title: 'Test vote thread',
    created_by_actor_type: 'user',
    created_by_actor_id: '1',
});

// ── getThreadVote returns 0 for no vote ───────────────────────────────────────
const noVote = model.getThreadVote(thread.id, 'user-1');
assert.strictEqual(noVote, 0, 'no vote yet → 0');

// ── upvote ────────────────────────────────────────────────────────────────────
const up1 = model.voteThread(thread.id, 'user-1', 1);
assert.strictEqual(up1.upvotes, 1, 'one upvote');
assert.strictEqual(up1.downvotes, 0);
assert.strictEqual(up1.score, 1);
assert.strictEqual(model.getThreadVote(thread.id, 'user-1'), 1, 'stored direction = 1');

// ── second user upvotes ───────────────────────────────────────────────────────
const up2 = model.voteThread(thread.id, 'user-2', 1);
assert.strictEqual(up2.upvotes, 2);
assert.strictEqual(up2.score, 2);

// ── downvote from third user ──────────────────────────────────────────────────
const dv = model.voteThread(thread.id, 'user-3', -1);
assert.strictEqual(dv.upvotes, 2);
assert.strictEqual(dv.downvotes, 1);
assert.strictEqual(dv.score, 1);
assert.strictEqual(model.getThreadVote(thread.id, 'user-3'), -1, 'stored direction = -1');

// ── user-1 changes vote to downvote (upsert semantics) ───────────────────────
const changed = model.voteThread(thread.id, 'user-1', -1);
assert.strictEqual(changed.upvotes, 1, 'user-1 switched to downvote');
assert.strictEqual(changed.downvotes, 2);
assert.strictEqual(changed.score, -1);

// ── user-2 removes vote ───────────────────────────────────────────────────────
const removed = model.voteThread(thread.id, 'user-2', 0);
assert.strictEqual(removed.upvotes, 0, 'user-2 removed vote → 0 upvotes');
assert.strictEqual(removed.downvotes, 2);
assert.strictEqual(removed.score, -2);
assert.strictEqual(model.getThreadVote(thread.id, 'user-2'), 0, 'no vote after removal');

// ── double-remove is idempotent ───────────────────────────────────────────────
const removed2 = model.voteThread(thread.id, 'user-2', 0);
assert.strictEqual(removed2.upvotes, 0);
assert.strictEqual(removed2.score, -2);

// ── votes do not bleed between threads ───────────────────────────────────────
const thread2 = model.createThread({
    community_id: space.id,
    category_id: cat.id,
    title: 'Second thread',
    created_by_actor_type: 'user',
    created_by_actor_id: '1',
});
const isolated = model.voteThread(thread2.id, 'user-1', 1);
assert.strictEqual(isolated.upvotes, 1, 'votes are per-thread');
assert.strictEqual(isolated.score, 1);

// thread 1 score unchanged
const t1Score = model.voteThread(thread.id, 'user-4', 1);
assert.strictEqual(t1Score.score, -1, 'thread 1 score still -1 before adding user-4 upvote, then -1+1 = 0... wait');
// recalculate: upvotes=1(user-4), downvotes=2(user-1,user-3) => score=-1
assert.strictEqual(t1Score.upvotes, 1);
assert.strictEqual(t1Score.downvotes, 2);

console.log('voting: all assertions passed');
