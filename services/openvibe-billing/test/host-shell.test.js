'use strict';

const assert = require('assert');
const http = require('http');

const { renderTipsShell, renderVipShell, detectBillingSurface } = require('../server/host-shell');

function listen(app) {
    return new Promise((resolve) => {
        const server = http.createServer(app);
        server.listen(0, '127.0.0.1', () => resolve(server));
    });
}

function close(server) {
    return new Promise((resolve) => server.close(resolve));
}

function fetch(server, host, requestPath) {
    return new Promise((resolve, reject) => {
        const port = server.address().port;
        const req = http.request({
            host: '127.0.0.1', port, method: 'GET', path: requestPath,
            headers: { Host: host },
        }, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
        });
        req.on('error', reject);
        req.end();
    });
}

async function main() {
    assert.strictEqual(detectBillingSurface('openvibe.tips'), 'tips');
    assert.strictEqual(detectBillingSurface('openvibe.tips.localhost'), 'tips');
    assert.strictEqual(detectBillingSurface('openvibe.vip:5001'), 'vip');
    assert.strictEqual(detectBillingSurface('billing.openvibe.network'), 'billing');

    assert.ok(renderTipsShell().includes('OpenVibe Tips'));
    assert.ok(renderTipsShell().includes('noindex'));
    assert.ok(renderVipShell().includes('OpenVibe VIP'));
    assert.ok(renderVipShell().includes('noindex'));

    const { attachBillingHostShell } = require('../server/host-shell');
    const express = require('express');
    const app = express();
    attachBillingHostShell(app);
    app.get('/', (_req, res) => res.send('default billing'));

    const server = await listen(app);
    try {
        const tips = await fetch(server, 'openvibe.tips.localhost', '/');
        assert.strictEqual(tips.status, 200);
        assert.ok(tips.body.includes('OpenVibe Tips'));
        assert.strictEqual(tips.headers['x-openvibe-surface'], 'tips');

        const vip = await fetch(server, 'openvibe.vip.localhost', '/');
        assert.strictEqual(vip.status, 200);
        assert.ok(vip.body.includes('OpenVibe VIP'));

        const def = await fetch(server, 'billing.openvibe.network.localhost', '/');
        assert.strictEqual(def.status, 200);
        assert.strictEqual(def.body, 'default billing');
    } finally {
        await close(server);
    }

    console.log('openvibe-billing host-shell tests OK');
}

main().catch((err) => { console.error(err); process.exit(1); });
