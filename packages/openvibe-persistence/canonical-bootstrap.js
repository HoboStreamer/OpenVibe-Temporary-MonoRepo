'use strict';

/**
 * Canonical bootstrap helper.
 *
 * Goal: give every service one place to ask
 *   - "do I have checked-in Postgres migrations?"
 *   - "what is the canonical bootstrap source for my schema?"
 *   - "am I still relying on a legacy SCHEMA_SQL template literal in db.js?"
 *
 * This module never executes migrations on its own. It only describes them
 * truthfully so describePersistence(...), schema-drift readiness, and the
 * runtime tab can stop guessing.
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

const SERVICE_MIGRATION_DIRS = Object.freeze({
    'openvibe-network':   path.join(REPO_ROOT, 'services/openvibe-network/server/migrations/postgres'),
    'openvibe-events':    path.join(REPO_ROOT, 'services/openvibe-events/server/migrations/postgres'),
    'openvibe-media':     path.join(REPO_ROOT, 'services/openvibe-media/server/migrations/postgres'),
    'openvibe-live':      path.join(REPO_ROOT, 'services/openvibe-live/server/migrations/postgres'),
    'openre-stream':      path.join(REPO_ROOT, 'services/openre-stream/server/migrations/postgres'),
    'openvibe-chat':      path.join(REPO_ROOT, 'services/openvibe-chat/server/migrations/postgres'),
    'openvibe-community': path.join(REPO_ROOT, 'services/openvibe-community/server/migrations/postgres'),
    'openvibe-billing':   path.join(REPO_ROOT, 'services/openvibe-billing/server/migrations/postgres'),
    'openvibe-ai':        path.join(REPO_ROOT, 'services/openvibe-ai/server/migrations/postgres'),
    'openvibe-games':     path.join(REPO_ROOT, 'services/openvibe-games/server/migrations/postgres'),
    'openvibe-content':   path.join(REPO_ROOT, 'services/openvibe-content/server/migrations/postgres'),
});

function listMigrationFiles(serviceName, opts = {}) {
    const dir = (opts && opts.migrationDir) || SERVICE_MIGRATION_DIRS[serviceName] || null;
    if (!dir) return { dir: null, files: [] };
    if (!fs.existsSync(dir)) return { dir, files: [] };
    const files = fs.readdirSync(dir)
        .filter((name) => name.endsWith('.sql'))
        .sort();
    return { dir, files: files.map((name) => path.join(dir, name)) };
}

function loadCanonicalBootstrapSql(serviceName, opts = {}) {
    const { files } = listMigrationFiles(serviceName, opts);
    if (!files.length) return null;
    return files.map((filePath) => fs.readFileSync(filePath, 'utf8')).join('\n');
}

function describeBootstrapSource(serviceName, opts = {}) {
    const { dir, files } = listMigrationFiles(serviceName, opts);
    const hasCheckedInMigrations = files.length > 0;
    const usesLegacyBootstrapSql = !!(opts && opts.usesLegacyBootstrapSql);
    return {
        service: serviceName,
        migration_dir: dir,
        migration_files: files.map((file) => path.relative(REPO_ROOT, file)),
        migration_source: hasCheckedInMigrations ? 'checked-in' : 'absent',
        bootstrap_source: usesLegacyBootstrapSql
            ? 'legacy-schema-sql-literal'
            : (hasCheckedInMigrations ? 'canonical-migrations' : 'none'),
        schema_sql_reconciled: hasCheckedInMigrations && !usesLegacyBootstrapSql,
        has_checked_in_migrations: hasCheckedInMigrations,
        uses_legacy_bootstrap_sql: usesLegacyBootstrapSql,
    };
}

function listKnownServices() {
    return Object.keys(SERVICE_MIGRATION_DIRS);
}

module.exports = {
    SERVICE_MIGRATION_DIRS,
    describeBootstrapSource,
    listKnownServices,
    listMigrationFiles,
    loadCanonicalBootstrapSql,
};
