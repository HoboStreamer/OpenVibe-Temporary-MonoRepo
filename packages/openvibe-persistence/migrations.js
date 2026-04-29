'use strict';

function validateTableName(tableName) {
    const name = String(tableName || 'runtime_schema_migrations');
    if (!/^[a-z_][a-z0-9_]*$/i.test(name)) {
        throw new Error(`Invalid migrations table name: ${name}`);
    }
    return name;
}

async function ensureMigrationsTable(queryable, tableName) {
    const table = validateTableName(tableName);
    await queryable.query(`
        CREATE TABLE IF NOT EXISTS ${table} (
            name TEXT PRIMARY KEY,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
}

async function listAppliedMigrations(queryable, tableName) {
    const table = validateTableName(tableName);
    const result = await queryable.query(`SELECT name, applied_at FROM ${table} ORDER BY applied_at ASC, name ASC`);
    return result.rows || [];
}

async function recordMigration(queryable, name, tableName) {
    const table = validateTableName(tableName);
    const migrationName = String(name || '').trim();
    if (!migrationName) throw new Error('migration name is required');
    await queryable.query(`INSERT INTO ${table} (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`, [migrationName]);
}

module.exports = {
    ensureMigrationsTable,
    listAppliedMigrations,
    recordMigration,
};
