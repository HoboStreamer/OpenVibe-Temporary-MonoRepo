'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createProcessorCatalog } = require('../server/processors');

async function main() {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-workers-native-notifications-'));
    const networkDbPath = path.join(tempDir, 'openvibe-network.db');
    const originalDbPath = process.env.DB_PATH;

    process.env.DB_PATH = networkDbPath;

    try {
        const catalog = createProcessorCatalog({
            serviceId: 'openvibe-workers',
            workerBackendMode: 'native',
            requestTimeoutMs: 250,
            migrationBundleDir: tempDir,
            migrationCutoverReportPath: path.join(tempDir, 'cutover-report.json'),
        });

        const result = await catalog['notifications.broadcast'].run({
            data: {
                subject: 'Native backend notice',
                message: 'Direct module path is active.',
            },
        });
        assert.strictEqual(result.ok, true);
        assert.strictEqual(result.requested_by_service, 'openvibe-workers');
        assert.strictEqual(result.delivery_mode, 'audit-recorded');

        const staff = require('../../openvibe-network/server/api/staff');
        const recent = staff.recentAudit({ limit: 1 });
        assert.strictEqual(recent.length, 1);
        assert.strictEqual(recent[0].action, 'internal.notifications.broadcast');
    } finally {
        if (originalDbPath === undefined) delete process.env.DB_PATH;
        else process.env.DB_PATH = originalDbPath;
        fs.rmSync(tempDir, { recursive: true, force: true });
    }

    console.log('openvibe-workers native notifications test OK');
}

main().catch((error) => {
    console.error(error && error.stack || error);
    process.exit(1);
});
