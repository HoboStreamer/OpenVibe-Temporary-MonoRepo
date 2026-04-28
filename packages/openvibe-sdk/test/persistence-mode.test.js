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
    delete process.env.OPENVIBE_ENV;
})();

(function legacyCompatFlag() {
    process.env.OPENVIBE_LEGACY_COMPAT_MODE = 'true';
    assert.strictEqual(persistence.isLegacyCompatEnabled(), true);
    process.env.OPENVIBE_LEGACY_COMPAT_MODE = '0';
    assert.strictEqual(persistence.isLegacyCompatEnabled(), false);
    delete process.env.OPENVIBE_LEGACY_COMPAT_MODE;
})();

console.log('persistence-mode: OK');
