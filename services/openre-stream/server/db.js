'use strict';

// openre-stream — SQLite persistence.
//
// Tables:
//   channels             — registered streamer channels (slug → owner user)
//   streams              — per-broadcast records (key, started_at, ended_at, vod_media_id)
//   ingest_sessions      — most recent transport-level ingest connection per stream
//   restream_destinations — out-bound restream targets (twitch, youtube, ...)
//   output_state         — current per-destination output state for each stream
//   mirror_state         — per-stream "mirrored to openvibe.live" status
//   legacy_id_map        — HoboStreamer (vods/clips) → openre stream/vod mapping

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
        CREATE TABLE IF NOT EXISTS channels (
            id          TEXT PRIMARY KEY,
            slug        TEXT NOT NULL UNIQUE,
            owner_user_id TEXT NOT NULL,
            display_name TEXT,
            metadata_json TEXT NOT NULL DEFAULT '{}',
            created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS streams (
            id            TEXT PRIMARY KEY,
            channel_id    TEXT NOT NULL,
            stream_key    TEXT,
            protocol      TEXT NOT NULL DEFAULT 'rtmp',
            status        TEXT NOT NULL DEFAULT 'created',  -- created/started/ended/aborted
            title         TEXT,
            category      TEXT,
            metadata_json TEXT NOT NULL DEFAULT '{}',
            started_at    DATETIME,
            ended_at      DATETIME,
            vod_media_id  TEXT,
            created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_streams_channel ON streams(channel_id);
        CREATE INDEX IF NOT EXISTS idx_streams_status ON streams(status);

        CREATE TABLE IF NOT EXISTS ingest_sessions (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            stream_id    TEXT NOT NULL,
            protocol     TEXT NOT NULL,
            connected_at DATETIME,
            disconnected_at DATETIME,
            client_addr  TEXT,
            details_json TEXT NOT NULL DEFAULT '{}',
            FOREIGN KEY (stream_id) REFERENCES streams(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS restream_destinations (
            id           TEXT PRIMARY KEY,
            owner_user_id TEXT NOT NULL,
            kind         TEXT NOT NULL,             -- 'twitch' | 'youtube' | 'kick' | 'rtmp'
            label        TEXT,
            target_url   TEXT NOT NULL,
            target_key   TEXT,
            enabled      INTEGER NOT NULL DEFAULT 1,
            metadata_json TEXT NOT NULL DEFAULT '{}',
            created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS output_state (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            stream_id     TEXT NOT NULL,
            destination_id TEXT NOT NULL,
            state         TEXT NOT NULL DEFAULT 'pending',   -- pending/started/failed/stopped
            last_error    TEXT,
            updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(stream_id, destination_id),
            FOREIGN KEY (stream_id) REFERENCES streams(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS mirror_state (
            stream_id     TEXT PRIMARY KEY,
            mirrored_at   DATETIME,
            live_url      TEXT,
            channel_slug  TEXT,
            details_json  TEXT NOT NULL DEFAULT '{}',
            FOREIGN KEY (stream_id) REFERENCES streams(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS legacy_id_map (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            source      TEXT NOT NULL,
            kind        TEXT NOT NULL,    -- 'channel' | 'stream' | 'vod'
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
    if (!dbInstance) throw new Error('openre-stream db: init() not called');
    return dbInstance;
}

module.exports = { init, get };
