'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-content-api-'));
process.env.OPENVIBE_PERSISTENCE_MODE = 'sqlite';
process.env.OPENVIBE_CONTENT_DB_PATH = path.join(tmpDir, 'content-api.db');

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

        const statusResponse = await request(server, 'openvibe.codes.localhost', '/api/v1/content/status');
        assert.strictEqual(statusResponse.status, 200);
        const statusBody = JSON.parse(statusResponse.body);
        assert.strictEqual(statusBody.persistence.adapter_status, 'local-bootstrap');
        assert.strictEqual(statusBody.counts.sources, 1);
        assert.strictEqual(statusBody.counts.items, 1);
        assert.strictEqual(statusBody.counts.jobs, 1);
    } finally {
        await close(server);
    }

    console.log('openvibe-content API tests OK');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
