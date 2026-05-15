'use strict';

// openvibe-api — registry routes: /.well-known/openvibe, /registry/services/:id,
// /registry/domains/:domain, /registry/topics, /registry/ecosystem

const assert = require('assert');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.NODE_ENV = 'test';
process.env.OPENVIBE_EVENTS_URL = 'http://127.0.0.1:1';
process.env.OPENVIBE_AUTH_ISSUER = 'http://127.0.0.1:1';
process.env.OPENVIBE_PUBLIC_KEY_PATH = '';
process.env.INTERNAL_API_KEY = 'test-internal-key';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-api-reg-test-'));
process.env.OPENVIBE_API_DB_PATH = path.join(tmpDir, 'api.db');
process.env.OPENVIBE_URL_MODE = 'local';
process.env.OPENVIBE_LOCAL_PROTOCOL = 'http';
process.env.OPENVIBE_LOCAL_HOST_SUFFIX = 'localhost';

const { buildApp } = require('../server/index');

let server;
let port;

async function setup() {
    const { app } = buildApp();
    await new Promise((resolve) => {
        server = app.listen(0, '127.0.0.1', () => {
            port = server.address().port;
            resolve();
        });
    });
}

function get(path) {
    return new Promise((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${port}${path}`, (res) => {
            let body = '';
            res.on('data', (d) => { body += d; });
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(body) });
                } catch {
                    resolve({ status: res.statusCode, data: body });
                }
            });
        });
        req.on('error', reject);
    });
}

async function run() {
    await setup();

    // ── /.well-known/openvibe ─────────────────────────────────
    {
        const r = await get('/.well-known/openvibe');
        assert.strictEqual(r.status, 200, '/.well-known/openvibe returns 200');
        assert.ok(r.data.spec_version, 'Has spec_version');
        assert.ok(typeof r.data.urls === 'object', 'Has urls object');
        assert.ok(typeof r.data.urls.auth === 'string', 'Has urls.auth');
        assert.ok(Array.isArray(r.data.services), 'Has services array');
        assert.ok(r.data.services.length >= 15, `Expected ≥15 services, got ${r.data.services.length}`);
        const live = r.data.services.find((s) => s.id === 'openvibe-live');
        assert.ok(live, 'openvibe-live should be in well-known services');
        assert.strictEqual(live.domain, 'openvibe.live', 'openvibe-live domain should be openvibe.live');
        assert.ok(typeof r.data.gateway === 'object', 'Has gateway');
        assert.ok(typeof r.data.gateway.registry === 'string', 'Has gateway.registry URL');
    }

    // ── /api/v1/registry/services/:id ────────────────────────
    {
        const r = await get('/api/v1/registry/services/openvibe-live');
        assert.strictEqual(r.status, 200, '/registry/services/:id returns 200');
        assert.ok(r.data.service, 'Has service field');
        assert.strictEqual(r.data.service.id, 'openvibe-live', 'Correct service ID');
        assert.strictEqual(r.data.service.category, 'core_product', 'Correct category');
    }

    {
        const r = await get('/api/v1/registry/services/openre-stream');
        assert.strictEqual(r.status, 200, 'openre-stream found');
        assert.strictEqual(r.data.service.status, 'current', 'openre-stream is current');
    }

    {
        const r = await get('/api/v1/registry/services/does-not-exist');
        assert.strictEqual(r.status, 404, 'Unknown service returns 404');
    }

    // ── /api/v1/registry/domains/:domain ─────────────────────
    {
        const r = await get('/api/v1/registry/domains/openvibe.live');
        assert.strictEqual(r.status, 200, '/registry/domains/:domain returns 200');
        assert.ok(r.data.service, 'Has service field');
        assert.strictEqual(r.data.service.id, 'openvibe-live', 'Resolved by domain');
    }

    {
        const r = await get('/api/v1/registry/domains/openre.stream');
        assert.strictEqual(r.status, 200, 'openre.stream domain resolves');
        assert.strictEqual(r.data.service.id, 'openre-stream', 'Correct service ID');
    }

    {
        const r = await get('/api/v1/registry/domains/completely.unknown.tld');
        assert.strictEqual(r.status, 404, 'Unknown domain returns 404');
    }

    // ── /api/v1/registry/topics ───────────────────────────────
    {
        const r = await get('/api/v1/registry/topics');
        assert.strictEqual(r.status, 200, '/registry/topics returns 200');
        assert.ok(Array.isArray(r.data.topics), 'Has topics array');
        assert.ok(r.data.topics.includes('stream.events'), 'Includes stream.events');
        assert.ok(r.data.topics.includes('chat.events'), 'Includes chat.events');
        assert.ok(r.data.topics.includes('community.events'), 'Includes community.events');
        assert.ok(r.data.event_types.length >= 20, `Expected ≥20 event_types, got ${r.data.event_types.length}`);
    }

    // ── /api/v1/registry/ecosystem ────────────────────────────
    {
        const r = await get('/api/v1/registry/ecosystem');
        assert.strictEqual(r.status, 200, '/registry/ecosystem returns 200');
        assert.ok(typeof r.data.categories === 'object', 'Has categories');
        assert.ok(r.data.categories.kernel, 'Has kernel category');
        assert.ok(r.data.categories.core_product, 'Has core_product category');
        assert.ok(Array.isArray(r.data.categories.kernel.services), 'kernel.services is array');
        assert.ok(r.data.categories.kernel.services.length >= 5, 'kernel has ≥5 services');
        assert.ok(typeof r.data.well_known === 'object', 'Has well_known URLs');
        assert.ok(r.data.service_count >= 20, `Expected ≥20 total services, got ${r.data.service_count}`);
    }

    server.close();
    console.log('registry.test.js passed');
}

run().catch((err) => { console.error(err); process.exit(1); });
