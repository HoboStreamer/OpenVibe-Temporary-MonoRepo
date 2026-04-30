'use strict';

// OpenVibe persistence-mode helper. Centralizes the env contract used by
// every service `db.js`. SQLite remains a local-dev bootstrap mode, while
// staging/prod are expected to point at the canonical Postgres store.
// Compat mode is exposed so readiness/audit can reason about legacy bridges
// consistently during migration work.

function envPrefixForService(serviceName) {
    return `OPENVIBE_${String(serviceName).toUpperCase().replace(/-/g, '_')}`;
}

function readBoolean(value) {
    const raw = String(value == null ? '' : value).trim().toLowerCase();
    return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function readServiceDatabaseUrl(serviceName) {
    const prefix = envPrefixForService(serviceName);
    return process.env[`${prefix}_DATABASE_URL`]
        || process.env.OPENVIBE_DATABASE_URL
        || process.env.OPENVIBE_STAGING_DATABASE_URL
        || '';
}

function isPostgresRuntimeImplemented(serviceName, options) {
    if (options && typeof options.postgresRuntimeImplemented === 'boolean') {
        return options.postgresRuntimeImplemented;
    }

    const prefix = envPrefixForService(serviceName);
    const explicit = process.env[`${prefix}_POSTGRES_RUNTIME_IMPLEMENTED`];
    if (explicit != null && explicit !== '') {
        return readBoolean(explicit);
    }

    const shared = process.env.OPENVIBE_POSTGRES_RUNTIME_IMPLEMENTED_SERVICES;
    if (!shared) return false;

    const requested = new Set(
        String(shared)
            .split(/[\s,]+/g)
            .map((entry) => entry.trim().toLowerCase())
            .filter(Boolean),
    );
    const normalizedServiceName = String(serviceName).trim().toLowerCase();
    return requested.has('all')
        || requested.has(normalizedServiceName)
        || requested.has(normalizedServiceName.replace(/-/g, '_'));
}

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

function describePersistence(serviceName, dbPath, options) {
    const envKey = `${envPrefixForService(serviceName)}_PERSISTENCE_MODE`;
    const requestedMode = readMode(envKey);
    const databaseUrl = readServiceDatabaseUrl(serviceName);
    const localLikeEnv = isLocalLikeEnv();
    const postgresRuntimeImplemented = isPostgresRuntimeImplemented(serviceName, options);

    let effectiveMode = 'sqlite';
    let adapterStatus = 'local-bootstrap';
    let readiness = localLikeEnv ? 'green' : 'yellow';
    let warning = null;

    if (requestedMode === 'sqlite') {
        effectiveMode = 'sqlite';
        adapterStatus = localLikeEnv ? 'local-bootstrap' : 'dev-only-bootstrap';
        readiness = localLikeEnv ? 'green' : 'yellow';
        if (!localLikeEnv) {
            warning = 'SQLite bootstrap mode is active outside local/dev; staging/prod should use a real Postgres runtime adapter.';
        }
    } else if (postgresRuntimeImplemented) {
        effectiveMode = 'postgres';
        adapterStatus = 'implemented';
        readiness = databaseUrl ? 'green' : 'red';
        if (!databaseUrl) {
            warning = `Requested persistence mode '${requestedMode}' is marked implemented, but no database URL is configured.`;
        }
    } else {
        effectiveMode = requestedMode;
        adapterStatus = 'not-implemented';
        readiness = 'red';
        warning = `Requested persistence mode '${requestedMode}' does not have a runtime adapter yet; the service cannot run in this mode without a native Postgres adapter.`;
    }

    return {
        service: serviceName,
        mode: requestedMode,
        requested_mode: requestedMode,
        effective_mode: effectiveMode,
        adapter_status: adapterStatus,
        readiness,
        warning,
        database_url_configured: !!databaseUrl,
        sqlite_path: dbPath,
        local_bootstrap_only: requestedMode === 'sqlite',
        postgres_runtime_implemented: postgresRuntimeImplemented,
        legacy_compat_mode: isLegacyCompatEnabled(),
        migration_source: options && options.bootstrap && options.bootstrap.migration_source || null,
        bootstrap_source: options && options.bootstrap && options.bootstrap.bootstrap_source || null,
        schema_sql_reconciled: !!(options && options.bootstrap && options.bootstrap.schema_sql_reconciled),
        has_checked_in_migrations: !!(options && options.bootstrap && options.bootstrap.has_checked_in_migrations),
        uses_legacy_bootstrap_sql: !!(options && options.bootstrap && options.bootstrap.uses_legacy_bootstrap_sql),
    };
}

function warnIfUnsupported(serviceName, dbPath, options) {
    const desc = describePersistence(serviceName, dbPath, options);
    if (desc.mode !== 'sqlite' && !desc.database_url_configured) {
        throw new Error(
            `[${serviceName}] persistence mode '${desc.mode}' requires OPENVIBE_DATABASE_URL or OPENVIBE_STAGING_DATABASE_URL.`,
        );
    }
    if (desc.mode !== 'sqlite' && desc.adapter_status !== 'implemented') {
        throw new Error(
            `[${serviceName}] requested persistence mode '${desc.mode}' is not yet implemented for this service; remove the mode override or implement a Postgres runtime adapter before serving traffic.`,
        );
    }
    if (!isLocalLikeEnv() && desc.mode === 'sqlite') {
        console.warn(
            `[${serviceName}] sqlite mode is intended for local/dev bootstrap only; staging/prod should use OPENVIBE_PERSISTENCE_MODE=postgres with a real runtime adapter.`,
        );
    } else if (desc.mode === 'postgres' || desc.mode === 'staging') {
        console.warn(
            `[${serviceName}] persistence mode '${desc.mode}' selected with adapter_status='${desc.adapter_status}'. Ensure the canonical Postgres staging loaders have hydrated the target before serving traffic.`,
        );
    }
    return desc;
}

module.exports = {
    describePersistence,
    envPrefixForService,
    isLegacyCompatEnabled,
    isLocalLikeEnv,
    isPostgresRuntimeImplemented,
    readMode,
    readServiceDatabaseUrl,
    warnIfUnsupported,
};
