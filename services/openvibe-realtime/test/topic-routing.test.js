'use strict';

const assert = require('assert');
const {
    mapEnvelopeToPublicTopics,
    mapEnvelopeToRealtimeTargets,
    normalizeEventType,
    EVENT_ALIASES,
} = require('@openvibe/realtime');

// ── normalizeEventType ───────────────────────────────────────────────────────
assert.strictEqual(normalizeEventType('chat.message.created'), 'chat.message.sent', 'alias: chat.message.created');
assert.strictEqual(normalizeEventType('stream.vod_attached'), 'stream.vod.attached', 'alias: stream.vod_attached');
assert.strictEqual(normalizeEventType('community.thread.created'), 'thread.created', 'alias: community.thread.created');
assert.strictEqual(normalizeEventType('discord.message.created'), 'discord.message.received', 'alias: discord.message.created');
assert.strictEqual(normalizeEventType('chat.message.sent'), 'chat.message.sent', 'canonical passthrough');
assert.strictEqual(normalizeEventType('stream.started'), 'stream.started', 'canonical passthrough');
// colon notation
assert.strictEqual(normalizeEventType('chat:message:sent'), 'chat.message.sent', 'colon notation normalization');

// ── EVENT_ALIASES is sourced from contracts ──────────────────────────────────
assert.ok(Object.keys(EVENT_ALIASES).length >= 15, `Expected ≥15 aliases, got ${Object.keys(EVENT_ALIASES).length}`);
assert.ok('chat.message.created' in EVENT_ALIASES, 'Should have chat.message.created alias');
assert.ok('stream.vod_attached' in EVENT_ALIASES, 'Should have stream.vod_attached alias');

// ── mapEnvelopeToPublicTopics ────────────────────────────────────────────────

// stream.started → global:live + stream: + channel:
{
    const topics = mapEnvelopeToPublicTopics({
        event_type: 'stream.started',
        payload: { stream_id: 'str1', channel_slug: 'joe', channel_id: 'ch1' },
    });
    assert.ok(topics.includes('global:live'), 'stream.started → global:live');
    assert.ok(topics.includes('stream:str1'), 'stream.started → stream:str1');
    assert.ok(topics.includes('channel:joe'), 'stream.started → channel:joe');
}

// stream.ended → global:live
{
    const topics = mapEnvelopeToPublicTopics({
        event_type: 'stream.ended',
        payload: { stream_id: 'str2' },
    });
    assert.ok(topics.includes('global:live'), 'stream.ended → global:live');
    assert.ok(topics.includes('stream:str2'), 'stream.ended → stream:str2');
}

// vod.created → global:live
{
    const topics = mapEnvelopeToPublicTopics({
        event_type: 'vod.created',
        payload: { stream_id: 's3', media_id: 'm1', channel_slug: 'bob' },
    });
    assert.ok(topics.includes('global:live'), 'vod.created → global:live');
    assert.ok(topics.includes('stream:s3'), 'vod.created → stream:s3');
    assert.ok(topics.includes('media:m1'), 'vod.created → media:m1');
}

// thread.created → community:pulse
{
    const topics = mapEnvelopeToPublicTopics({
        event_type: 'thread.created',
        payload: { space_id: 'sp1', thread_id: 'th1' },
    });
    assert.ok(topics.includes('community:pulse'), 'thread.created → community:pulse');
    assert.ok(topics.includes('community:space:sp1'), 'thread.created → community:space:sp1');
    assert.ok(topics.includes('community:thread:th1'), 'thread.created → community:thread:th1');
}

// paste.created → community:pulse
{
    const topics = mapEnvelopeToPublicTopics({ event_type: 'paste.created', payload: {} });
    assert.ok(topics.includes('community:pulse'), 'paste.created → community:pulse');
}

// discord.message.received → community:pulse
{
    const topics = mapEnvelopeToPublicTopics({ event_type: 'discord.message.received', payload: {} });
    assert.ok(topics.includes('community:pulse'), 'discord.message.received → community:pulse');
}

// chat.message.sent → chat:global (default)
{
    const topics = mapEnvelopeToPublicTopics({
        event_type: 'chat.message.sent',
        payload: { room_type: 'global' },
    });
    assert.ok(topics.includes('chat:global'), 'chat.message.sent global → chat:global');
}

// chat.message.sent → chat:stream:<id>
{
    const topics = mapEnvelopeToPublicTopics({
        event_type: 'chat.message.sent',
        payload: { room_type: 'stream', stream_id: 'str99' },
    });
    assert.ok(topics.includes('chat:stream:str99'), 'chat.message.sent stream → chat:stream:str99');
}

// billing.tip.sent → channel/stream topic
{
    const topics = mapEnvelopeToPublicTopics({
        event_type: 'billing.tip.sent',
        payload: { target_context_type: 'channel', target_context_id: 'chan7', recipient_owner_id: 'u1' },
    });
    assert.ok(topics.includes('channel:chan7'), 'billing.tip.sent → channel:chan7');
    assert.ok(topics.includes('user:u1'), 'billing.tip.sent → user:u1');
}

// user.module.updated → user:<id>
{
    const topics = mapEnvelopeToPublicTopics({
        event_type: 'user.module.updated',
        payload: { user_id: 'u42' },
    });
    assert.ok(topics.includes('user:u42'), 'user.module.updated → user:u42');
}

// unknown event → empty array (no crash)
{
    const topics = mapEnvelopeToPublicTopics({ event_type: 'totally.unknown.event', payload: {} });
    assert.ok(Array.isArray(topics), 'unknown event returns array');
}

// empty envelope → empty array
{
    const topics = mapEnvelopeToPublicTopics({});
    assert.ok(Array.isArray(topics) && topics.length === 0, 'empty envelope returns []');
}

// ── mapEnvelopeToRealtimeTargets still works (Socket.IO routing) ────────────
{
    const targets = mapEnvelopeToRealtimeTargets({
        event_type: 'stream.started',
        payload: { stream_id: 's1', channel_slug: 'alice' },
    });
    assert.ok(targets.length > 0, 'mapEnvelopeToRealtimeTargets returns targets');
    const ns = targets.map((t) => t.namespace);
    assert.ok(ns.some((n) => n === '/live'), 'stream event routes to /live namespace');
}

console.log('topic-routing.test.js passed');
