'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createProcessorCatalog } = require('../server/processors');

async function main() {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-workers-native-notifications-'));
    const networkDbPath = path.join(tempDir, 'openvibe-network.db');
    const originalNodeEnv = process.env.NODE_ENV;
    const originalOpenvibeEnv = process.env.OPENVIBE_ENV;
    const originalDbPath = process.env.DB_PATH;
    const originalPersistenceMode = process.env.OPENVIBE_PERSISTENCE_MODE;
    const originalServicePersistenceMode = process.env.OPENVIBE_OPENVIBE_NETWORK_PERSISTENCE_MODE;
    const originalDatabaseUrl = process.env.OPENVIBE_DATABASE_URL;
    const originalStagingDatabaseUrl = process.env.OPENVIBE_STAGING_DATABASE_URL;
    const originalServiceDatabaseUrl = process.env.OPENVIBE_OPENVIBE_NETWORK_DATABASE_URL;

    process.env.NODE_ENV = 'development';
    process.env.OPENVIBE_ENV = 'development';
    process.env.DB_PATH = networkDbPath;
    process.env.OPENVIBE_PERSISTENCE_MODE = 'sqlite';
    process.env.OPENVIBE_OPENVIBE_NETWORK_PERSISTENCE_MODE = 'sqlite';
    process.env.OPENVIBE_DATABASE_URL = '';
    process.env.OPENVIBE_STAGING_DATABASE_URL = '';
    process.env.OPENVIBE_OPENVIBE_NETWORK_DATABASE_URL = '';

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
        if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = originalNodeEnv;
        if (originalOpenvibeEnv === undefined) delete process.env.OPENVIBE_ENV;
        else process.env.OPENVIBE_ENV = originalOpenvibeEnv;
        if (originalDbPath === undefined) delete process.env.DB_PATH;
        else process.env.DB_PATH = originalDbPath;
        if (originalPersistenceMode === undefined) delete process.env.OPENVIBE_PERSISTENCE_MODE;
        else process.env.OPENVIBE_PERSISTENCE_MODE = originalPersistenceMode;
        if (originalServicePersistenceMode === undefined) delete process.env.OPENVIBE_OPENVIBE_NETWORK_PERSISTENCE_MODE;
        else process.env.OPENVIBE_OPENVIBE_NETWORK_PERSISTENCE_MODE = originalServicePersistenceMode;
        if (originalDatabaseUrl === undefined) delete process.env.OPENVIBE_DATABASE_URL;
        else process.env.OPENVIBE_DATABASE_URL = originalDatabaseUrl;
        if (originalStagingDatabaseUrl === undefined) delete process.env.OPENVIBE_STAGING_DATABASE_URL;
        else process.env.OPENVIBE_STAGING_DATABASE_URL = originalStagingDatabaseUrl;
        if (originalServiceDatabaseUrl === undefined) delete process.env.OPENVIBE_OPENVIBE_NETWORK_DATABASE_URL;
        else process.env.OPENVIBE_OPENVIBE_NETWORK_DATABASE_URL = originalServiceDatabaseUrl;
        fs.rmSync(tempDir, { recursive: true, force: true });
    }

    console.log('openvibe-workers native notifications test OK');
}

main().catch((error) => {
    console.error(error && error.stack || error);
    process.exit(1);
});
