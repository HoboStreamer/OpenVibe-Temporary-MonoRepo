'use strict';

// OpenVibe persistence-mode helper. Centralizes the env contract used by
// every service `db.js`. SQLite remains a local-dev bootstrap mode, while
// staging/prod are expected to point at the canonical Postgres store.
// Compat mode is exposed so readiness/audit can reason about legacy bridges
// consistently during migration work.

function readMode(envKey) {
    const raw = process.env[envKey] || process.env.OPENVIBE_PERSISTENCE_MODE || 'sqlite';
    const mode = String(raw).trim().toLowerCase();
    if (mode === 'postgres' || mode === 'pg') return 'postgres';
    if (mode === 'staging') return 'staging';
    return 'sqlite';
}

function isLegacyCompatEnabled() {
    const raw = process.env.OPENVIBE_LEGACY_COMPAT_MODE;
    if (raw == null || raw === '') return false;
    const v = String(raw).trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function isLocalLikeEnv() {
    const raw = process.env.OPENVIBE_ENV || process.env.NODE_ENV || 'local';
    const value = String(raw).trim().toLowerCase();
    return value === 'local' || value === 'development' || value === 'dev' || value === 'test';
}

function describePersistence(serviceName, dbPath) {
    const envKey = `OPENVIBE_${serviceName.toUpperCase().replace(/-/g, '_')}_PERSISTENCE_MODE`;
    const mode = readMode(envKey);
    const databaseUrl = process.env[`OPENVIBE_${serviceName.toUpperCase().replace(/-/g, '_')}_DATABASE_URL`]
        || process.env.OPENVIBE_DATABASE_URL
        || process.env.OPENVIBE_STAGING_DATABASE_URL
        || '';
    return {
        service: serviceName,
        mode,
        database_url_configured: !!databaseUrl,
        sqlite_path: dbPath,
        legacy_compat_mode: isLegacyCompatEnabled(),
    };
}

function warnIfUnsupported(serviceName, dbPath) {
    const desc = describePersistence(serviceName, dbPath);
    if (desc.mode !== 'sqlite' && !desc.database_url_configured) {
        throw new Error(
            `[${serviceName}] persistence mode '${desc.mode}' requires OPENVIBE_DATABASE_URL or OPENVIBE_STAGING_DATABASE_URL.`,
        );
    }
    if (!isLocalLikeEnv() && desc.mode === 'sqlite') {
        console.warn(
            `[${serviceName}] sqlite mode is intended for local/dev bootstrap only; staging/prod should use OPENVIBE_PERSISTENCE_MODE=postgres.`,
        );
    } else if (desc.mode === 'postgres' || desc.mode === 'staging') {
        console.warn(
            `[${serviceName}] persistence mode '${desc.mode}' selected. Ensure the canonical Postgres staging loaders have hydrated the target before serving traffic.`,
        );
    }
    return desc;
}

module.exports = {
    describePersistence,
    isLegacyCompatEnabled,
    isLocalLikeEnv,
    readMode,
    warnIfUnsupported,
};
