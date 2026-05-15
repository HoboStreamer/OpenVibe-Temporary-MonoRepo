'use strict';

// openvibe-control — ecosystem page SSR

const assert = require('assert');

process.env.NODE_ENV = 'test';

const { renderEcosystemPage } = require('../server/ssr');

// ── renderEcosystemPage doesn't throw ────────────────────────────────────────
let html;
assert.doesNotThrow(() => {
    html = renderEcosystemPage('admin@openvibe.net');
}, 'renderEcosystemPage should not throw');

assert.ok(typeof html === 'string', 'renderEcosystemPage returns a string');
assert.ok(html.length > 500, 'HTML should be substantial');

// ── Contains all 5 category labels ───────────────────────────────────────────
const { ECOSYSTEM_CATEGORY_LABELS } = require('@openvibe/contracts/ecosystem');
for (const label of Object.values(ECOSYSTEM_CATEGORY_LABELS)) {
    assert.ok(html.includes(label), `Ecosystem page should include category label: ${label}`);
}

// ── Contains core service names ───────────────────────────────────────────────
const coreLabels = ['OpenVibe Live', 'OpenRe.Stream', 'OpenVibe Chat', 'OpenVibe Community', 'OpenVibe Auth'];
for (const name of coreLabels) {
    assert.ok(html.includes(name), `Ecosystem page should include service: ${name}`);
}

// ── Contains ecosystem navigation link ───────────────────────────────────────
assert.ok(html.includes('href="/control/ecosystem"'), 'Navigation should include ecosystem link');

// ── Status badges ─────────────────────────────────────────────────────────────
assert.ok(html.includes('live') || html.includes('current'), 'Should have live status badges');

// ── Domains are linked ────────────────────────────────────────────────────────
assert.ok(html.includes('openvibe.live'), 'Should include openvibe.live domain');
assert.ok(html.includes('openre.stream'), 'Should include openre.stream domain');

// ── Anonymous call also works ─────────────────────────────────────────────────
assert.doesNotThrow(() => {
    const anonHtml = renderEcosystemPage(null);
    assert.ok(typeof anonHtml === 'string' && anonHtml.length > 500, 'anon call works');
}, 'renderEcosystemPage(null) should not throw');

console.log('ecosystem-page.test.js passed');
