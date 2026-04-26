'use strict';

// openvibe-live — SQLite persistence.
// SSR-friendly read-model derived from stream.events (mirrored).

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

let dbInstance = null;

function init(dbPath) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    db.exec(`
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
    `);

    dbInstance = db;
    return db;
}

function get() {
    if (!dbInstance) throw new Error('openvibe-live db: init() not called');
    return dbInstance;
}

module.exports = { init, get };
