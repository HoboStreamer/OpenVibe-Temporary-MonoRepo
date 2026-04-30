'use strict';

// openvibe-workers — native ai backend smoke. The native ai.transcript and
// ai.scene-detect backends boot the openvibe-ai runtime (db + stub provider)
// and produce deterministic structured output. The openvibe-ai service db is
// a service-local SQLite file by default; we redirect it to a temp path so
// the test does not pollute repo data.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createProcessorCatalog, describeProcessorCatalog } = require('../server/processors');

async function main() {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-workers-native-ai-'));
    const baseConfig = {
        serviceId: 'openvibe-workers',
        internalKey: 'test-internal',
        requestTimeoutMs: 250,
        workerBackendMode: 'native',
        mediaUrl: '',
        contentUrl: '',
        billingUrl: '',
        networkUrl: '',
        aiUrl: '',
        migrationBundleDir: path.join(tmp, 'bundle'),
        migrationCutoverReportPath: path.join(tmp, 'cutover.json'),
    };

    const described = describeProcessorCatalog(baseConfig);
    assert.strictEqual(described['ai.transcript'].backend, 'native');
    assert.strictEqual(described['ai.transcript'].dependency.service, 'openvibe-ai');
    assert.strictEqual(described['ai.scene-detect'].backend, 'native');

    const previousAiDb = process.env.DB_PATH;
    const previousPersistence = process.env.OPENVIBE_PERSISTENCE_MODE;
    process.env.DB_PATH = path.join(tmp, 'openvibe-ai.db');
    process.env.OPENVIBE_PERSISTENCE_MODE = 'sqlite';

    try {
        const catalog = createProcessorCatalog(baseConfig);
        const transcript = await catalog['ai.transcript'].run({
            data: { media_id: 'm-test-ai-1', duration_seconds: 90, segment_count: 3, language: 'en' },
        });
        assert.strictEqual(transcript.backend, 'native-ai-transcript');
        assert.strictEqual(transcript.segment_count, 3);
        assert.strictEqual(transcript.segments.length, 3);
        assert.strictEqual(transcript.language, 'en');
        assert(transcript.ai_run, 'ai run should be attached');
        assert.strictEqual(transcript.ai_run.stub, true);
        // media unresolved → ok=false but structured output present
        assert.strictEqual(transcript.media_resolved, false);

        const scenes = await catalog['ai.scene-detect'].run({
            data: { media_id: 'm-test-ai-2', duration_seconds: 120, scene_count: 4 },
        });
        assert.strictEqual(scenes.backend, 'native-ai-scene-detect');
        assert.strictEqual(scenes.scene_count, 4);
        assert.strictEqual(scenes.scenes.length, 4);
        assert(scenes.ai_run);
        assert.strictEqual(scenes.ai_run.stub, true);

        // Determinism for transcripts
        const transcript2 = await catalog['ai.transcript'].run({
            data: { media_id: 'm-test-ai-1', duration_seconds: 90, segment_count: 3, language: 'en' },
        });
        assert.deepStrictEqual(transcript.segments.map((s) => s.text), transcript2.segments.map((s) => s.text));
    } finally {
        if (previousAiDb === undefined) delete process.env.DB_PATH;
        else process.env.DB_PATH = previousAiDb;
        if (previousPersistence === undefined) delete process.env.OPENVIBE_PERSISTENCE_MODE;
        else process.env.OPENVIBE_PERSISTENCE_MODE = previousPersistence;
        fs.rmSync(tmp, { recursive: true, force: true });
    }

    console.log('openvibe-workers native-ai test OK');
}

main().catch((error) => {
    console.error(error && error.stack || error);
    process.exit(1);
});
