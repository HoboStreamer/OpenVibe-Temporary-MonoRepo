'use strict';

// openvibe-live — Phase 16 product integrations test.
//
// Exercises the live_stream_integrations storage path and the
// /api/v1/{streams,channels}/.../integrations[/ensure] HTTP routes against an
// in-memory app booted with a fresh SQLite database. Downstream services are
// intentionally not configured; ensure outcomes are expected to be
// 'unavailable' (truthful seam) and the records must round-trip correctly.

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-live-int-test-')), 'live.db');
process.env.OPENVIBE_EVENTS_URL = 'http://127.0.0.1:1';
delete process.env.OPENVIBE_CHAT_URL;
delete process.env.OPENVIBE_BILLING_URL;
delete process.env.OPENVIBE_AI_URL;

const { buildApp } = require('../server/index');
const model = require('../server/model');
const integrations = require('../server/integrations');

function jsonRequest(server, options, body) {
    return new Promise((resolve, reject) => {
        const port = server.address().port;
        const headers = Object.assign({ 'content-type': 'application/json' }, options.headers || {});
        const req = http.request({
            host: '127.0.0.1', port, method: options.method || 'GET', path: options.path, headers,
        }, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                const text = Buffer.concat(chunks).toString('utf8');
                let parsed = null;
                try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
                resolve({ status: res.statusCode, body: parsed });
            });
        });
        req.on('error', reject);
        if (body !== undefined) req.write(typeof body === 'string' ? body : JSON.stringify(body));
        req.end();
    });
}

(async function main() {
    const { app } = buildApp();
    // Seed a channel and a stream.
    model.upsertChannel({ slug: 'integrator', display_name: 'Integrator' });
    model.upsertStream({ id: 'strm_int_1', channel_slug: 'integrator', status: 'started', title: 't1' });

    // Direct-model: unsupported target_kind throws.
    assert.throws(() => integrations.upsertIntegration({
        owner_kind: 'stream', owner_ref: 'strm_int_1', target_kind: 'bogus', status: 'delivered',
    }), /unsupported target_kind/);

    // Direct-model: unsupported status throws.
    assert.throws(() => integrations.upsertIntegration({
        owner_kind: 'stream', owner_ref: 'strm_int_1', target_kind: 'tips', status: 'bogus',
    }), /unsupported status/);

    const server = app.listen(0);
    try {
        // GET stream integrations: ensured set is empty initially. The
        // descriptor URLs may or may not be present depending on env-driven
        // OPENVIBE_*_URL values; the test only asserts on the new `ensured`
        // field which is unambiguously this slice's contract.
        const initial = await jsonRequest(server, { path: '/api/v1/streams/strm_int_1/integrations' });
        assert.strictEqual(initial.status, 200, 'initial GET 200');
        assert.deepStrictEqual(initial.body.ensured, [], 'no records ensured initially');

        // 404 for unknown stream.
        const missing = await jsonRequest(server, { path: '/api/v1/streams/strm_not_real/integrations' });
        assert.strictEqual(missing.status, 404, '404 for unknown stream');

        // Ensure tips on stream — billing URL points at a closed port so the
        // probe truthfully reports 'unavailable' or 'failed'.
        const ensureTips = await jsonRequest(server, {
            method: 'POST', path: '/api/v1/streams/strm_int_1/integrations/ensure',
        }, { target_kind: 'tips' });
        assert.strictEqual(ensureTips.status, 200, 'ensure tips 200');
        assert.strictEqual(ensureTips.body.integration.target_kind, 'tips');
        assert.ok(['unavailable', 'failed'].includes(ensureTips.body.integration.status),
            `tips ensure status truthful, got ${ensureTips.body.integration.status}`);
        assert.strictEqual(ensureTips.body.integration.owner_kind, 'stream');
        assert.strictEqual(ensureTips.body.integration.channel_slug, 'integrator');

        // Idempotent — second ensure for the same target returns the same id.
        const ensureTipsAgain = await jsonRequest(server, {
            method: 'POST', path: '/api/v1/streams/strm_int_1/integrations/ensure',
        }, { target_kind: 'tips' });
        assert.strictEqual(ensureTipsAgain.body.integration.id, ensureTips.body.integration.id, 'ensure is idempotent');

        // Bad target_kind → 400.
        const badEnsure = await jsonRequest(server, {
            method: 'POST', path: '/api/v1/streams/strm_int_1/integrations/ensure',
        }, { target_kind: 'totally_bogus' });
        assert.strictEqual(badEnsure.status, 400, 'bad target_kind → 400');

        // Ensure chat-room and audio-overlay too.
        await jsonRequest(server, {
            method: 'POST', path: '/api/v1/streams/strm_int_1/integrations/ensure',
        }, { target_kind: 'chat-room' });
        await jsonRequest(server, {
            method: 'POST', path: '/api/v1/streams/strm_int_1/integrations/ensure',
        }, { target_kind: 'audio-overlay' });

        // GET stream integrations again — ensured list should now have 3.
        const after = await jsonRequest(server, { path: '/api/v1/streams/strm_int_1/integrations' });
        assert.strictEqual(after.body.ensured.length, 3, '3 ensured records on stream');
        const kinds = after.body.ensured.map((r) => r.target_kind).sort();
        assert.deepStrictEqual(kinds, ['audio-overlay', 'chat-room', 'tips']);

        // Channel-scoped: GET + ensure vip.
        const channelInitial = await jsonRequest(server, { path: '/api/v1/channels/integrator/integrations' });
        assert.strictEqual(channelInitial.status, 200);
        assert.deepStrictEqual(channelInitial.body.ensured, []);

        const ensureVip = await jsonRequest(server, {
            method: 'POST', path: '/api/v1/channels/integrator/integrations/ensure',
        }, { target_kind: 'vip' });
        assert.strictEqual(ensureVip.body.integration.owner_kind, 'channel');
        assert.strictEqual(ensureVip.body.integration.target_kind, 'vip');
        assert.ok(['unavailable', 'failed'].includes(ensureVip.body.integration.status));

        // Unknown channel → 404.
        const noChannel = await jsonRequest(server, { path: '/api/v1/channels/no-such-channel/integrations' });
        assert.strictEqual(noChannel.status, 404);

        // Product status summary: services_configured shape is present and
        // counts reflect the four ensure calls above (all non-green because
        // downstream URLs point at closed ports).
        const status = await jsonRequest(server, { path: '/api/v1/integrations/product/status' });
        assert.strictEqual(status.status, 200);
        assert.ok(status.body.services_configured);
        const t = status.body.integrations.total;
        const totalNonGreen = (t.unavailable || 0) + (t.failed || 0);
        assert.ok(totalNonGreen >= 4, `total non-green >= 4, got ${totalNonGreen}`);
        assert.ok(status.body.integrations.by_target_kind.tips, 'tips bucket present');
        const tk = status.body.integrations.by_target_kind.tips;
        assert.strictEqual((tk.unavailable || 0) + (tk.failed || 0), 1);

        console.log('openvibe-live integrations test passed');
    } finally {
        server.close();
    }
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
