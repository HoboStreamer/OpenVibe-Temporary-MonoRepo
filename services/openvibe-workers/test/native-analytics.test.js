'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createProcessorCatalog, describeProcessorCatalog } = require('../server/processors');

async function main() {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-workers-native-analytics-'));
    const originalNodeEnv = process.env.NODE_ENV;
    const originalOpenvibeEnv = process.env.OPENVIBE_ENV;
    const originalDbPath = process.env.DB_PATH;
    const originalPersistenceMode = process.env.OPENVIBE_PERSISTENCE_MODE;
    const originalServicePersistenceMode = process.env.OPENVIBE_OPENVIBE_MEDIA_PERSISTENCE_MODE;
    const originalDatabaseUrl = process.env.OPENVIBE_DATABASE_URL;
    const originalStagingDatabaseUrl = process.env.OPENVIBE_STAGING_DATABASE_URL;
    const originalServiceDatabaseUrl = process.env.OPENVIBE_OPENVIBE_MEDIA_DATABASE_URL;
    const originalEventsUrl = process.env.OPENVIBE_EVENTS_URL;
    const originalHotRoot = process.env.OPENVIBE_MEDIA_HOT_ROOT;
    const originalMultipartRoot = process.env.OPENVIBE_MEDIA_MULTIPART_ROOT;
    const originalPublicBaseUrl = process.env.PUBLIC_BASE_URL;
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

    process.env.NODE_ENV = 'development';
    process.env.OPENVIBE_ENV = 'development';
    process.env.DB_PATH = path.join(tmp, 'openvibe-media.db');
    process.env.OPENVIBE_PERSISTENCE_MODE = 'sqlite';
    process.env.OPENVIBE_OPENVIBE_MEDIA_PERSISTENCE_MODE = 'sqlite';
    process.env.OPENVIBE_DATABASE_URL = '';
    process.env.OPENVIBE_STAGING_DATABASE_URL = '';
    process.env.OPENVIBE_OPENVIBE_MEDIA_DATABASE_URL = '';
    process.env.OPENVIBE_EVENTS_URL = 'http://127.0.0.1:1';
    process.env.OPENVIBE_MEDIA_HOT_ROOT = path.join(tmp, 'storage');
    process.env.OPENVIBE_MEDIA_MULTIPART_ROOT = path.join(tmp, 'multipart');
    process.env.PUBLIC_BASE_URL = 'http://media.test';

    try {
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

        console.log('openvibe-workers native-analytics test OK');
    } finally {
        if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = originalNodeEnv;
        if (originalOpenvibeEnv === undefined) delete process.env.OPENVIBE_ENV;
        else process.env.OPENVIBE_ENV = originalOpenvibeEnv;
        if (originalDbPath === undefined) delete process.env.DB_PATH;
        else process.env.DB_PATH = originalDbPath;
        if (originalPersistenceMode === undefined) delete process.env.OPENVIBE_PERSISTENCE_MODE;
        else process.env.OPENVIBE_PERSISTENCE_MODE = originalPersistenceMode;
        if (originalServicePersistenceMode === undefined) delete process.env.OPENVIBE_OPENVIBE_MEDIA_PERSISTENCE_MODE;
        else process.env.OPENVIBE_OPENVIBE_MEDIA_PERSISTENCE_MODE = originalServicePersistenceMode;
        if (originalDatabaseUrl === undefined) delete process.env.OPENVIBE_DATABASE_URL;
        else process.env.OPENVIBE_DATABASE_URL = originalDatabaseUrl;
        if (originalStagingDatabaseUrl === undefined) delete process.env.OPENVIBE_STAGING_DATABASE_URL;
        else process.env.OPENVIBE_STAGING_DATABASE_URL = originalStagingDatabaseUrl;
        if (originalServiceDatabaseUrl === undefined) delete process.env.OPENVIBE_OPENVIBE_MEDIA_DATABASE_URL;
        else process.env.OPENVIBE_OPENVIBE_MEDIA_DATABASE_URL = originalServiceDatabaseUrl;
        if (originalEventsUrl === undefined) delete process.env.OPENVIBE_EVENTS_URL;
        else process.env.OPENVIBE_EVENTS_URL = originalEventsUrl;
        if (originalHotRoot === undefined) delete process.env.OPENVIBE_MEDIA_HOT_ROOT;
        else process.env.OPENVIBE_MEDIA_HOT_ROOT = originalHotRoot;
        if (originalMultipartRoot === undefined) delete process.env.OPENVIBE_MEDIA_MULTIPART_ROOT;
        else process.env.OPENVIBE_MEDIA_MULTIPART_ROOT = originalMultipartRoot;
        if (originalPublicBaseUrl === undefined) delete process.env.PUBLIC_BASE_URL;
        else process.env.PUBLIC_BASE_URL = originalPublicBaseUrl;
        fs.rmSync(tmp, { recursive: true, force: true });
    }
}

main().catch((error) => {
    console.error(error && error.stack || error);
    process.exit(1);
});
