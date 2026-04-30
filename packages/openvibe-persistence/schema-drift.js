'use strict';

const fs = require('fs');
const path = require('path');

const { splitSqlStatements, translateSqliteToPostgres } = require('./sql-compat');

const SCHEMA_SERVICES = Object.freeze([
    {
        name: 'openvibe-network',
        modulePath: path.resolve(__dirname, '../../services/openvibe-network/server/db.js'),
        migrationPath: path.resolve(__dirname, '../../services/openvibe-network/server/migrations/postgres/001_init.sql'),
    },
    {
        name: 'openvibe-events',
        modulePath: path.resolve(__dirname, '../../services/openvibe-events/server/db.js'),
        migrationPath: path.resolve(__dirname, '../../services/openvibe-events/server/migrations/postgres/001_init.sql'),
    },
    {
        name: 'openvibe-media',
        modulePath: path.resolve(__dirname, '../../services/openvibe-media/server/db.js'),
        migrationPath: path.resolve(__dirname, '../../services/openvibe-media/server/migrations/postgres/001_init.sql'),
    },
    {
        name: 'openvibe-live',
        modulePath: path.resolve(__dirname, '../../services/openvibe-live/server/db.js'),
        migrationPath: path.resolve(__dirname, '../../services/openvibe-live/server/migrations/postgres/001_init.sql'),
    },
    {
        name: 'openre-stream',
        modulePath: path.resolve(__dirname, '../../services/openre-stream/server/db.js'),
        migrationPath: path.resolve(__dirname, '../../services/openre-stream/server/migrations/postgres/001_init.sql'),
    },
    {
        name: 'openvibe-chat',
        modulePath: path.resolve(__dirname, '../../services/openvibe-chat/server/db.js'),
        migrationPath: path.resolve(__dirname, '../../services/openvibe-chat/server/migrations/postgres/001_init.sql'),
    },
    {
        name: 'openvibe-community',
        modulePath: path.resolve(__dirname, '../../services/openvibe-community/server/db.js'),
        migrationPath: path.resolve(__dirname, '../../services/openvibe-community/server/migrations/postgres/001_init.sql'),
    },
    {
        name: 'openvibe-billing',
        modulePath: path.resolve(__dirname, '../../services/openvibe-billing/server/db.js'),
        migrationPath: path.resolve(__dirname, '../../services/openvibe-billing/server/migrations/postgres/001_init.sql'),
    },
    {
        name: 'openvibe-ai',
        modulePath: path.resolve(__dirname, '../../services/openvibe-ai/server/db.js'),
        migrationPath: path.resolve(__dirname, '../../services/openvibe-ai/server/migrations/postgres/001_init.sql'),
    },
    {
        name: 'openvibe-games',
        modulePath: path.resolve(__dirname, '../../services/openvibe-games/server/db.js'),
        migrationPath: path.resolve(__dirname, '../../services/openvibe-games/server/migrations/postgres/001_init.sql'),
    },
]);

function stripSqlComments(source) {
    return String(source || '')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n\r]*/g, ' ');
}

function canonicalizeStatement(statement) {
    return String(statement || '')
        .replace(/\s+/g, ' ')
    .replace(/\s*\(\s*/g, '(')
    .replace(/\s*\)\s*/g, ')')
    .replace(/\s*,\s*/g, ',')
        .trim()
        .toLowerCase();
}

function canonicalizeSql(source, options = {}) {
    return splitSqlStatements(stripSqlComments(source))
    .map((statement) => options.normalizeSchema ? translateSqliteToPostgres(statement) : statement)
        .map((statement) => canonicalizeStatement(statement))
        .filter(Boolean);
}

function readMigrationSql(migrationPath) {
    const migrationDir = path.dirname(migrationPath);
    const fileNames = fs.readdirSync(migrationDir)
        .filter((name) => name.endsWith('.sql'))
        .sort();
    return fileNames.map((name) => fs.readFileSync(path.join(migrationDir, name), 'utf8')).join('\n');
}

function extractSchemaSql(modulePath) {
    const source = fs.readFileSync(modulePath, 'utf8');
    const match = source.match(/const SCHEMA_SQL = `([\s\S]*?)`;/);
    if (!match) {
        throw new Error(`Unable to extract SCHEMA_SQL from ${modulePath}`);
    }
    return match[1];
}

function extractLegacyBootstrapSql(modulePath) {
    try {
        const moduleExports = require(modulePath);
        return Array.isArray(moduleExports.LEGACY_BOOTSTRAP_SQL)
            ? moduleExports.LEGACY_BOOTSTRAP_SQL.join(';\n')
            : '';
    } catch {
        return '';
    }
}

function compareServiceSchema(service) {
    const schemaSql = [
        extractSchemaSql(service.modulePath),
        extractLegacyBootstrapSql(service.modulePath),
    ].filter(Boolean).join(';\n');
    const migrationSql = readMigrationSql(service.migrationPath);
    const schemaStatements = canonicalizeSql(schemaSql, { normalizeSchema: true });
    const migrationStatements = canonicalizeSql(migrationSql, { normalizeSchema: false });
    const migrationSet = new Set(migrationStatements);
    const schemaSet = new Set(schemaStatements);

    const missingInMigrations = schemaStatements.filter((statement) => !migrationSet.has(statement));
    const missingInSchema = migrationStatements.filter((statement) => !schemaSet.has(statement));
    const status = missingInMigrations.length || missingInSchema.length ? 'red' : 'green';

    return {
        name: service.name,
        module_path: service.modulePath,
        migration_path: service.migrationPath,
        schema_statement_count: schemaStatements.length,
        migration_statement_count: migrationStatements.length,
        missing_in_migrations: missingInMigrations,
        missing_in_schema: missingInSchema,
        status,
    };
}

function checkSchemaDrift() {
    const services = SCHEMA_SERVICES.map((service) => compareServiceSchema(service));
    const summary = services.reduce((acc, service) => {
        acc[service.status] += 1;
        return acc;
    }, { green: 0, yellow: 0, red: 0 });
    const gate = summary.red > 0 ? 'red' : 'green';

    return {
        generated_at: new Date().toISOString(),
        gate,
        summary,
        services,
        continuation_points: services
            .filter((service) => service.status !== 'green')
            .flatMap((service) => [service.module_path, service.migration_path]),
    };
}

module.exports = {
    SCHEMA_SERVICES,
    canonicalizeSql,
    checkSchemaDrift,
    compareServiceSchema,
    extractLegacyBootstrapSql,
    extractSchemaSql,
    readMigrationSql,
};
