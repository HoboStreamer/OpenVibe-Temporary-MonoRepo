'use strict';

// openvibe-network — SQLite persistence for the kernel control plane.
//
// Tables (all migration-safe via CREATE TABLE IF NOT EXISTS):
//   user_modules         — namespaced, owner-attested, versioned per-user data
//   user_modules_history — append-only changelog for user_modules
//   service_registry     — service identity + URLs + declared capabilities/topics + heartbeat
//   capability_registry  — capability id + owner service + version + schemas + policy
//   capability_invocations — invocation audit/status rows for capability dispatch
//   contract_registry    — schema/contract definitions (events, modules, media, ...)
//   url_registry_overlay — OpenVibe-only URL registry keys (extends hobo-tools registry)
//   audit_log            — every mutating action across the kernel
//   auth_users           — native username/email/password identities
//   auth_authorization_codes — OAuth authorization code staging
//   auth_refresh_tokens  — native refresh token rotation store
//   auth_sessions        — browser/device session inventory

const path = require('path');
const {
    createLegacyPersistenceRuntime,
    describeBootstrapSource,
    createLegacyPostgresStore,
    createLegacySqliteStore,
} = require('@openvibe/persistence');

const SERVICE_NAME = 'openvibe-network';
const POSTGRES_MIGRATIONS_DIR = path.resolve(__dirname, 'migrations', 'postgres');
const AUTH_SCHEMA_SQL = `
        CREATE TABLE IF NOT EXISTS auth_users (
            id            TEXT PRIMARY KEY,
            username      TEXT NOT NULL UNIQUE,
            display_name  TEXT,
            email         TEXT UNIQUE,
            avatar_url    TEXT,
            password_hash TEXT,
            password_algorithm TEXT NOT NULL DEFAULT 'none',
            password_updated_at DATETIME,
            primary_source TEXT,
            is_banned     INTEGER NOT NULL DEFAULT 0,
            ban_reason    TEXT,
            metadata_json TEXT NOT NULL DEFAULT '{}',
            created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_login_at DATETIME
        );

        CREATE TABLE IF NOT EXISTS auth_authorization_codes (
            code_hash              TEXT PRIMARY KEY,
            user_id                TEXT NOT NULL,
            client_id              TEXT,
            redirect_uri           TEXT,
            scope                  TEXT NOT NULL,
            nonce                  TEXT,
            state                  TEXT,
            code_challenge         TEXT,
            code_challenge_method  TEXT,
            session_id             TEXT,
            expires_at             DATETIME NOT NULL,
            consumed_at            DATETIME,
            created_at             DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_auth_codes_user ON auth_authorization_codes(user_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
            token_hash   TEXT PRIMARY KEY,
            user_id      TEXT NOT NULL,
            client_id    TEXT,
            scope        TEXT NOT NULL,
            session_id   TEXT,
            expires_at   DATETIME NOT NULL,
            rotated_at   DATETIME,
            revoked_at   DATETIME,
            created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_refresh_user ON auth_refresh_tokens(user_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS auth_sessions (
            id            TEXT PRIMARY KEY,
            user_id       TEXT NOT NULL,
            user_agent    TEXT,
            ip_address    TEXT,
            created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_seen_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
            revoked_at    DATETIME,
            metadata_json TEXT NOT NULL DEFAULT '{}'
        );
        CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id, created_at DESC);
    `;
const SCHEMA_SQL = `
        CREATE TABLE IF NOT EXISTS user_modules (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id      TEXT NOT NULL,
            namespace    TEXT NOT NULL,
            owner        TEXT NOT NULL,         -- service id authoritative for this row
            schema_version INTEGER NOT NULL DEFAULT 1,
            data_json    TEXT NOT NULL,
            updated_by_actor_type TEXT,
            updated_by_actor_id   TEXT,
            created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, namespace)
        );
        CREATE INDEX IF NOT EXISTS idx_user_modules_user ON user_modules(user_id);

        CREATE TABLE IF NOT EXISTS user_modules_history (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id         TEXT NOT NULL,
            namespace       TEXT NOT NULL,
            schema_version  INTEGER NOT NULL,
            data_json       TEXT NOT NULL,
            actor_type      TEXT,
            actor_id        TEXT,
            recorded_at     DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_user_modules_history ON user_modules_history(user_id, namespace, recorded_at DESC);

        CREATE TABLE IF NOT EXISTS service_registry (
            service_id      TEXT PRIMARY KEY,
            display_name    TEXT NOT NULL,
            description     TEXT,
            internal_url    TEXT,
            public_url      TEXT,
            capabilities_json TEXT NOT NULL DEFAULT '[]',
            topics_json     TEXT NOT NULL DEFAULT '[]',
            metadata_json   TEXT NOT NULL DEFAULT '{}',
            last_heartbeat  DATETIME,
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS capability_registry (
            capability_id   TEXT NOT NULL,
            version         INTEGER NOT NULL DEFAULT 1,
            owner_service   TEXT NOT NULL,
            description     TEXT,
            input_schema_json  TEXT NOT NULL DEFAULT '{}',
            output_schema_json TEXT NOT NULL DEFAULT '{}',
            policy_json     TEXT NOT NULL DEFAULT '{}',
            rate_limit_json TEXT NOT NULL DEFAULT '{}',
            emits_topics_json TEXT NOT NULL DEFAULT '[]',
            deprecated      INTEGER NOT NULL DEFAULT 0,
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (capability_id, version)
        );

        CREATE TABLE IF NOT EXISTS capability_invocations (
            invocation_id      TEXT PRIMARY KEY,
            capability_id      TEXT NOT NULL,
            capability_version INTEGER NOT NULL,
            actor_type         TEXT,
            actor_id           TEXT,
            trace_id           TEXT NOT NULL,
            idempotency_key    TEXT,
            target_service     TEXT,
            request_json       TEXT NOT NULL DEFAULT '{}',
            response_json      TEXT,
            error_json         TEXT,
            status             TEXT NOT NULL DEFAULT 'pending',
            http_status        INTEGER NOT NULL DEFAULT 202,
            created_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (capability_id, actor_type, actor_id, idempotency_key)
        );
        CREATE INDEX IF NOT EXISTS idx_capability_invocations_trace ON capability_invocations(trace_id);
        CREATE INDEX IF NOT EXISTS idx_capability_invocations_actor ON capability_invocations(actor_type, actor_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS contract_registry (
            contract_id     TEXT NOT NULL,        -- e.g. 'event:auth.token.issued' or 'module:live.profile'
            version         INTEGER NOT NULL DEFAULT 1,
            kind            TEXT NOT NULL,        -- 'event' | 'capability' | 'user_module' | 'media' | 'service_manifest'
            owner_service   TEXT NOT NULL,
            schema_json     TEXT NOT NULL,
            description     TEXT,
            deprecated      INTEGER NOT NULL DEFAULT 0,
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (contract_id, version)
        );

        CREATE TABLE IF NOT EXISTS url_registry_overlay (
            key         TEXT PRIMARY KEY,
            value       TEXT,
            description TEXT,
            updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS audit_log (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            actor_type  TEXT,
            actor_id    TEXT,
            action      TEXT NOT NULL,
            resource    TEXT NOT NULL,
            outcome     TEXT NOT NULL,        -- 'allow' | 'deny' | 'error'
            detail_json TEXT,
            recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor_type, actor_id, recorded_at DESC);

        CREATE TABLE IF NOT EXISTS auth_users (
            id            TEXT PRIMARY KEY,
            username      TEXT NOT NULL UNIQUE,
            display_name  TEXT,
            email         TEXT UNIQUE,
            avatar_url    TEXT,
            password_hash TEXT,
            password_algorithm TEXT NOT NULL DEFAULT 'none',
            password_updated_at DATETIME,
            primary_source TEXT,
            is_banned     INTEGER NOT NULL DEFAULT 0,
            ban_reason    TEXT,
            metadata_json TEXT NOT NULL DEFAULT '{}',
            created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_login_at DATETIME
        );

        CREATE TABLE IF NOT EXISTS auth_authorization_codes (
            code_hash              TEXT PRIMARY KEY,
            user_id                TEXT NOT NULL,
            client_id              TEXT,
            redirect_uri           TEXT,
            scope                  TEXT NOT NULL,
            nonce                  TEXT,
            state                  TEXT,
            code_challenge         TEXT,
            code_challenge_method  TEXT,
            session_id             TEXT,
            expires_at             DATETIME NOT NULL,
            consumed_at            DATETIME,
            created_at             DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_auth_codes_user ON auth_authorization_codes(user_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
            token_hash   TEXT PRIMARY KEY,
            user_id      TEXT NOT NULL,
            client_id    TEXT,
            scope        TEXT NOT NULL,
            session_id   TEXT,
            expires_at   DATETIME NOT NULL,
            rotated_at   DATETIME,
            revoked_at   DATETIME,
            created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_refresh_user ON auth_refresh_tokens(user_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS auth_sessions (
            id            TEXT PRIMARY KEY,
            user_id       TEXT NOT NULL,
            user_agent    TEXT,
            ip_address    TEXT,
            created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_seen_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
            revoked_at    DATETIME,
            metadata_json TEXT NOT NULL DEFAULT '{}'
        );
        CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id, created_at DESC);
    `;

function defaultSqlitePath() {
    return path.resolve(__dirname, '..', 'data', 'openvibe-network.db');
}

function createSqliteStore(options) {
    const opts = Object.assign({}, options || {});
    return createLegacySqliteStore({
        serviceName: SERVICE_NAME,
        sqlitePath: opts.sqlitePath || defaultSqlitePath(),
        schemaSql: SCHEMA_SQL,
    });
}

function createPostgresStore(options) {
    const opts = Object.assign({}, options || {});
    return createLegacyPostgresStore({
        serviceName: SERVICE_NAME,
        databaseUrl: opts.databaseUrl,
        migrationsDir: opts.migrationsDir || POSTGRES_MIGRATIONS_DIR,
        schemaSql: SCHEMA_SQL,
    });
}

const sqliteStore = createSqliteStore({ sqlitePath: defaultSqlitePath() });
const runtime = createLegacyPersistenceRuntime({
    serviceName: SERVICE_NAME,
    bootstrap: describeBootstrapSource(SERVICE_NAME, { usesLegacyBootstrapSql: true }),
    defaultSqlitePath,
    sqlite: sqliteStore,
    createPostgres({ databaseUrl }) {
        return createPostgresStore({ databaseUrl });
    },
});

module.exports = Object.assign({}, runtime, {
    AUTH_SCHEMA_SQL,
    SERVICE_NAME,
    POSTGRES_MIGRATIONS_DIR,
    SCHEMA_SQL,
    defaultSqlitePath,
    createSqliteStore,
    createPostgresStore,
});
