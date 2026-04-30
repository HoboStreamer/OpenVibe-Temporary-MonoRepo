'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createProcessorCatalog, describeProcessorCatalog } = require('../server/processors');

async function withFetch(mockFetch, fn) {
    const originalFetch = global.fetch;
    global.fetch = mockFetch;
    try {
        await fn();
    } finally {
        if (originalFetch === undefined) {
            delete global.fetch;
        } else {
            global.fetch = originalFetch;
        }
    }
}

async function main() {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-workers-processors-'));
    const bundleDir = path.join(tmp, 'bundle');
    const auditDir = path.join(bundleDir, 'audit');
    fs.mkdirSync(auditDir, { recursive: true });
    const cutoverPath = path.join(tmp, 'cutover-report.json');

    fs.writeFileSync(path.join(auditDir, 'validation-summary.json'), JSON.stringify({ ok: true, checks: [{}], mismatches: [], duplicates: [], missing_refs: [] }), 'utf8');
    fs.writeFileSync(path.join(auditDir, 'readiness-report.json'), JSON.stringify({ summary: { green: 3, yellow: 0, red: 0 }, manual_actions: [] }), 'utf8');
    fs.writeFileSync(cutoverPath, JSON.stringify({ gate: 'green', summary: { green: 2, yellow: 0, red: 0 }, artifacts: { validation_summary: true } }), 'utf8');

    const config = {
        serviceId: 'openvibe-workers',
        internalKey: 'test-internal',
        requestTimeoutMs: 250,
        mediaUrl: '',
        contentUrl: '',
        billingUrl: '',
        networkUrl: '',
        migrationBundleDir: bundleDir,
        migrationCutoverReportPath: cutoverPath,
    };

    const catalog = createProcessorCatalog(config);
    const described = describeProcessorCatalog(config);

    assert.strictEqual(described['clips.materialize'].available, false);
    assert.strictEqual(described['clips.materialize'].dependency.status, 'missing-config');
    assert.strictEqual(described['migration.bundle-verify'].available, true);

    const bundleResult = await catalog['migration.bundle-verify'].run({ data: {} });
    assert.strictEqual(bundleResult.ok, true);
    assert.strictEqual(bundleResult.gate, 'green');
    assert.strictEqual(bundleResult.validation.ok, true);
    assert.strictEqual(bundleResult.artifacts.validation_summary.exists, true);

    const requests = [];
    await withFetch(async (url, options) => {
        const body = JSON.parse(options.body || '{}');
        requests.push({ url, body, headers: options.headers || {} });
        if (url.endsWith('/api/v1/internal/search/reindex')) {
            return new Response(JSON.stringify({ ok: true, queued: true, job: { id: 'job-search-1' } }), {
                status: 202,
                headers: { 'content-type': 'application/json' },
            });
        }
        if (url.endsWith('/api/billing/internal/reconcile')) {
            return new Response(JSON.stringify({ ok: true, mismatch_count: 0, repaired_count: 0, wallet_count: 0 }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            });
        }
        if (url.endsWith('/api/v1/internal/notifications/broadcast')) {
            return new Response(JSON.stringify({ ok: true, queued: true, broadcast: body }), {
                status: 202,
                headers: { 'content-type': 'application/json' },
            });
        }
        throw new Error(`unexpected worker processor URL: ${url}`);
    }, async () => {
        const httpCatalog = createProcessorCatalog(Object.assign({}, config, {
            contentUrl: 'http://127.0.0.1:5500',
            billingUrl: 'http://127.0.0.1:5001',
            networkUrl: 'http://127.0.0.1:4100',
        }));

        const searchResult = await httpCatalog['search.reindex'].run({
            data: {
                surface: 'codes',
                sourceId: 'source-17',
                itemId: 'item-42',
                scheduledAt: '2026-04-30T12:00:00.000Z',
                correlationId: 'corr-1',
                payload: { depth: 'full' },
            },
        });
        assert.strictEqual(searchResult.ok, true);

        const searchRequest = requests.find((request) => request.url.endsWith('/api/v1/internal/search/reindex'));
        assert(searchRequest, 'search.reindex should have made an HTTP request');
        assert.strictEqual(searchRequest.body.job_type, 'search.reindex');
        assert.strictEqual(searchRequest.body.source_id, 'source-17');
        assert.strictEqual(searchRequest.body.item_id, 'item-42');
        assert.strictEqual(searchRequest.body.scheduled_at, '2026-04-30T12:00:00.000Z');
        assert.strictEqual(searchRequest.body.payload.reason, 'worker.search.reindex');
        assert.strictEqual(searchRequest.body.payload.correlation_id, 'corr-1');

        const billingResult = await httpCatalog['billing.reconcile'].run({
            data: {
                ownerType: 'user',
                ownerId: 'user-9',
                repair: 'false',
                limit: '9999',
            },
        });
        assert.strictEqual(billingResult.ok, true);

        const billingRequest = requests.find((request) => request.url.endsWith('/api/billing/internal/reconcile'));
        assert(billingRequest, 'billing.reconcile should have made an HTTP request');
        assert.strictEqual(billingRequest.body.owner_type, 'user');
        assert.strictEqual(billingRequest.body.owner_id, 'user-9');
        assert.strictEqual(billingRequest.body.repair, false);
        assert.strictEqual(billingRequest.body.limit, 500);

        const notificationResult = await httpCatalog['notifications.broadcast'].run({
            data: {
                subject: 'Heads up',
                message: 'Workers are now using normalized payloads.',
            },
        });
        assert.strictEqual(notificationResult.ok, true);

        const notificationRequest = requests.find((request) => request.url.endsWith('/api/v1/internal/notifications/broadcast'));
        assert(notificationRequest, 'notifications.broadcast should have made an HTTP request');
        assert.strictEqual(notificationRequest.body.title, 'Heads up');
        assert.strictEqual(notificationRequest.body.body, 'Workers are now using normalized payloads.');
        assert.strictEqual(notificationRequest.body.audience, 'all');
        assert.strictEqual(notificationRequest.body.source, 'openvibe-workers');
    });

    fs.rmSync(tmp, { recursive: true, force: true });
    console.log('openvibe-workers processors test OK');
}

main().catch((error) => {
    console.error(error && error.stack || error);
    process.exit(1);
});
