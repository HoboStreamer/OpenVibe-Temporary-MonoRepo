'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-billing-reconcile-'));
process.env.DB_PATH = path.join(tmp, 'billing.db');
process.env.OPENVIBE_EVENTS_URL = 'http://127.0.0.1:1';
process.env.INTERNAL_API_KEY = 'test-internal';

const { buildApp } = require('../server/index');
const db = require('../server/db');
const ledger = require('../server/ledger');
const model = require('../server/model');

function listen(server) {
    return new Promise((resolve) => {
        const instance = server.listen(0, '127.0.0.1', () => resolve(instance));
    });
}

function close(server) {
    return new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
    });
}

function request(server, method, requestPath, body, headers) {
    return new Promise((resolve, reject) => {
        const payload = body == null ? null : JSON.stringify(body);
        const req = http.request({
            host: '127.0.0.1',
            port: server.address().port,
            path: requestPath,
            method,
            headers: Object.assign({}, headers || {}, payload ? {
                'content-type': 'application/json',
                'content-length': Buffer.byteLength(payload),
            } : {}),
        }, (res) => {
            let raw = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => { raw += chunk; });
            res.on('end', () => resolve({ status: res.statusCode, body: raw ? JSON.parse(raw) : null }));
        });
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

async function main() {
    const { app } = buildApp();
    const server = await listen(app);
    try {
        const wallet = ledger.ensureWallet({ owner_type: 'user', owner_id: '42', wallet_type: 'credits', currency: 'OVC' });
        ledger.postCreditPurchase({
            owner_type: 'user', owner_id: '42', currency: 'OVC', amount_minor: 500,
            provider: 'stub', actor_type: 'service', actor_id: 'openvibe-billing', idempotency_key: 'billing-reconcile-purchase',
        });

        db.get().prepare('UPDATE billing_wallets SET balance_minor = ? WHERE id = ?').run(999, wallet.id);

        const response = await request(server, 'POST', '/api/billing/internal/reconcile', {
            repair: true,
            wallet_type: 'credits',
        }, {
            'x-internal-key': 'test-internal',
            'x-openvibe-service': 'openvibe-workers',
        });

        assert.strictEqual(response.status, 200);
        assert.strictEqual(response.body.ok, true);
        assert.strictEqual(response.body.requested_by_service, 'openvibe-workers');
        assert.ok(response.body.mismatch_count >= 1);
        assert.ok(response.body.repaired_count >= 1);

        const recomputed = model.recomputeBalanceFromLedger(wallet.id);
        const snapshot = model.getSnapshot(wallet.id);
        assert.strictEqual(snapshot.balance_minor, recomputed.balance);
    } finally {
        await close(server);
        fs.rmSync(tmp, { recursive: true, force: true });
    }

    console.log('openvibe-billing internal reconcile test OK');
}

main().catch((error) => {
    console.error(error && error.stack || error);
    fs.rmSync(tmp, { recursive: true, force: true });
    process.exit(1);
});
