'use strict';

// Phase 16 — openvibe-billing VIP product workflow test.
// Asserts: VIP creator profile upsert idempotency, profile-scoped plan list,
// subscription resolution, and product/status creator counts.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const express = require('express');

process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-vip-product-')), 'billing.db');
process.env.OPENVIBE_EVENTS_URL = 'http://127.0.0.1:1';
process.env.PLATFORM_FEE_BPS = '500';

const config = require('../server/config');
const db = require('../server/db');
db.init(config.db.path);

const model = require('../server/model');
const ledger = require('../server/ledger');
const { buildVipRouter } = require('../server/routes');

function listen(app) {
    return new Promise((resolve) => {
        const server = http.createServer(app);
        server.listen(0, '127.0.0.1', () => resolve(server));
    });
}
function close(server) { return new Promise((r) => server.close(r)); }

function request(server, method, p, body) {
    return new Promise((resolve, reject) => {
        const port = server.address().port;
        const data = body ? JSON.stringify(body) : null;
        const req = http.request({
            host: '127.0.0.1', port, method, path: p,
            headers: Object.assign({
                'Content-Type': 'application/json',
                'X-OpenVibe-Service': 'openvibe-billing',
                'X-Internal-Key': process.env.OPENVIBE_INTERNAL_AUTH_KEY || '',
            }, data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        }, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                const txt = Buffer.concat(chunks).toString('utf8');
                let json = null; try { json = txt ? JSON.parse(txt) : null; } catch { json = { _raw: txt }; }
                resolve({ status: res.statusCode, body: json });
            });
        });
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

(async () => {
    // ── 1. profile upsert idempotent ──
    const profile = model.upsertVipCreatorProfile({
        owner_type: 'user', owner_id: 'u-vip-creator',
        display_name: 'VIP Creator',
        content_rating: 'general',
        requires_age_gate: 0,
        community_target: 'space:home',
        live_target: 'channel:home',
    });
    assert.ok(profile.id.startsWith('vcr_'), 'vip creator id prefix');
    const again = model.upsertVipCreatorProfile({
        owner_type: 'user', owner_id: 'u-vip-creator',
        description: 'updated',
    });
    assert.strictEqual(again.id, profile.id);
    assert.strictEqual(again.description, 'updated');

    // ── 2. plan + subscription via model (cheaper than going through full HTTP) ──
    const plan = model.createPlan({
        owner_type: 'user', owner_id: 'u-vip-creator',
        name: 'Basic', amount_minor: 500, currency: 'OVC',
        billing_interval: 'monthly', visibility: 'public',
    });
    assert.ok(plan && plan.id);

    // Fund subscriber.
    ledger.ensureWallet({ owner_type: 'user', owner_id: 'u-vip-sub', wallet_type: 'credits', currency: 'OVC' });
    ledger.postCreditPurchase({
        owner_type: 'user', owner_id: 'u-vip-sub', currency: 'OVC',
        amount_minor: 5000, provider: 'stub', external_ref: 'vip-product-fund-1',
        actor_type: 'service', actor_id: 'openvibe-billing',
        idempotency_key: 'vip-fund-1',
    });
    const sub = ledger.createSubscription({
        plan_id: plan.id,
        subscriber_actor_type: 'user', subscriber_actor_id: 'u-vip-sub',
        idempotency_key: 'vip-sub-1',
        actor_type: 'user', actor_id: 'u-vip-sub',
    });
    assert.ok(sub && sub.subscription && sub.subscription.id);

    // ── 3. HTTP routes ──
    const app = express();
    // Stub service middleware so policy treats us as a trusted internal caller.
    app.use((req, _res, next) => { req.serviceActor = 'test-suite'; next(); });
    const router = buildVipRouter({
        eventBus: { publishVipEvent: () => {}, publishBillingEvent: () => {} },
    });
    app.use('/api/vip', router);
    const server = await listen(app);

    try {
        const list = await request(server, 'GET', '/api/vip/creators', null);
        assert.strictEqual(list.status, 200);
        assert.ok(list.body.items.find(p => p.id === profile.id));

        const get = await request(server, 'GET', '/api/vip/creators/user/u-vip-creator', null);
        assert.strictEqual(get.status, 200);
        assert.strictEqual(get.body.profile.id, profile.id);

        const plansList = await request(server, 'GET', '/api/vip/creators/user/u-vip-creator/plans', null);
        assert.strictEqual(plansList.status, 200);
        assert.ok(plansList.body.items.find(p => p.id === plan.id));

        const subsList = await request(server, 'GET', '/api/vip/creators/user/u-vip-creator/subscriptions', null);
        assert.strictEqual(subsList.status, 200);
        assert.ok(subsList.body.items.find(s => s.id === sub.subscription.id));

        const ent = await request(server, 'GET', '/api/vip/creators/user/u-vip-creator/entitlements', null);
        assert.strictEqual(ent.status, 200);
        assert.ok(Array.isArray(ent.body.items));
        assert.ok(ent.body.items.length >= 1);

        const resolve = await request(server, 'POST', '/api/vip/resolve-entitlements', {
            subscriber_actor_type: 'user', subscriber_actor_id: 'u-vip-sub',
        });
        assert.strictEqual(resolve.status, 200);
        assert.ok(resolve.body.items.find(t =>
            t.target_type === 'user' && t.target_id === 'u-vip-creator' && t.subscriptions.length >= 1));

        const status = await request(server, 'GET', '/api/vip/product/status', null);
        assert.strictEqual(status.status, 200);
        assert.strictEqual(status.body.product, 'vip');
        assert.ok(status.body.creators);
        assert.ok(status.body.creators.count >= 1);
    } finally {
        await close(server);
    }

    console.log('openvibe-billing vip-product OK');
})().catch((err) => { console.error(err); process.exit(1); });
