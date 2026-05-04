'use strict';

const assert = require('assert');
const {
    ECOSYSTEM_SERVICES,
    ECOSYSTEM_CATEGORIES,
    ECOSYSTEM_CATEGORY_LABELS,
    WELL_KNOWN_URLS,
    listServices,
    listServicesByCategory,
    getService,
    getServiceByDomain,
    listEcosystemCapabilities,
    listEventTopics,
} = require('../ecosystem');
const { EVENT_ALIASES, EVENT_TYPE_LIST, EVENT_TYPES } = require('../events');

// ── ECOSYSTEM_SERVICES ──────────────────────────────────────────────────────
assert.ok(Array.isArray(ECOSYSTEM_SERVICES), 'ECOSYSTEM_SERVICES should be an array');
assert.ok(ECOSYSTEM_SERVICES.length >= 20, `Expected ≥20 services, got ${ECOSYSTEM_SERVICES.length}`);

// Every service has required fields
for (const svc of ECOSYSTEM_SERVICES) {
    assert.ok(typeof svc.id === 'string' && svc.id.length > 0, `service.id missing: ${JSON.stringify(svc)}`);
    assert.ok(typeof svc.label === 'string' && svc.label.length > 0, `service.label missing for ${svc.id}`);
    assert.ok(ECOSYSTEM_CATEGORIES.includes(svc.category), `service.category invalid for ${svc.id}: ${svc.category}`);
    assert.ok(['current', 'planned'].includes(svc.status), `service.status invalid for ${svc.id}: ${svc.status}`);
    assert.ok(Array.isArray(svc.capabilities), `service.capabilities not array for ${svc.id}`);
    assert.ok(Array.isArray(svc.eventTopics), `service.eventTopics not array for ${svc.id}`);
    assert.ok(Array.isArray(svc.dependsOn), `service.dependsOn not array for ${svc.id}`);
    assert.ok(Array.isArray(svc.provides), `service.provides not array for ${svc.id}`);
}

// IDs are unique
const ids = ECOSYSTEM_SERVICES.map((s) => s.id);
const uniqueIds = new Set(ids);
assert.strictEqual(uniqueIds.size, ids.length, 'Service IDs should be unique');

// ── required services exist ─────────────────────────────────────────────────
const required = [
    'openvibe-network', 'openvibe-api', 'openvibe-control', 'openvibe-events',
    'openvibe-realtime', 'openvibe-billing', 'openvibe-ai',
    'openvibe-media', 'openvibe-live', 'openre-stream',
    'openvibe-chat', 'openvibe-community', 'openvibe-games',
];
for (const id of required) {
    assert.ok(getService(id), `Required service missing: ${id}`);
}

// ── categories ──────────────────────────────────────────────────────────────
assert.ok(ECOSYSTEM_CATEGORIES.includes('kernel'), 'Should have kernel category');
assert.ok(ECOSYSTEM_CATEGORIES.includes('foundation'), 'Should have foundation category');
assert.ok(ECOSYSTEM_CATEGORIES.includes('core_product'), 'Should have core_product category');
assert.ok(ECOSYSTEM_CATEGORIES.includes('creator_economy'), 'Should have creator_economy category');
assert.ok(ECOSYSTEM_CATEGORIES.includes('discovery_growth'), 'Should have discovery_growth category');

const kernelServices = listServicesByCategory('kernel');
assert.ok(kernelServices.length >= 5, `Expected ≥5 kernel services, got ${kernelServices.length}`);

const coreServices = listServicesByCategory('core_product');
assert.ok(coreServices.length >= 4, `Expected ≥4 core_product services, got ${coreServices.length}`);

// ── helpers ─────────────────────────────────────────────────────────────────
assert.strictEqual(listServices().length, ECOSYSTEM_SERVICES.length, 'listServices() returns all services');

const live = getService('openvibe-live');
assert.ok(live, 'getService(openvibe-live) should work');
assert.strictEqual(live.domain, 'openvibe.live', 'openvibe-live domain should be openvibe.live');
assert.strictEqual(live.status, 'current', 'openvibe-live should be current');

const byDomain = getServiceByDomain('openre.stream');
assert.ok(byDomain, 'getServiceByDomain should work');
assert.strictEqual(byDomain.id, 'openre-stream', 'Should find openre-stream by domain');

const unknown = getServiceByDomain('does.not.exist');
assert.strictEqual(unknown, null, 'Unknown domain returns null');

// ── capabilities ────────────────────────────────────────────────────────────
const caps = listEcosystemCapabilities();
assert.ok(caps.length > 10, `Expected >10 capabilities, got ${caps.length}`);
const capSet = new Set(caps);
assert.strictEqual(capSet.size, caps.length, 'Capabilities should be unique');

// ── topics ──────────────────────────────────────────────────────────────────
const topics = listEventTopics();
assert.ok(topics.length >= 5, `Expected ≥5 topics, got ${topics.length}`);
assert.ok(topics.includes('stream.events'), 'Should include stream.events');
assert.ok(topics.includes('chat.events'), 'Should include chat.events');

// ── WELL_KNOWN_URLS ─────────────────────────────────────────────────────────
assert.ok(typeof WELL_KNOWN_URLS.network === 'string', 'Should have network URL');
assert.ok(typeof WELL_KNOWN_URLS.auth === 'string', 'Should have auth URL');
assert.ok(typeof WELL_KNOWN_URLS.realtime === 'string', 'Should have realtime URL');

// ── CATEGORY_LABELS ─────────────────────────────────────────────────────────
for (const cat of ECOSYSTEM_CATEGORIES) {
    assert.ok(typeof ECOSYSTEM_CATEGORY_LABELS[cat] === 'string', `Missing label for category: ${cat}`);
}

// ── EVENT_TYPES completeness ─────────────────────────────────────────────────
assert.ok(EVENT_TYPE_LIST.includes('stream.started'), 'EVENT_TYPES should include stream.started');
assert.ok(EVENT_TYPE_LIST.includes('stream.vod.attached'), 'EVENT_TYPES should include stream.vod.attached');
assert.ok(EVENT_TYPE_LIST.includes('chat.message.sent'), 'EVENT_TYPES should include chat.message.sent');
assert.ok(EVENT_TYPE_LIST.includes('thread.created'), 'EVENT_TYPES should include thread.created');
assert.ok(EVENT_TYPE_LIST.includes('paste.created'), 'EVENT_TYPES should include paste.created');
assert.ok(EVENT_TYPE_LIST.includes('discord.message.received'), 'EVENT_TYPES should include discord.message.received');
assert.ok(EVENT_TYPE_LIST.includes('billing.tip.sent'), 'EVENT_TYPES should include billing.tip.sent');
assert.ok(EVENT_TYPE_LIST.includes('ai.transcription.ready'), 'EVENT_TYPES should include ai.transcription.ready');
assert.ok(EVENT_TYPE_LIST.length >= 50, `Expected ≥50 event types, got ${EVENT_TYPE_LIST.length}`);

// ── EVENT_ALIASES ────────────────────────────────────────────────────────────
assert.ok(typeof EVENT_ALIASES === 'object', 'EVENT_ALIASES should be an object');
assert.strictEqual(EVENT_ALIASES['chat.message.created'], EVENT_TYPES.CHAT_MESSAGE_SENT, 'chat.message.created should alias to chat.message.sent');
assert.strictEqual(EVENT_ALIASES['stream.vod_attached'], EVENT_TYPES.STREAM_VOD_ATTACHED, 'stream.vod_attached should alias to stream.vod.attached');
assert.strictEqual(EVENT_ALIASES['community.thread.created'], EVENT_TYPES.THREAD_CREATED, 'community.thread.created should alias to thread.created');

console.log('ecosystem.test.js passed');
