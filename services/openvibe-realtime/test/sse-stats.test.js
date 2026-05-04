'use strict';

// Tests for:
//   GET  /api/v1/realtime/stats
//   POST /internal/publish (routed to SSE fan-out)

const assert = require('assert');
const http   = require('http');

process.env.OPENVIBE_URL_MODE           = 'local';
process.env.OPENVIBE_LOCAL_HOST_SUFFIX  = 'localhost';
process.env.OPENVIBE_LOCAL_PROTOCOL     = 'http';
process.env.INTERNAL_API_KEY            = 'test-internal-key';

const { buildApp } = require('../server/index');

function httpRequest(options, body) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (c) => { data += c; });
            res.on('end', () => {
                let json;
                try { json = JSON.parse(data); } catch { json = { _raw: data }; }
                resolve({ status: res.statusCode, headers: res.headers, body: json });
            });
        });
        req.on('error', reject);
        if (body) {
            const b = JSON.stringify(body);
            req.setHeader('content-type', 'application/json');
            req.setHeader('content-length', Buffer.byteLength(b));
            req.write(b);
        }
        req.end();
    });
}

async function run() {
    const { app } = buildApp();

    // Use a random port so the test can run alongside the real service
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const base = { hostname: '127.0.0.1', port };

    try {
        // ── 1. GET /api/v1/realtime/stats ────────────────────────────────────
        {
            const res = await httpRequest({ ...base, path: '/api/v1/realtime/stats', method: 'GET' });
            assert.strictEqual(res.status, 200, `stats should return 200, got ${res.status}`);
            const b = res.body;
            assert.ok(b.connections, 'stats has connections');
            assert.ok(typeof b.connections.total === 'number', 'connections.total is a number');
            assert.ok(b.bridge, 'stats has bridge');
            assert.ok(b.redis, 'stats has redis');
            console.log('  sse-stats: GET /api/v1/realtime/stats: ok');
        }

        // ── 2. POST /internal/publish — missing internal key → 401/403 ───────
        {
            const res = await httpRequest({
                ...base, path: '/internal/publish', method: 'POST',
            }, { event: 'test', payload: {} });
            assert.ok([401, 403].includes(res.status), `expected 401/403 without key, got ${res.status}`);
            console.log('  sse-stats: /internal/publish requires internal key: ok');
        }

        // ── 3. POST /internal/publish — missing event → 400 ─────────────────
        {
            const res = await httpRequest({
                ...base, path: '/internal/publish', method: 'POST',
                headers: { 'x-internal-key': 'test-internal-key', 'content-type': 'application/json' },
            }, {});
            assert.strictEqual(res.status, 400, `expected 400 for missing event, got ${res.status}`);
            console.log('  sse-stats: /internal/publish 400 for missing event: ok');
        }

        // ── 4. POST /internal/publish — valid request → 200 ─────────────────
        {
            const res = await httpRequest({
                ...base, path: '/internal/publish', method: 'POST',
                headers: { 'x-internal-key': 'test-internal-key', 'content-type': 'application/json' },
            }, { event: 'stream.started', room: 'channel-abc', payload: { stream_id: 'x' }, topics: ['stream.events'] });
            assert.strictEqual(res.status, 200, `expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
            assert.ok(res.body.ok === true, 'response has ok=true');
            assert.ok(typeof res.body.socket_targets === 'number', 'socket_targets is a number');
            assert.ok(typeof res.body.sse_clients   === 'number', 'sse_clients is a number');
            console.log('  sse-stats: POST /internal/publish valid: ok');
        }

    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
}

run().then(() => {
    console.log('sse-stats: ok');
}).catch((err) => {
    console.error('sse-stats FAILED:', err.message || err);
    process.exit(1);
});
