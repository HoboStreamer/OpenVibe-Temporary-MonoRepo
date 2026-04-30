'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createProcessorCatalog, describeProcessorCatalog } = require('../server/processors');

async function main() {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-workers-native-analytics-'));
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
    assert.strictEqual(described['analytics.audio-features'].backend, 'native');
    assert.strictEqual(described['analytics.audio-features'].dependency.type, 'native-deterministic');
    assert.strictEqual(described['analytics.motion-detect'].backend, 'native');

    const catalog = createProcessorCatalog(baseConfig);

    // No media id → not ok, but still produces structured response (truthful).
    const empty = await catalog['analytics.audio-features'].run({ data: {} });
    assert.strictEqual(empty.ok, false);
    assert.strictEqual(empty.media_resolved, false);
    assert.strictEqual(empty.backend, 'native-analytics-audio-features');
    assert(Array.isArray(empty.segments));

    // With duration hint we get deterministic segment counts.
    const audioResult = await catalog['analytics.audio-features'].run({
        data: { media_id: 'm-test-1', duration_seconds: 60, segment_count: 4 },
    });
    assert.strictEqual(audioResult.segment_count, 4);
    assert.strictEqual(audioResult.segments.length, 4);
    assert.strictEqual(audioResult.duration_seconds, 60);
    assert(audioResult.summary && audioResult.summary.average_loudness !== undefined);

    // Determinism check
    const audioResult2 = await catalog['analytics.audio-features'].run({
        data: { media_id: 'm-test-1', duration_seconds: 60, segment_count: 4 },
    });
    assert.deepStrictEqual(audioResult.segments, audioResult2.segments);

    const motionResult = await catalog['analytics.motion-detect'].run({
        data: { media_id: 'm-test-2', duration_seconds: 30, sample_count: 6, motion_threshold: 0.5 },
    });
    assert.strictEqual(motionResult.sample_count, 6);
    assert.strictEqual(motionResult.samples.length, 6);
    assert(Array.isArray(motionResult.motion_windows));

    fs.rmSync(tmp, { recursive: true, force: true });
    console.log('openvibe-workers native-analytics test OK');
}

main().catch((error) => {
    console.error(error && error.stack || error);
    process.exit(1);
});
