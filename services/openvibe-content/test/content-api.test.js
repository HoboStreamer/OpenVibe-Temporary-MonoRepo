'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-content-api-'));
process.env.OPENVIBE_PERSISTENCE_MODE = 'sqlite';
process.env.OPENVIBE_CONTENT_DB_PATH = path.join(tmpDir, 'content-api.db');
process.env.INTERNAL_API_KEY = 'test-internal';

const { buildApp } = require('../server/index');

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

function request(server, host, requestPath, options) {
    const opts = options || {};
    return new Promise((resolve, reject) => {
        const req = http.request({
            host: '127.0.0.1',
            port: server.address().port,
            path: requestPath,
            method: opts.method || 'GET',
            headers: Object.assign({ Host: host }, opts.headers || {}),
        }, (res) => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
        });
        req.on('error', reject);
        if (opts.body) req.write(opts.body);
        req.end();
    });
}

async function main() {
    const { app } = buildApp();
    const server = await listen(app);

    try {
        const sourceResponse = await request(server, 'openvibe.codes.localhost', '/api/v1/content/sources', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                surface: 'codes',
                source_key: 'native-docs',
                display_name: 'Native docs',
                origin_url: 'https://openvibe.codes/docs',
                kind: 'manual',
                metadata: { owner: 'platform' },
            }),
        });
        assert.strictEqual(sourceResponse.status, 201);
        const sourceBody = JSON.parse(sourceResponse.body);
        assert.strictEqual(sourceBody.source.surface, 'codes');

        const itemResponse = await request(server, 'openvibe.codes.localhost', '/api/v1/content/items', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                surface: 'codes',
                source_id: sourceBody.source.id,
                slug: 'content-db-foundation',
                title: 'Content DB foundation',
                summary: 'SQLite + Postgres-backed content records for the runtime parity pass.',
                body_md: '# Content DB foundation',
                state: 'published',
                indexable: true,
                metadata: { tags: ['runtime', 'content'] },
            }),
        });
        assert.strictEqual(itemResponse.status, 201);
        const itemBody = JSON.parse(itemResponse.body);
        assert.strictEqual(itemBody.item.slug, 'content-db-foundation');
        assert.strictEqual(itemBody.item.indexable, true);

        const listResponse = await request(server, 'openvibe.codes.localhost', '/api/v1/content/items?surface=codes');
        assert.strictEqual(listResponse.status, 200);
        const listBody = JSON.parse(listResponse.body);
        assert.ok(listBody.items.some((item) => item.slug === 'content-db-foundation'));

        const singleResponse = await request(server, 'openvibe.codes.localhost', `/api/v1/content/items/${encodeURIComponent(itemBody.item.id)}`);
        assert.strictEqual(singleResponse.status, 200);
        const singleBody = JSON.parse(singleResponse.body);
        assert.strictEqual(singleBody.item.title, 'Content DB foundation');

        const searchResponse = await request(server, 'openvibe.codes.localhost', '/api/v1/content/search?q=Postgres');
        assert.strictEqual(searchResponse.status, 200);
        const searchBody = JSON.parse(searchResponse.body);
        assert.ok(searchBody.items.some((item) => item.id === itemBody.item.id));

        const jobResponse = await request(server, 'openvibe.codes.localhost', '/api/v1/content/jobs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                job_type: 'content.publish',
                surface: 'codes',
                item_id: itemBody.item.id,
                payload: { target: 'feed' },
            }),
        });
        assert.strictEqual(jobResponse.status, 201);
        const jobBody = JSON.parse(jobResponse.body);
        assert.strictEqual(jobBody.job.job_type, 'content.publish');

        const reindexResponse = await request(server, 'openvibe.codes.localhost', '/api/v1/internal/search/reindex', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-internal-key': 'test-internal',
                'x-openvibe-service': 'openvibe-workers',
            },
            body: JSON.stringify({
                surface: 'codes',
                item_id: itemBody.item.id,
                reason: 'worker.search.reindex',
            }),
        });
        assert.strictEqual(reindexResponse.status, 202);
        const reindexBody = JSON.parse(reindexResponse.body);
        assert.strictEqual(reindexBody.queued, true);
        assert.strictEqual(reindexBody.requested_by_service, 'openvibe-workers');
        assert.strictEqual(reindexBody.job.job_type, 'search.reindex');

        const statusResponse = await request(server, 'openvibe.codes.localhost', '/api/v1/content/status');
        assert.strictEqual(statusResponse.status, 200);
        const statusBody = JSON.parse(statusResponse.body);
        assert.strictEqual(statusBody.persistence.adapter_status, 'local-bootstrap');
        assert.strictEqual(statusBody.counts.sources, 1);
        assert.strictEqual(statusBody.counts.items, 1);
        assert.strictEqual(statusBody.counts.jobs, 2);

        // ── Phase 16: review decisions + distribution audit ────────
        const reviewForbidden = await request(server, 'openvibe.codes.localhost', `/api/v1/content/items/${encodeURIComponent(itemBody.item.id)}/reviews`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ decision: 'approve' }),
        });
        assert.strictEqual(reviewForbidden.status, 403, 'reviews require service actor');

        const draftItemResponse = await request(server, 'openvibe.codes.localhost', '/api/v1/content/items', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                surface: 'codes',
                slug: 'draft-needing-review',
                title: 'Needs review',
                summary: 'Pending editorial decision',
                state: 'draft',
            }),
        });
        const draftId = JSON.parse(draftItemResponse.body).item.id;

        const reviewResponse = await request(server, 'openvibe.codes.localhost', `/api/v1/content/items/${encodeURIComponent(draftId)}/reviews`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-internal-key': 'test-internal',
                'x-openvibe-service': 'openvibe-workers',
            },
            body: JSON.stringify({ decision: 'publish', notes: 'looks good' }),
        });
        assert.strictEqual(reviewResponse.status, 201);
        const reviewBody = JSON.parse(reviewResponse.body);
        assert.strictEqual(reviewBody.decision.decision, 'publish');
        assert.strictEqual(reviewBody.decision.from_state, 'draft');
        assert.strictEqual(reviewBody.decision.to_state, 'published');

        const promotedItem = await request(server, 'openvibe.codes.localhost', `/api/v1/content/items/${encodeURIComponent(draftId)}`);
        const promotedBody = JSON.parse(promotedItem.body);
        assert.strictEqual(promotedBody.item.state, 'published', 'review decision should promote item');
        assert.ok(promotedBody.item.published_at, 'published_at should be stamped');

        const reviewListResponse = await request(server, 'openvibe.codes.localhost', `/api/v1/content/items/${encodeURIComponent(draftId)}/reviews`);
        const reviewListBody = JSON.parse(reviewListResponse.body);
        assert.strictEqual(reviewListBody.items.length, 1);

        const distributionResponse = await request(server, 'openvibe.codes.localhost', `/api/v1/content/items/${encodeURIComponent(draftId)}/distribution`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-internal-key': 'test-internal',
                'x-openvibe-service': 'openvibe-workers',
            },
            body: JSON.stringify({ channel: 'rss', outcome: 'delivered', metadata: { feed: 'codes/main' } }),
        });
        assert.strictEqual(distributionResponse.status, 201);
        const distributionBody = JSON.parse(distributionResponse.body);
        assert.strictEqual(distributionBody.entry.outcome, 'delivered');
        assert.strictEqual(distributionBody.entry.surface, 'codes');

        const productStatusResponse = await request(server, 'openvibe.codes.localhost', '/api/v1/content/product/status');
        assert.strictEqual(productStatusResponse.status, 200);
        const productStatus = JSON.parse(productStatusResponse.body);
        assert.strictEqual(productStatus.product, 'content');
        assert.ok(productStatus.items_by_state.published >= 2);
        assert.strictEqual(productStatus.decisions_by_type.publish, 1);
        assert.strictEqual(productStatus.distribution_by_outcome.delivered, 1);
        assert.strictEqual(productStatus.counts.review_decisions, 1);
        assert.strictEqual(productStatus.counts.distribution_audit, 1);
    } finally {
        await close(server);
    }

    console.log('openvibe-content API tests OK');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
