'use strict';

const assert = require('assert');
const persistence = require('../persistence-mode');

(function defaultsToSqlite() {
    const before = process.env.OPENVIBE_PERSISTENCE_MODE;
    delete process.env.OPENVIBE_PERSISTENCE_MODE;
    delete process.env.OPENVIBE_NETWORK_PERSISTENCE_MODE;
    const desc = persistence.describePersistence('openvibe-network', '/tmp/x.db');
    assert.strictEqual(desc.mode, 'sqlite');
    assert.strictEqual(desc.effective_mode, 'sqlite');
    assert.strictEqual(desc.adapter_status, 'local-bootstrap');
    assert.strictEqual(desc.legacy_compat_mode, false);
    if (before != null) process.env.OPENVIBE_PERSISTENCE_MODE = before;
})();

(function postgresFromEnv() {
    process.env.OPENVIBE_PERSISTENCE_MODE = 'postgres';
    process.env.OPENVIBE_DATABASE_URL = 'postgres://example';
    const desc = persistence.describePersistence('openvibe-network', '/tmp/x.db');
    assert.strictEqual(desc.mode, 'postgres');
    assert.strictEqual(desc.effective_mode, 'postgres');
    assert.strictEqual(desc.adapter_status, 'not-implemented');
    assert.strictEqual(desc.database_url_configured, true);
    delete process.env.OPENVIBE_PERSISTENCE_MODE;
    delete process.env.OPENVIBE_DATABASE_URL;
})();

(function throwsWhenPostgresNotImplemented() {
    process.env.OPENVIBE_PERSISTENCE_MODE = 'postgres';
    process.env.OPENVIBE_DATABASE_URL = 'postgres://example';
    delete process.env.OPENVIBE_POSTGRES_RUNTIME_IMPLEMENTED_SERVICES;
    assert.throws(() => {
        persistence.warnIfUnsupported('openvibe-network', '/tmp/x.db');
    }, /not yet implemented/);
    delete process.env.OPENVIBE_PERSISTENCE_MODE;
    delete process.env.OPENVIBE_DATABASE_URL;
})();

(function postgresAdapterCanBeMarkedImplemented() {
    process.env.OPENVIBE_PERSISTENCE_MODE = 'postgres';
    process.env.OPENVIBE_DATABASE_URL = 'postgres://example';
    process.env.OPENVIBE_POSTGRES_RUNTIME_IMPLEMENTED_SERVICES = 'openvibe-network';
    const desc = persistence.describePersistence('openvibe-network', '/tmp/x.db');
    assert.strictEqual(desc.mode, 'postgres');
    assert.strictEqual(desc.effective_mode, 'postgres');
    assert.strictEqual(desc.adapter_status, 'implemented');
    delete process.env.OPENVIBE_PERSISTENCE_MODE;
    delete process.env.OPENVIBE_DATABASE_URL;
    delete process.env.OPENVIBE_POSTGRES_RUNTIME_IMPLEMENTED_SERVICES;
})();

(function throwsWhenPostgresHasNoUrl() {
    process.env.OPENVIBE_PERSISTENCE_MODE = 'postgres';
    delete process.env.OPENVIBE_DATABASE_URL;
    delete process.env.OPENVIBE_STAGING_DATABASE_URL;
    assert.throws(() => {
        persistence.warnIfUnsupported('openvibe-network', '/tmp/x.db');
    }, /requires OPENVIBE_DATABASE_URL or OPENVIBE_STAGING_DATABASE_URL/);
    delete process.env.OPENVIBE_PERSISTENCE_MODE;
})();

(function localLikeEnvDefaultsTrue() {
    delete process.env.OPENVIBE_ENV;
    delete process.env.NODE_ENV;
    assert.strictEqual(persistence.isLocalLikeEnv(), true);
    process.env.OPENVIBE_ENV = 'production';
    assert.strictEqual(persistence.isLocalLikeEnv(), false);
    const desc = persistence.describePersistence('openvibe-network', '/tmp/x.db');
    assert.strictEqual(desc.mode, 'sqlite');
    assert.strictEqual(desc.adapter_status, 'dev-only-bootstrap');
    assert.strictEqual(desc.readiness, 'yellow');
    delete process.env.OPENVIBE_ENV;
})();

(function legacyCompatFlag() {
    process.env.OPENVIBE_LEGACY_COMPAT_MODE = 'true';
    assert.strictEqual(persistence.isLegacyCompatEnabled(), true);
    process.env.OPENVIBE_LEGACY_COMPAT_MODE = '0';
    assert.strictEqual(persistence.isLegacyCompatEnabled(), false);
    delete process.env.OPENVIBE_LEGACY_COMPAT_MODE;
})();

(function bootstrapDescriptorMerges() {
    const desc = persistence.describePersistence('openvibe-network', '/tmp/x.db', {
        bootstrap: {
            migration_source: 'checked-in',
            bootstrap_source: 'canonical-migrations',
            schema_sql_reconciled: true,
            has_checked_in_migrations: true,
            uses_legacy_bootstrap_sql: false,
        },
    });
    assert.strictEqual(desc.migration_source, 'checked-in');
    assert.strictEqual(desc.bootstrap_source, 'canonical-migrations');
    assert.strictEqual(desc.schema_sql_reconciled, true);
    assert.strictEqual(desc.has_checked_in_migrations, true);
    assert.strictEqual(desc.uses_legacy_bootstrap_sql, false);
})();

(function bootstrapDescriptorDefaultsWhenAbsent() {
    const desc = persistence.describePersistence('openvibe-network', '/tmp/x.db');
    assert.strictEqual(desc.migration_source, null);
    assert.strictEqual(desc.bootstrap_source, null);
    assert.strictEqual(desc.schema_sql_reconciled, false);
    assert.strictEqual(desc.has_checked_in_migrations, false);
    assert.strictEqual(desc.uses_legacy_bootstrap_sql, false);
})();

console.log('persistence-mode: OK');
