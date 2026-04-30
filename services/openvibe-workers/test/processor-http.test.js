'use strict';

const assert = require('assert');

const {
    dependencyFromHttp,
    postProcessorJson,
} = require('../server/processor-http');

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
    const dependency = dependencyFromHttp('content', 'http://127.0.0.1:5500', '/api/v1/internal/search/reindex', {
        expects: 'queued search reindex job',
    });
    assert.strictEqual(dependency.url, 'http://127.0.0.1:5500/api/v1/internal/search/reindex');
    assert.strictEqual(dependency.expects, 'queued search reindex job');
    assert.strictEqual(
        dependencyFromHttp('content', '', '/api/v1/internal/search/reindex').status,
        'missing-config',
    );

    await withFetch(async (url, options) => {
        assert.strictEqual(url, dependency.url);
        assert.strictEqual(options.method, 'POST');
        assert.strictEqual(options.headers['x-internal-key'], 'worker-test-key');
        assert.deepStrictEqual(JSON.parse(options.body || '{}'), { source_id: 'source-1' });
        return new Response(JSON.stringify({ ok: true, queued: true, job: { id: 'job-1' } }), {
            status: 202,
            headers: { 'content-type': 'application/json' },
        });
    }, async () => {
        const result = await postProcessorJson({
            name: 'search.reindex',
            dependency,
        }, {
            source_id: 'source-1',
        }, {
            internalKey: 'worker-test-key',
            serviceId: 'openvibe-workers',
            requestTimeoutMs: 250,
        }, {
            validate(body) {
                return body.queued === true ? null : 'expected queued=true';
            },
        });
        assert.strictEqual(result.ok, true);
        assert.strictEqual(result.queued, true);
        assert.strictEqual(result.request.service, 'content');
        assert.strictEqual(result.request.endpoint_path, '/api/v1/internal/search/reindex');
        assert.deepStrictEqual(result.request.payload_keys, ['source_id']);
    });

    await withFetch(async () => new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
    }), async () => {
        const result = await postProcessorJson({
            name: 'search.reindex',
            dependency,
        }, {}, {
            internalKey: 'worker-test-key',
            serviceId: 'openvibe-workers',
            requestTimeoutMs: 250,
        }, {
            validate(body) {
                return body.queued === true ? null : 'expected queued=true';
            },
        });
        assert.strictEqual(result.ok, false);
        assert.strictEqual(result.error, 'invalid_response');
        assert.strictEqual(result.reason, 'expected queued=true');
    });

    console.log('openvibe-workers processor-http test OK');
}

main().catch((error) => {
    console.error(error && error.stack || error);
    process.exit(1);
});