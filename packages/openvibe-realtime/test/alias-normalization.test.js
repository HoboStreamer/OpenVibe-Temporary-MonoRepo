'use strict';

// openvibe-realtime — EVENT_ALIASES + normalizeEventType smoke tests.

const assert = require('assert');

const { EVENT_ALIASES, normalizeEventType } = require('../events');

// canonical types pass through unchanged
assert.strictEqual(normalizeEventType('stream.started'), 'stream.started', 'canonical stream.started passthrough');
assert.strictEqual(normalizeEventType('stream.ended'), 'stream.ended', 'canonical stream.ended passthrough');
assert.strictEqual(normalizeEventType('vod.created'), 'vod.created', 'canonical vod.created passthrough');
assert.strictEqual(normalizeEventType('clip.created'), 'clip.created', 'canonical clip.created passthrough');

// known aliases resolve to canonical
assert.strictEqual(normalizeEventType('stream.vod_attached'), 'stream.vod.attached', 'stream.vod_attached alias');
assert.strictEqual(normalizeEventType('stream.ingest_connected'), 'stream.ingest.connected', 'stream.ingest_connected alias');
assert.strictEqual(normalizeEventType('community.thread.created'), 'thread.created', 'community.thread.created alias');
assert.strictEqual(normalizeEventType('community.post.created'), 'comment.created', 'community.post.created alias');
assert.strictEqual(normalizeEventType('chat.message.created'), 'chat.message.sent', 'chat.message.created alias');
assert.strictEqual(normalizeEventType('chat.message_created'), 'chat.message.sent', 'chat.message_created alias');
assert.strictEqual(normalizeEventType('media.upload_completed'), 'media.upload.completed', 'media.upload_completed alias');
assert.strictEqual(normalizeEventType('discord.message.created'), 'discord.message.received', 'discord.message.created alias');

// colon separators are normalised
assert.strictEqual(normalizeEventType('chat:message:sent'), 'chat.message.sent', 'colons become dots');

// empty / falsy -> "unknown"
assert.strictEqual(normalizeEventType(''), 'unknown', 'empty string -> unknown');
assert.strictEqual(normalizeEventType(null), 'unknown', 'null -> unknown');
assert.strictEqual(normalizeEventType(undefined), 'unknown', 'undefined -> unknown');

// case insensitivity
assert.strictEqual(normalizeEventType('CHAT.MESSAGE.CREATED'), 'chat.message.sent', 'uppercase alias resolves');
assert.strictEqual(normalizeEventType('Stream.Started'), 'stream.started', 'mixed case canonical passthrough');

// EVENT_ALIASES structure invariants
assert.strictEqual(typeof EVENT_ALIASES, 'object');
assert.ok(EVENT_ALIASES !== null);
for (const [alias, canonical] of Object.entries(EVENT_ALIASES)) {
    assert.ok(typeof alias === 'string' && alias.length > 0, 'alias key must be non-empty string');
    assert.ok(typeof canonical === 'string' && canonical.length > 0, 'canonical must be non-empty string: ' + alias);
    assert.notStrictEqual(alias, canonical, 'alias should differ from canonical target: ' + alias);
    assert.ok(!(canonical in EVENT_ALIASES), 'canonical should not itself be an alias: ' + canonical + ' (from ' + alias + ')');
}

console.log('alias-normalization: all assertions passed');
