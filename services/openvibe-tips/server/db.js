'use strict';

// openvibe-tips — SQLite persistence.
//
// Tables:
//   tips_creators       — creator profiles and public tip page config
//   tips_connectors     — per-creator third-party service connections
//   tips_events         — normalised tip events from all sources
//   tips_webhook_tokens — per-creator webhook auth tokens

const path = require('path');
const {
    createLegacyPersistenceRuntime,
    describeBootstrapSource,
    createLegacyPostgresStore,
    createLegacySqliteStore,
} = require('@openvibe/persistence');

const SERVICE_NAME = 'openvibe-tips';
const POSTGRES_MIGRATIONS_DIR = path.resolve(__dirname, 'migrations', 'postgres');

const SCHEMA_SQL = `
    CREATE TABLE IF NOT EXISTS tips_creators (
        id              TEXT PRIMARY KEY,
        user_id         TEXT NOT NULL,
        slug            TEXT NOT NULL UNIQUE,
        display_name    TEXT NOT NULL,
        bio             TEXT,
        avatar_url      TEXT,
        accent_color    TEXT NOT NULL DEFAULT '#f59e0b',
        currency        TEXT NOT NULL DEFAULT 'USD',
        native_enabled  INTEGER NOT NULL DEFAULT 1,
        custom_amounts  TEXT NOT NULL DEFAULT '[1,5,10,25]',
        min_amount      INTEGER NOT NULL DEFAULT 100,
        status          TEXT NOT NULL DEFAULT 'active',
        metadata_json   TEXT NOT NULL DEFAULT '{}',
        created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_tips_creators_user ON tips_creators(user_id);
    CREATE INDEX IF NOT EXISTS idx_tips_creators_status ON tips_creators(status);

    CREATE TABLE IF NOT EXISTS tips_connectors (
        id              TEXT PRIMARY KEY,
        creator_id      TEXT NOT NULL,
        connector_type  TEXT NOT NULL,
        label           TEXT,
        config_json     TEXT NOT NULL DEFAULT '{}',
        status          TEXT NOT NULL DEFAULT 'active',
        last_event_at   DATETIME,
        event_count     INTEGER NOT NULL DEFAULT 0,
        created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (creator_id) REFERENCES tips_creators(id) ON DELETE CASCADE,
        UNIQUE (creator_id, connector_type)
    );
    CREATE INDEX IF NOT EXISTS idx_tips_connectors_creator ON tips_connectors(creator_id);

    CREATE TABLE IF NOT EXISTS tips_events (
        id              TEXT PRIMARY KEY,
        creator_id      TEXT NOT NULL,
        connector_id    TEXT,
        source          TEXT NOT NULL,
        event_type      TEXT NOT NULL DEFAULT 'tip',
        sender          TEXT,
        amount_value    TEXT,
        amount_currency TEXT NOT NULL DEFAULT 'USD',
        amount_minor    INTEGER,
        message         TEXT,
        is_anonymous    INTEGER NOT NULL DEFAULT 0,
        visibility      TEXT NOT NULL DEFAULT 'public',
        external_id     TEXT,
        raw_json        TEXT,
        received_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (creator_id) REFERENCES tips_creators(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_tips_events_creator ON tips_events(creator_id, received_at);
    CREATE INDEX IF NOT EXISTS idx_tips_events_source ON tips_events(source, received_at);
    CREATE INDEX IF NOT EXISTS idx_tips_events_external ON tips_events(source, external_id);

    CREATE TABLE IF NOT EXISTS tips_webhook_tokens (
        id              TEXT PRIMARY KEY,
        creator_id      TEXT NOT NULL,
        token           TEXT NOT NULL UNIQUE,
        label           TEXT,
        last_used_at    DATETIME,
        created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (creator_id) REFERENCES tips_creators(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_tips_wh_tokens_creator ON tips_webhook_tokens(creator_id);
    CREATE INDEX IF NOT EXISTS idx_tips_wh_tokens_token ON tips_webhook_tokens(token);
`;

function defaultSqlitePath() {
    return path.resolve(__dirname, '..', 'data', 'openvibe-tips.db');
}

function createSqliteStore(options) {
    return createLegacySqliteStore({
        serviceName: SERVICE_NAME,
        schemaSql: SCHEMA_SQL,
        sqlitePath: options && options.sqlitePath || defaultSqlitePath(),
    });
}

function createPostgresStore(options) {
    return createLegacyPostgresStore({
        serviceName: SERVICE_NAME,
        migrationDir: POSTGRES_MIGRATIONS_DIR,
        databaseUrl: options && options.databaseUrl,
    });
}

const sqliteStore = createSqliteStore({ sqlitePath: defaultSqlitePath() });
const runtime = createLegacyPersistenceRuntime({
    serviceName: SERVICE_NAME,
    bootstrap: describeBootstrapSource(SERVICE_NAME, { usesLegacyBootstrapSql: true }),
    defaultSqlitePath,
    sqlite: sqliteStore,
    createPostgres({ databaseUrl }) { return createPostgresStore({ databaseUrl }); },
});

module.exports = Object.assign({}, runtime, {
    SERVICE_NAME,
    POSTGRES_MIGRATIONS_DIR,
    SCHEMA_SQL,
});
