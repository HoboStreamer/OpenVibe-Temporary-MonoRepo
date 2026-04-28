'use strict';

// openvibe-chat — SQLite persistence (migration-safe via CREATE IF NOT EXISTS).

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { warnIfUnsupported } = require('@openvibe/sdk');

let dbInstance = null;
let persistenceDescriptor = null;

function init(dbPath) {
    persistenceDescriptor = warnIfUnsupported('openvibe-chat', dbPath);
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    db.exec(`
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
    `);

    try {
        db.exec(`ALTER TABLE chat_participants ADD COLUMN last_read_at DATETIME`);
    } catch {
        // already present
    }

    dbInstance = db;
    return db;
}

function get() {
    if (!dbInstance) throw new Error('chat db not initialized — call db.init(path) first');
    return dbInstance;
}

function describePersistence() {
    return persistenceDescriptor || { service: 'openvibe-chat', mode: 'sqlite', database_url_configured: false };
}

module.exports = { init, get, describePersistence };
