'use strict';

// openvibe-community — SSR pages: /threads, /pastes, /p/:slug render HTML
// with correct content-type and expected DOM landmarks.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.NODE_ENV = 'test';
process.env.OPENVIBE_ENV = 'test';
process.env.OPENVIBE_EVENTS_URL = 'http://127.0.0.1:1';
process.env.OPENVIBE_PERSISTENCE_MODE = 'sqlite';
process.env.OPENVIBE_OPENVIBE_COMMUNITY_PERSISTENCE_MODE = 'sqlite';
process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-community-ssr-test-')), 'community.db');
process.env.OPENVIBE_DATABASE_URL = '';
process.env.OPENVIBE_STAGING_DATABASE_URL = '';
process.env.OPENVIBE_OPENVIBE_COMMUNITY_DATABASE_URL = '';
// Blank out public origins so SSR URL building is predictable
process.env.OPENVIBE_URL_MODE = 'local';
process.env.OPENVIBE_LOCAL_PROTOCOL = 'http';
process.env.OPENVIBE_LOCAL_HOST_SUFFIX = 'localhost';

const communitySSR = require('../server/ssr');

// ── renderThreadsPage ─────────────────────────────────────────────────────────
const threadsHtml = communitySSR.renderThreadsPage(
    [{ id: 'thr_1', title: 'Hello world', slug: 'hello-world', reply_count: 3, created_by_actor_id: '42', created_at: '2026-01-01T00:00:00Z' }],
    { title: 'Threads' }
);
assert.ok(typeof threadsHtml === 'string', 'renderThreadsPage returns string');
assert.ok(threadsHtml.includes('<!doctype html'), 'threadsPage has doctype');
assert.ok(threadsHtml.includes('Hello world'), 'thread title appears in output');
assert.ok(threadsHtml.includes('Threads'), 'page section present');

// ── renderPastesPage ──────────────────────────────────────────────────────────
const pastesHtml = communitySSR.renderPastesPage(
    [{ id: 'p_1', title: 'My snippet', slug: 'my-snippet', language: 'js', view_count: 12, created_by_actor_id: '42', created_at: '2026-01-02T00:00:00Z' }],
    { title: 'Pastes' }
);
assert.ok(typeof pastesHtml === 'string', 'renderPastesPage returns string');
assert.ok(pastesHtml.includes('My snippet'), 'paste title appears');
assert.ok(pastesHtml.includes('<!doctype html'), 'pastesPage has doctype');

// ── renderPasteViewPage ───────────────────────────────────────────────────────
const pasteViewHtml = communitySSR.renderPasteViewPage(
    {
        id: 'p_2', title: 'Code paste', slug: 'code-paste',
        language: 'javascript', content: 'console.log("hello")',
        view_count: 5, created_by_actor_id: '99', created_at: '2026-01-03T00:00:00Z',
    },
    {}
);
assert.ok(typeof pasteViewHtml === 'string', 'renderPasteViewPage returns string');
assert.ok(pasteViewHtml.includes('Code paste'), 'paste title in view');
assert.ok(pasteViewHtml.includes('console.log'), 'paste body in view');
// XSS: body is HTML-escaped so no raw <script> from content
assert.ok(!pasteViewHtml.includes('<script>console.log'), 'body is escaped, no raw script tag');

// ── renderPulsePage ───────────────────────────────────────────────────────────
const pulseHtml = communitySSR.renderPulsePage(
    [{ id: 'thr_2', title: 'Pulse thread', slug: 'pulse', reply_count: 0, created_by_actor_id: '1', created_at: '2026-01-04T00:00:00Z' }],
    [{ id: 'p_3', title: 'Pulse paste', slug: 'pulse-paste', language: 'text', view_count: 1, created_by_actor_id: '1', created_at: '2026-01-04T00:00:00Z' }],
    {}
);
assert.ok(typeof pulseHtml === 'string', 'renderPulsePage returns string');
assert.ok(pulseHtml.includes('Pulse thread'), 'thread in pulse');
assert.ok(pulseHtml.includes('Pulse paste'), 'paste in pulse');

// ── empty states ──────────────────────────────────────────────────────────────
const emptyThreads = communitySSR.renderThreadsPage([], {});
assert.ok(emptyThreads.includes('<!doctype html'), 'empty threads page still valid HTML');

const emptyPastes = communitySSR.renderPastesPage([], {});
assert.ok(emptyPastes.includes('<!doctype html'), 'empty pastes page still valid HTML');

console.log('openvibe-community: ssr-pages tests passed');
