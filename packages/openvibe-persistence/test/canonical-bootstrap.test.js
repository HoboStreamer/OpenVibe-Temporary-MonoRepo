'use strict';

const assert = require('assert');
const path = require('path');

const canonical = require('../canonical-bootstrap');

(function listsKnownServices() {
    const services = canonical.listKnownServices();
    assert.ok(services.includes('openvibe-network'));
    assert.ok(services.includes('openvibe-billing'));
    assert.ok(services.includes('openvibe-content'));
})();

(function describeNetworkBootstrap() {
    const descriptor = canonical.describeBootstrapSource('openvibe-network');
    assert.strictEqual(descriptor.service, 'openvibe-network');
    assert.strictEqual(descriptor.has_checked_in_migrations, true);
    assert.strictEqual(descriptor.migration_source, 'checked-in');
    assert.strictEqual(descriptor.bootstrap_source, 'canonical-migrations');
    assert.strictEqual(descriptor.schema_sql_reconciled, true);
    assert.ok(descriptor.migration_files.length >= 1);
    assert.ok(descriptor.migration_files.some((file) => file.endsWith('001_init.sql')));
})();

(function describeLegacyBootstrap() {
    const descriptor = canonical.describeBootstrapSource('openvibe-network', { usesLegacyBootstrapSql: true });
    assert.strictEqual(descriptor.uses_legacy_bootstrap_sql, true);
    assert.strictEqual(descriptor.bootstrap_source, 'legacy-schema-sql-literal');
    assert.strictEqual(descriptor.schema_sql_reconciled, false);
})();

(function describeUnknownService() {
    const descriptor = canonical.describeBootstrapSource('made-up-service');
    assert.strictEqual(descriptor.has_checked_in_migrations, false);
    assert.strictEqual(descriptor.migration_source, 'absent');
    assert.strictEqual(descriptor.bootstrap_source, 'none');
    assert.strictEqual(descriptor.schema_sql_reconciled, false);
})();

(function loadCanonicalSql() {
    const sql = canonical.loadCanonicalBootstrapSql('openvibe-network');
    assert.ok(sql && sql.length > 0);
    assert.ok(/create\s+table/i.test(sql));
})();

(function customDirOverride() {
    const descriptor = canonical.describeBootstrapSource('arbitrary', { migrationDir: path.join(__dirname, 'no-such-dir') });
    assert.strictEqual(descriptor.has_checked_in_migrations, false);
})();

console.log('canonical-bootstrap: OK');
