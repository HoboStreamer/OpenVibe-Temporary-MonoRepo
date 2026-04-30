'use strict';

// openvibe-live — SQLite persistence.
// SSR-friendly read-model derived from stream.events (mirrored).

const path = require('path');
const {
    createLegacyPersistenceRuntime,
    createLegacyPostgresStore,
    createLegacySqliteStore,
} = require('@openvibe/persistence');

const SERVICE_NAME = 'openvibe-live';
const SCHEMA_SQL = `
        CREATE TABLE IF NOT EXISTS live_channels (
            id           TEXT PRIMARY KEY,
            slug         TEXT NOT NULL UNIQUE,
            display_name TEXT,
            owner_user_id TEXT,
            description  TEXT,
            avatar_url   TEXT,
            metadata_json TEXT NOT NULL DEFAULT '{}',
            created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS live_streams (
            id           TEXT PRIMARY KEY,
            channel_slug TEXT NOT NULL,
            channel_id   TEXT,
            status       TEXT NOT NULL DEFAULT 'created',  -- created/started/ended
            title        TEXT,
            category     TEXT,
            thumbnail_url TEXT,
            embed_url    TEXT,
            vod_media_id TEXT,
            started_at   DATETIME,
            ended_at     DATETIME,
            metadata_json TEXT NOT NULL DEFAULT '{}',
            created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_live_streams_channel ON live_streams(channel_slug);
        CREATE INDEX IF NOT EXISTS idx_live_streams_status ON live_streams(status);

        CREATE TABLE IF NOT EXISTS mirror_state (
            stream_id    TEXT PRIMARY KEY,
            channel_slug TEXT,
            mirrored_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
            details_json TEXT NOT NULL DEFAULT '{}'
        );

        CREATE TABLE IF NOT EXISTS legacy_id_map (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            source      TEXT NOT NULL,
            kind        TEXT NOT NULL,
            legacy_id   TEXT NOT NULL,
            new_id      TEXT NOT NULL,
            created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(source, kind, legacy_id)
        );
    `;

function defaultSqlitePath() {
    return path.resolve(__dirname, '..', 'data', 'openvibe-live.db');
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
        schemaSql: SCHEMA_SQL,
    });
}

const sqliteStore = createSqliteStore({ sqlitePath: defaultSqlitePath() });
const runtime = createLegacyPersistenceRuntime({
    serviceName: SERVICE_NAME,
    defaultSqlitePath,
    sqlite: sqliteStore,
    createPostgres({ databaseUrl }) {
        return createPostgresStore({ databaseUrl });
    },
});

module.exports = Object.assign({}, runtime, {
    SERVICE_NAME,
    SCHEMA_SQL,
    defaultSqlitePath,
    createSqliteStore,
    createPostgresStore,
});
