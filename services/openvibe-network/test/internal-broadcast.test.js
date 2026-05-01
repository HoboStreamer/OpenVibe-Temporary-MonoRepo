'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-network-broadcast-'));

function request({ port, method = 'GET', requestPath = '/', headers, body }) {
    return new Promise((resolve, reject) => {
        const payload = body == null ? null : JSON.stringify(body);
        const req = http.request({
            host: '127.0.0.1',
            port,
            path: requestPath,
            method,
            agent: false,
            headers: Object.assign({ host: 'openvibe.network', connection: 'close' }, headers || {}, payload ? {
                'content-type': 'application/json',
                'content-length': Buffer.byteLength(payload),
            } : {}),
        }, (res) => {
            let raw = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => { raw += chunk; });
            res.on('end', () => {
                let parsed = raw;
                try { parsed = raw ? JSON.parse(raw) : null; } catch {}
                resolve({ status: res.statusCode, body: parsed });
            });
        });
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

async function main() {
    process.env.NODE_ENV = 'development';
    process.env.DB_PATH = path.join(tmp, 'network.db');
    process.env.OPENVIBE_PRIVATE_KEY = path.join(tmp, 'keys', 'openvibe-private.pem');
    process.env.OPENVIBE_PUBLIC_KEY = path.join(tmp, 'keys', 'openvibe-public.pem');
    process.env.OPENVIBE_NETWORK_URL = 'http://openvibe.network';
    process.env.OPENVIBE_AUTH_URL = 'http://auth.openvibe.network';
    process.env.OPENVIBE_API_URL = 'http://api.openvibe.network';
    process.env.OPENVIBE_MY_URL = 'http://my.openvibe.network';
    process.env.OPENVIBE_THEMES_URL = 'http://themes.openvibe.network';
    process.env.OPENVIBE_ADMIN_URL = 'http://admin.openvibe.network';
    process.env.OPENVIBE_EVENTS_URL = 'http://127.0.0.1:1';
    process.env.OPENVIBE_PERSISTENCE_MODE = 'sqlite';
    process.env.OPENVIBE_OPENVIBE_NETWORK_PERSISTENCE_MODE = 'sqlite';
    process.env.OPENVIBE_DATABASE_URL = '';
    process.env.OPENVIBE_STAGING_DATABASE_URL = '';
    process.env.OPENVIBE_OPENVIBE_NETWORK_DATABASE_URL = '';
    process.env.HOBO_TOOLS_URL = '';
    process.env.HOBO_TOOLS_PUBLIC_KEY = '';
    process.env.INTERNAL_API_KEY = 'test-internal';

    const { buildApp } = require('../server/index');
    const staff = require('../server/api/staff');
    const { app } = buildApp();
    const server = app.listen(0, '127.0.0.1');

    try {
        await new Promise((resolve) => server.once('listening', resolve));
        const response = await request({
            port: server.address().port,
            method: 'POST',
            requestPath: '/api/v1/internal/notifications/broadcast',
            headers: {
                'x-internal-key': 'test-internal',
                'x-openvibe-service': 'openvibe-workers',
            },
            body: {
                title: 'Maintenance tonight',
                audience: 'all',
                body: 'Heads up from the worker lane.',
            },
        });

        assert.strictEqual(response.status, 202);
        assert.strictEqual(response.body.ok, true);
        assert.strictEqual(response.body.delivery_mode, 'audit-recorded');
        assert.strictEqual(response.body.requested_by_service, 'openvibe-workers');

        const audit = staff.recentAudit({ limit: 5 });
        assert.ok(audit.some((item) => item.action === 'internal.notifications.broadcast'));
    } finally {
        server.closeAllConnections && server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
        fs.rmSync(tmp, { recursive: true, force: true });
    }

    console.log('openvibe-network internal broadcast test OK');
}

main().catch((error) => {
    console.error(error && error.stack || error);
    fs.rmSync(tmp, { recursive: true, force: true });
    process.exit(1);
});
