'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createProcessorCatalog } = require('../server/processors');

async function main() {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-workers-native-billing-'));
    const billingDbPath = path.join(tempDir, 'openvibe-billing.db');
    const originalDbPath = process.env.DB_PATH;
    const originalPersistenceMode = process.env.OPENVIBE_PERSISTENCE_MODE;
    const originalEventsUrl = process.env.OPENVIBE_EVENTS_URL;

    process.env.DB_PATH = billingDbPath;
    process.env.OPENVIBE_PERSISTENCE_MODE = 'sqlite';
    process.env.OPENVIBE_EVENTS_URL = 'http://127.0.0.1:0';

    try {
        const catalog = createProcessorCatalog({
            serviceId: 'openvibe-workers',
            workerBackendMode: 'native',
            requestTimeoutMs: 250,
            migrationBundleDir: tempDir,
            migrationCutoverReportPath: path.join(tempDir, 'cutover-report.json'),
        });

        const result = await catalog['billing.reconcile'].run({ data: { repair: true } });
        assert.strictEqual(result.ok, true);
        assert.strictEqual(result.requested_by_service, 'openvibe-workers');
        assert.strictEqual(result.wallet_count, 0);
        assert.strictEqual(result.mismatch_count, 0);
    } finally {
        if (originalDbPath === undefined) delete process.env.DB_PATH;
        else process.env.DB_PATH = originalDbPath;
        if (originalPersistenceMode === undefined) delete process.env.OPENVIBE_PERSISTENCE_MODE;
        else process.env.OPENVIBE_PERSISTENCE_MODE = originalPersistenceMode;
        if (originalEventsUrl === undefined) delete process.env.OPENVIBE_EVENTS_URL;
        else process.env.OPENVIBE_EVENTS_URL = originalEventsUrl;
        fs.rmSync(tempDir, { recursive: true, force: true });
    }

    console.log('openvibe-workers native billing test OK');
}

main().catch((error) => {
    console.error(error && error.stack || error);
    process.exit(1);
});
