'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
    createLegacyPersistenceRuntime,
    getSchemaVersion,
} = require('..');

const SERVICES = [
    {
        name: 'openvibe-network',
        modulePath: path.resolve(__dirname, '../../../services/openvibe-network/server/db.js'),
        migrationPath: path.resolve(__dirname, '../../../services/openvibe-network/server/migrations/postgres/001_init.sql'),
    },
    {
        name: 'openvibe-events',
        modulePath: path.resolve(__dirname, '../../../services/openvibe-events/server/db.js'),
        migrationPath: path.resolve(__dirname, '../../../services/openvibe-events/server/migrations/postgres/001_init.sql'),
    },
    {
        name: 'openvibe-media',
        modulePath: path.resolve(__dirname, '../../../services/openvibe-media/server/db.js'),
        migrationPath: path.resolve(__dirname, '../../../services/openvibe-media/server/migrations/postgres/001_init.sql'),
    },
    {
        name: 'openvibe-live',
        modulePath: path.resolve(__dirname, '../../../services/openvibe-live/server/db.js'),
        migrationPath: path.resolve(__dirname, '../../../services/openvibe-live/server/migrations/postgres/001_init.sql'),
    },
    {
        name: 'openre-stream',
        modulePath: path.resolve(__dirname, '../../../services/openre-stream/server/db.js'),
        migrationPath: path.resolve(__dirname, '../../../services/openre-stream/server/migrations/postgres/001_init.sql'),
    },
    {
        name: 'openvibe-chat',
        modulePath: path.resolve(__dirname, '../../../services/openvibe-chat/server/db.js'),
        migrationPath: path.resolve(__dirname, '../../../services/openvibe-chat/server/migrations/postgres/001_init.sql'),
    },
    {
        name: 'openvibe-community',
        modulePath: path.resolve(__dirname, '../../../services/openvibe-community/server/db.js'),
        migrationPath: path.resolve(__dirname, '../../../services/openvibe-community/server/migrations/postgres/001_init.sql'),
    },
    {
        name: 'openvibe-billing',
        modulePath: path.resolve(__dirname, '../../../services/openvibe-billing/server/db.js'),
        migrationPath: path.resolve(__dirname, '../../../services/openvibe-billing/server/migrations/postgres/001_init.sql'),
    },
    {
        name: 'openvibe-ai',
        modulePath: path.resolve(__dirname, '../../../services/openvibe-ai/server/db.js'),
        migrationPath: path.resolve(__dirname, '../../../services/openvibe-ai/server/migrations/postgres/001_init.sql'),
    },
    {
        name: 'openvibe-games',
        modulePath: path.resolve(__dirname, '../../../services/openvibe-games/server/db.js'),
        migrationPath: path.resolve(__dirname, '../../../services/openvibe-games/server/migrations/postgres/001_init.sql'),
    },
];

function makePool() {
    return {
        async query(text) {
            const sql = String(text || '').trim();
            if (/^SELECT name, applied_at FROM runtime_schema_migrations/i.test(sql)) {
                return { rows: [], rowCount: 0 };
            }
            return { rows: [], rowCount: 0 };
        },
    };
}

function migrationFilesExistAndAvoidObviousSqliteOnlyTokens() {
    const forbidden = [
        /\bAUTOINCREMENT\b/i,
        /INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT/i,
        /DATETIME\s+DEFAULT\s+CURRENT_TIMESTAMP/i,
    ];

    for (const service of SERVICES) {
        assert.ok(fs.existsSync(service.migrationPath), `expected migration file for ${service.name}`);
        const source = fs.readFileSync(service.migrationPath, 'utf8');
        assert.ok(source.trim().length > 0, `expected non-empty migration file for ${service.name}`);
        for (const pattern of forbidden) {
            assert.ok(!pattern.test(source), `expected ${service.name} migration to avoid ${pattern}`);
        }
    }
}

async function adaptersReportCheckedInMigrationSource() {
    for (const service of SERVICES) {
        const dbModule = require(service.modulePath);
        assert.strictEqual(dbModule.POSTGRES_MIGRATIONS_DIR, path.dirname(service.migrationPath));
        const version = await getSchemaVersion(service.name, {
            pool: makePool(),
            migrationsDir: dbModule.POSTGRES_MIGRATIONS_DIR,
        });
        assert.strictEqual(version.migration_source, 'checked-in', `expected checked-in migration source for ${service.name}`);
        assert.ok(version.migration_count >= 1, `expected at least one migration for ${service.name}`);
    }
}

function postgresModeWithoutDatabaseUrlThrowsClearly() {
    const originalMode = process.env.OPENVIBE_PERSISTENCE_MODE;
    const originalDbUrl = process.env.OPENVIBE_DATABASE_URL;
    const originalStagingDbUrl = process.env.OPENVIBE_STAGING_DATABASE_URL;

    process.env.OPENVIBE_PERSISTENCE_MODE = 'postgres';
    delete process.env.OPENVIBE_DATABASE_URL;
    delete process.env.OPENVIBE_STAGING_DATABASE_URL;

    const sqliteAdapter = {
        adapter: 'sqlite',
        init() {},
        get() { return { adapter: 'sqlite' }; },
        getStatus() { return { ready: true, error: null }; },
    };

    const runtime = createLegacyPersistenceRuntime({
        serviceName: 'openvibe-network',
        defaultSqlitePath() {
            return '/tmp/openvibe-network.db';
        },
        sqlite: sqliteAdapter,
        createPostgres() {
            throw new Error('should not create postgres adapter without a database URL');
        },
    });

    assert.throws(() => runtime.init('/tmp/openvibe-network.db'), /requires OPENVIBE_DATABASE_URL or OPENVIBE_STAGING_DATABASE_URL/);

    if (originalMode == null) delete process.env.OPENVIBE_PERSISTENCE_MODE;
    else process.env.OPENVIBE_PERSISTENCE_MODE = originalMode;
    if (originalDbUrl == null) delete process.env.OPENVIBE_DATABASE_URL;
    else process.env.OPENVIBE_DATABASE_URL = originalDbUrl;
    if (originalStagingDbUrl == null) delete process.env.OPENVIBE_STAGING_DATABASE_URL;
    else process.env.OPENVIBE_STAGING_DATABASE_URL = originalStagingDbUrl;
}

function sqliteModeStillWorks() {
    const originalMode = process.env.OPENVIBE_PERSISTENCE_MODE;
    const originalDbUrl = process.env.OPENVIBE_DATABASE_URL;
    const originalStagingDbUrl = process.env.OPENVIBE_STAGING_DATABASE_URL;
    delete process.env.OPENVIBE_PERSISTENCE_MODE;
    delete process.env.OPENVIBE_DATABASE_URL;
    delete process.env.OPENVIBE_STAGING_DATABASE_URL;

    let initPath = null;
    const sqliteAdapter = {
        adapter: 'sqlite',
        init(sqlitePath) {
            initPath = sqlitePath;
        },
        get() {
            return { adapter: 'sqlite', ok: true };
        },
        getStatus() {
            return { ready: true, error: null };
        },
    };

    const runtime = createLegacyPersistenceRuntime({
        serviceName: 'openvibe-network',
        defaultSqlitePath() {
            return '/tmp/default-openvibe-network.db';
        },
        sqlite: sqliteAdapter,
        createPostgres() {
            throw new Error('sqlite mode should not create postgres adapter');
        },
    });

    const adapter = runtime.init('/tmp/custom-openvibe-network.db');
    assert.strictEqual(initPath, '/tmp/custom-openvibe-network.db');
    assert.deepStrictEqual(adapter, { adapter: 'sqlite', ok: true });

    if (originalMode == null) delete process.env.OPENVIBE_PERSISTENCE_MODE;
    else process.env.OPENVIBE_PERSISTENCE_MODE = originalMode;
    if (originalDbUrl == null) delete process.env.OPENVIBE_DATABASE_URL;
    else process.env.OPENVIBE_DATABASE_URL = originalDbUrl;
    if (originalStagingDbUrl == null) delete process.env.OPENVIBE_STAGING_DATABASE_URL;
    else process.env.OPENVIBE_STAGING_DATABASE_URL = originalStagingDbUrl;
}

async function main() {
    migrationFilesExistAndAvoidObviousSqliteOnlyTokens();
    await adaptersReportCheckedInMigrationSource();
    postgresModeWithoutDatabaseUrlThrowsClearly();
    sqliteModeStillWorks();
    console.log('openvibe-persistence postgres migrations test OK');
}

main().catch((error) => {
    console.error(error && error.stack || error);
    process.exit(1);
});