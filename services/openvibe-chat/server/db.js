'use strict';

// openvibe-chat — SQLite persistence (migration-safe via CREATE IF NOT EXISTS).

const path = require('path');
const {
    createLegacyPersistenceRuntime,
    describeBootstrapSource,
    createLegacyPostgresStore,
    createLegacySqliteStore,
} = require('@openvibe/persistence');

const SERVICE_NAME = 'openvibe-chat';
const POSTGRES_MIGRATIONS_DIR = path.resolve(__dirname, 'migrations', 'postgres');
const SCHEMA_SQL = `
        CREATE TABLE IF NOT EXISTS chat_rooms (
            id                  TEXT PRIMARY KEY,
            room_type           TEXT NOT NULL,
            external_ref_type   TEXT,
            external_ref_id     TEXT,
            title               TEXT,
            visibility          TEXT NOT NULL DEFAULT 'public',
            owner_type          TEXT,
            owner_id            TEXT,
            created_by_actor_type TEXT,
            created_by_actor_id   TEXT,
            metadata_json       TEXT NOT NULL DEFAULT '{}',
            archived_at         DATETIME,
            created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_chat_rooms_type ON chat_rooms(room_type);
        CREATE INDEX IF NOT EXISTS idx_chat_rooms_ext  ON chat_rooms(external_ref_type, external_ref_id);
        CREATE INDEX IF NOT EXISTS idx_chat_rooms_owner ON chat_rooms(owner_type, owner_id);

        CREATE TABLE IF NOT EXISTS chat_participants (
            room_id             TEXT NOT NULL,
            actor_type          TEXT NOT NULL,
            actor_id            TEXT NOT NULL,
            role                TEXT NOT NULL DEFAULT 'participant',
            joined_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_seen_at        DATETIME,
            last_read_at        DATETIME,
            muted_until         DATETIME,
            metadata_json       TEXT NOT NULL DEFAULT '{}',
            PRIMARY KEY (room_id, actor_type, actor_id),
            FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_chat_participants_actor ON chat_participants(actor_type, actor_id);

        CREATE TABLE IF NOT EXISTS chat_messages (
            id                  TEXT PRIMARY KEY,
            room_id             TEXT NOT NULL,
            sender_type         TEXT NOT NULL,
            sender_id           TEXT,
            message_type        TEXT NOT NULL DEFAULT 'text',
            body                TEXT,
            rich_payload_json   TEXT,
            reply_to_message_id TEXT,
            legacy_source       TEXT,
            legacy_id           TEXT,
            moderation_status   TEXT NOT NULL DEFAULT 'visible',
            metadata_json       TEXT NOT NULL DEFAULT '{}',
            created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
            edited_at           DATETIME,
            deleted_at          DATETIME,
            FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_chat_messages_room  ON chat_messages(room_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_chat_messages_legacy ON chat_messages(legacy_source, legacy_id);

        CREATE TABLE IF NOT EXISTS chat_call_sessions (
            id                  TEXT PRIMARY KEY,
            room_id             TEXT NOT NULL,
            call_type           TEXT NOT NULL DEFAULT 'voice',
            status              TEXT NOT NULL DEFAULT 'pending',
            started_by_actor_type TEXT,
            started_by_actor_id   TEXT,
            target_actor_type   TEXT,
            target_actor_id     TEXT,
            started_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
            answered_at         DATETIME,
            ended_at            DATETIME,
            metadata_json       TEXT NOT NULL DEFAULT '{}',
            FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_chat_calls_room ON chat_call_sessions(room_id);
        CREATE INDEX IF NOT EXISTS idx_chat_calls_status ON chat_call_sessions(status);

        CREATE TABLE IF NOT EXISTS chat_call_signals (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            call_id             TEXT NOT NULL,
            from_actor_type     TEXT,
            from_actor_id       TEXT,
            signal_type         TEXT NOT NULL,
            payload_json        TEXT NOT NULL DEFAULT '{}',
            created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (call_id) REFERENCES chat_call_sessions(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_chat_signals_call ON chat_call_signals(call_id, id);

        CREATE TABLE IF NOT EXISTS chat_tts_settings (
            owner_type      TEXT NOT NULL,
            owner_id        TEXT NOT NULL,
            tts_enabled     INTEGER NOT NULL DEFAULT 1,
            read_chat       INTEGER NOT NULL DEFAULT 1,
            read_tips       INTEGER NOT NULL DEFAULT 1,
            read_redemptions INTEGER NOT NULL DEFAULT 1,
            voice           TEXT NOT NULL DEFAULT 'default',
            volume          INTEGER NOT NULL DEFAULT 100,
            rate            INTEGER NOT NULL DEFAULT 100,
            pitch           INTEGER NOT NULL DEFAULT 100,
            max_length      INTEGER NOT NULL DEFAULT 250,
            min_tip_amount  INTEGER NOT NULL DEFAULT 0,
            filter_links    INTEGER NOT NULL DEFAULT 1,
            filter_emotes   INTEGER NOT NULL DEFAULT 1,
            queue_limit     INTEGER NOT NULL DEFAULT 20,
            metadata_json   TEXT NOT NULL DEFAULT '{}',
            updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (owner_type, owner_id)
        );

        CREATE TABLE IF NOT EXISTS chat_audio_queue (
            id              TEXT PRIMARY KEY,
            owner_type      TEXT NOT NULL,
            owner_id        TEXT NOT NULL,
            queue_type      TEXT NOT NULL,
            status          TEXT NOT NULL DEFAULT 'queued',
            priority        INTEGER NOT NULL DEFAULT 0,
            source_type     TEXT NOT NULL DEFAULT 'manual',
            source_id       TEXT,
            requested_by_actor_type TEXT,
            requested_by_actor_id   TEXT,
            text            TEXT,
            audio_url       TEXT,
            media_id        TEXT,
            external_provider TEXT,
            external_url    TEXT,
            playback_json   TEXT NOT NULL DEFAULT '{}',
            metadata_json   TEXT NOT NULL DEFAULT '{}',
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            started_at      DATETIME,
            finished_at     DATETIME
        );
        CREATE INDEX IF NOT EXISTS idx_chat_audio_owner  ON chat_audio_queue(owner_type, owner_id, status);
        CREATE INDEX IF NOT EXISTS idx_chat_audio_status ON chat_audio_queue(status, priority, created_at);

        CREATE TABLE IF NOT EXISTS chat_legacy_map (
            source     TEXT NOT NULL,
            kind       TEXT NOT NULL,
            legacy_id  TEXT NOT NULL,
            new_id     TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (source, kind, legacy_id)
        );
    `;
const LEGACY_BOOTSTRAP_SQL = [
    `ALTER TABLE chat_participants ADD COLUMN last_read_at DATETIME`,
];

function defaultSqlitePath() {
    return path.resolve(__dirname, '..', 'data', 'openvibe-chat.db');
}

function applyLegacyBootstrap(database) {
    for (const sql of LEGACY_BOOTSTRAP_SQL) {
        try {
            database.exec(sql);
        } catch {
            // Existing SQLite installs may already have the column.
        }
    }
}

function createSqliteStore(options) {
    const opts = Object.assign({}, options || {});
    return createLegacySqliteStore({
        serviceName: SERVICE_NAME,
        sqlitePath: opts.sqlitePath || defaultSqlitePath(),
        schemaSql: SCHEMA_SQL,
        afterInit: applyLegacyBootstrap,
    });
}

function createPostgresStore(options) {
    const opts = Object.assign({}, options || {});
    return createLegacyPostgresStore({
        serviceName: SERVICE_NAME,
        databaseUrl: opts.databaseUrl,
        migrationsDir: opts.migrationsDir || POSTGRES_MIGRATIONS_DIR,
        schemaSql: SCHEMA_SQL,
        afterInit: applyLegacyBootstrap,
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
    SERVICE_NAME,
    POSTGRES_MIGRATIONS_DIR,
    SCHEMA_SQL,
    LEGACY_BOOTSTRAP_SQL,
    defaultSqlitePath,
    createSqliteStore,
    createPostgresStore,
});
