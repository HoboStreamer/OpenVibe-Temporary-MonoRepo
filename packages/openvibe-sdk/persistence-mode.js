'use strict';

// OpenVibe persistence-mode helper. Centralizes the env contract used by
// every service `db.js`. Phase 8 default remains `sqlite` so local
// bring-up stays trivial; `postgres` and `staging` are advertised modes
// but require explicit opt-in via env. Compat mode is also exposed so
// readiness/audit can reason about it consistently.

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
        console.warn(
            `[${serviceName}] persistence mode '${desc.mode}' requested but no DATABASE_URL configured — falling back to SQLite (${dbPath}).`,
        );
    } else if (desc.mode === 'postgres' || desc.mode === 'staging') {
        console.warn(
            `[${serviceName}] persistence mode '${desc.mode}' is advertised by Phase 8 but the runtime adapter is the SQLite adapter — set up the canonical Postgres staging via scripts/migrate-hobo/load-postgres.js separately.`,
        );
    }
    return desc;
}

module.exports = {
    describePersistence,
    isLegacyCompatEnabled,
    readMode,
    warnIfUnsupported,
};
