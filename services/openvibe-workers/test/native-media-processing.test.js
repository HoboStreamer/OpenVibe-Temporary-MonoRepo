'use strict';

// openvibe-workers — native media processing backend smoke. The real
// media runtime is heavy to fully bootstrap (storage, events, db, etc),
// so this test exercises the catalog wiring and payload normalization,
// then asserts the native definition correctly rejects missing media_id
// without attempting to spin up the full media runtime.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createProcessorCatalog, describeProcessorCatalog } = require('../server/processors');

async function main() {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-workers-native-media-'));
    const baseConfig = {
        serviceId: 'openvibe-workers',
        internalKey: 'test-internal',
        requestTimeoutMs: 250,
        workerBackendMode: 'native',
        mediaUrl: '',
        contentUrl: '',
        billingUrl: '',
        networkUrl: '',
        migrationBundleDir: path.join(tmp, 'bundle'),
        migrationCutoverReportPath: path.join(tmp, 'cutover.json'),
    };

    const described = describeProcessorCatalog(baseConfig);
    assert.strictEqual(described['media.thumbnail'].backend, 'native');
    assert.strictEqual(described['media.thumbnail'].dependency.service, 'openvibe-media');
    assert.strictEqual(described['media.thumbnail'].dependency.backend, 'processing-runner');
    assert.strictEqual(described['media.metadata'].backend, 'native');
    assert.strictEqual(described['media.metadata'].dependency.service, 'openvibe-media');
    assert.strictEqual(described['media.thumbnail'].dependency.fallback_backend, 'http');

    // auto mode prefers native because native is always-available
    const auto = describeProcessorCatalog(Object.assign({}, baseConfig, { workerBackendMode: 'auto' }));
    assert.strictEqual(auto['media.thumbnail'].backend, 'native');

    // http mode degrades to http fallback when configured
    const httpDescribed = describeProcessorCatalog(Object.assign({}, baseConfig, {
        workerBackendMode: 'http',
        mediaUrl: 'http://127.0.0.1:4500',
    }));
    assert.strictEqual(httpDescribed['media.thumbnail'].backend, 'http');
    assert.strictEqual(httpDescribed['media.thumbnail'].dependency.url, 'http://127.0.0.1:4500/api/v1/internal/processing/run');

    // Native invocation truthfully rejects missing media_id without
    // requiring the full media runtime to be bootstrapped.
    const catalog = createProcessorCatalog(baseConfig);
    const missing = await catalog['media.thumbnail'].run({ data: {} });
    assert.strictEqual(missing.ok, false);
    assert.strictEqual(missing.error, 'media_id required');

    fs.rmSync(tmp, { recursive: true, force: true });
    console.log('openvibe-workers native-media-processing test OK');
}

main().catch((error) => {
    console.error(error && error.stack || error);
    process.exit(1);
});
