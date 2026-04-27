'use strict';

const assert = require('assert');
const persistence = require('../persistence-mode');

(function defaultsToSqlite() {
    const before = process.env.OPENVIBE_PERSISTENCE_MODE;
    delete process.env.OPENVIBE_PERSISTENCE_MODE;
    delete process.env.OPENVIBE_NETWORK_PERSISTENCE_MODE;
    const desc = persistence.describePersistence('openvibe-network', '/tmp/x.db');
    assert.strictEqual(desc.mode, 'sqlite');
    assert.strictEqual(desc.legacy_compat_mode, false);
    if (before != null) process.env.OPENVIBE_PERSISTENCE_MODE = before;
})();

(function postgresFromEnv() {
    process.env.OPENVIBE_PERSISTENCE_MODE = 'postgres';
    process.env.OPENVIBE_DATABASE_URL = 'postgres://example';
    const desc = persistence.describePersistence('openvibe-network', '/tmp/x.db');
    assert.strictEqual(desc.mode, 'postgres');
    assert.strictEqual(desc.database_url_configured, true);
    delete process.env.OPENVIBE_PERSISTENCE_MODE;
    delete process.env.OPENVIBE_DATABASE_URL;
})();

(function legacyCompatFlag() {
    process.env.OPENVIBE_LEGACY_COMPAT_MODE = 'true';
    assert.strictEqual(persistence.isLegacyCompatEnabled(), true);
    process.env.OPENVIBE_LEGACY_COMPAT_MODE = '0';
    assert.strictEqual(persistence.isLegacyCompatEnabled(), false);
    delete process.env.OPENVIBE_LEGACY_COMPAT_MODE;
})();

console.log('persistence-mode: OK');
