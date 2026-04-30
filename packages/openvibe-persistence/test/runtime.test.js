'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
    assertSchemaReady,
    createRuntimePersistence,
    createRepositoryFactory,
    getSchemaVersion,
    query,
    resolveMigrationsTableName,
    runMigrations,
    withTransaction,
} = require('..');

(function fallsBackToSqliteInDefaultMode() {
    delete process.env.OPENVIBE_PERSISTENCE_MODE;
    delete process.env.OPENVIBE_DATABASE_URL;
    delete process.env.OPENVIBE_POSTGRES_RUNTIME_IMPLEMENTED_SERVICES;

    const runtime = createRuntimePersistence({
        serviceName: 'openvibe-runtime-persistence-test',
        sqlitePath: '/tmp/openvibe-runtime-persistence-test.db',
        createSqlite: ({ sqlitePath }) => ({ kind: 'sqlite', sqlitePath }),
    });

    assert.strictEqual(runtime.adapterType, 'sqlite');
    assert.strictEqual(runtime.adapter.kind, 'sqlite');
})();

(function usesPostgresWhenMarkedImplemented() {
    process.env.OPENVIBE_PERSISTENCE_MODE = 'postgres';
    process.env.OPENVIBE_DATABASE_URL = 'postgres://runtime-test';
    process.env.OPENVIBE_POSTGRES_RUNTIME_IMPLEMENTED_SERVICES = 'openvibe-runtime-persistence-test';

    const runtime = createRuntimePersistence({
        serviceName: 'openvibe-runtime-persistence-test',
        sqlitePath: '/tmp/openvibe-runtime-persistence-test.db',
        createSqlite: () => ({ kind: 'sqlite' }),
        createPostgres: ({ databaseUrl }) => ({ kind: 'postgres', databaseUrl }),
    });

    assert.strictEqual(runtime.adapterType, 'postgres');
    assert.strictEqual(runtime.adapter.databaseUrl, 'postgres://runtime-test');

    delete process.env.OPENVIBE_PERSISTENCE_MODE;
    delete process.env.OPENVIBE_DATABASE_URL;
    delete process.env.OPENVIBE_POSTGRES_RUNTIME_IMPLEMENTED_SERVICES;
})();

(function repositoryFactoryBuildsRepositories() {
    const factory = createRepositoryFactory({
        adapter: { kind: 'sqlite' },
        repositories: {
            demo: (adapter) => ({ adapterKind: adapter.kind }),
        },
    });

    assert.deepStrictEqual(factory.list(), ['demo']);
    assert.strictEqual(factory.has('demo'), true);
    assert.strictEqual(factory.get('demo').adapterKind, 'sqlite');
})();

(async function transactionHelperWrapsCommitAndRelease() {
    const log = [];
    const client = {
        async query(text) {
            log.push(text);
            return { rows: [{ ok: true }], rowCount: 1 };
        },
        release() {
            log.push('release');
        },
    };

    const result = await withTransaction({ connect: async () => client }, async (tx) => {
        const response = await query(tx, 'SELECT 1');
        return response.rows[0].ok;
    }, { isolationLevel: 'READ COMMITTED' });

    assert.strictEqual(result, true);
    assert.deepStrictEqual(log, ['BEGIN ISOLATION LEVEL READ COMMITTED', 'SELECT 1', 'COMMIT', 'release']);
})();

(async function migrationHelpersApplyAndReportVersions() {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openvibe-persistence-'));
    const migrationsDir = path.join(tempDir, 'migrations');
    fs.mkdirSync(migrationsDir, { recursive: true });
    fs.writeFileSync(path.join(migrationsDir, '001_create_demo.sql'), 'CREATE TABLE demo (id INTEGER);\n');
    fs.writeFileSync(path.join(migrationsDir, '002_seed_demo.sql'), 'INSERT INTO demo (id) VALUES (1);\n');

    const state = {
        applied: [],
        statements: [],
    };
    const client = {
        async query(text, values) {
            const sql = String(text).trim();
            state.statements.push(sql);
            if (/^SELECT name, applied_at FROM runtime_schema_migrations(?:_[a-z0-9_]+)?/i.test(sql)) {
                return {
                    rows: state.applied.map((name, index) => ({
                        name,
                        applied_at: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
                    })),
                    rowCount: state.applied.length,
                };
            }
            if (/^INSERT INTO runtime_schema_migrations(?:_[a-z0-9_]+)?/i.test(sql)) {
                state.applied.push(values[0]);
                return { rows: [], rowCount: 1 };
            }
            return { rows: [], rowCount: 0 };
        },
        release() {},
    };
    const pool = {
        async connect() {
            return client;
        },
        async query(text, values) {
            return client.query(text, values);
        },
    };

    const migrationResult = await runMigrations('openvibe-demo', { pool, migrationsDir });
    const migrationsTable = resolveMigrationsTableName('openvibe-demo');
    assert.strictEqual(migrationResult.applied_count, 2);
    assert.strictEqual(migrationResult.pending_count, 0);
    assert.deepStrictEqual(migrationResult.applied_names, ['001_create_demo.sql', '002_seed_demo.sql']);
    assert.ok(state.statements.some((sql) => sql.includes(`runtime_schema_migrations_openvibe_demo`)));
    assert.strictEqual(migrationResult.migrations_table, migrationsTable);

    const version = await getSchemaVersion('openvibe-demo', { pool, migrationsDir });
    assert.strictEqual(version.latest_applied, '002_seed_demo.sql');
    assert.strictEqual(version.pending_count, 0);
    assert.strictEqual(version.migrations_table, migrationsTable);

    const ready = await assertSchemaReady('openvibe-demo', { pool, migrationsDir });
    assert.strictEqual(ready.latest_available, '002_seed_demo.sql');
})();

console.log('openvibe-persistence: OK');
