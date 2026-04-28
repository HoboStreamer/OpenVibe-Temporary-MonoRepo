'use strict';

// openvibe-media — SQLite persistence.
//
// Tables (migration-safe via CREATE TABLE IF NOT EXISTS):
//   media_objects         — every uploaded asset, owner-attested + namespaced
//   media_derivatives     — thumbnails, transcodes, waveforms, HLS variants, clip→VOD links
//   media_jobs            — async processing work (thumbnail, transcode, ...)
//   media_quotas          — per (owner_type, owner_id, namespace) quota override
//   media_usage           — aggregated bytes/file counts per (owner_type, owner_id, namespace)
//   media_lifecycle_audit — append-only audit log of status / tier transitions
//   media_legacy_map      — maps legacy HoboStreamer ids (vods/clips/thumbnails) to media_id

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { warnIfUnsupported } = require('@openvibe/sdk');

let dbInstance = null;
let persistenceDescriptor = null;

function init(dbPath) {
    persistenceDescriptor = warnIfUnsupported('openvibe-media', dbPath);
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    db.exec(`
        CREATE TABLE IF NOT EXISTS media_objects (
            id              TEXT PRIMARY KEY,
            owner_type      TEXT NOT NULL,
            owner_id        TEXT NOT NULL,
            namespace       TEXT NOT NULL,
            type            TEXT NOT NULL,
            status          TEXT NOT NULL DEFAULT 'initialized',
            visibility      TEXT NOT NULL DEFAULT 'public',
            storage_tier    TEXT NOT NULL DEFAULT 'hot',
            storage_provider TEXT NOT NULL DEFAULT 'local',
            storage_key     TEXT,
            public_url      TEXT,
            cdn_url         TEXT,
            size_bytes      INTEGER NOT NULL DEFAULT 0,
            mime_type       TEXT,
            sha256          TEXT,
            metadata_json   TEXT NOT NULL DEFAULT '{}',
            created_by_actor_type TEXT,
            created_by_actor_id   TEXT,
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            deleted_at      DATETIME
        );
        CREATE INDEX IF NOT EXISTS idx_media_owner    ON media_objects(owner_type, owner_id);
        CREATE INDEX IF NOT EXISTS idx_media_ns       ON media_objects(namespace);
        CREATE INDEX IF NOT EXISTS idx_media_status   ON media_objects(status);
        CREATE INDEX IF NOT EXISTS idx_media_visible  ON media_objects(visibility);
        CREATE INDEX IF NOT EXISTS idx_media_sha256   ON media_objects(sha256);

        CREATE TABLE IF NOT EXISTS media_derivatives (
            id              TEXT PRIMARY KEY,
            parent_media_id TEXT NOT NULL,
            kind            TEXT NOT NULL,                -- 'thumbnail' | 'transcode' | 'waveform' | 'hls' | 'preview' | 'clip-of'
            label           TEXT,                          -- e.g. '720p', 'medium', 'jpeg'
            storage_provider TEXT NOT NULL DEFAULT 'local',
            storage_key     TEXT,
            public_url      TEXT,
            mime_type       TEXT,
            size_bytes      INTEGER NOT NULL DEFAULT 0,
            metadata_json   TEXT NOT NULL DEFAULT '{}',
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (parent_media_id) REFERENCES media_objects(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_derivative_parent ON media_derivatives(parent_media_id);
        CREATE INDEX IF NOT EXISTS idx_derivative_kind   ON media_derivatives(kind);

        CREATE TABLE IF NOT EXISTS media_jobs (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            media_id        TEXT NOT NULL,
            kind            TEXT NOT NULL,                -- 'image_thumbnail' | 'video_thumbnail' | 'vod_metadata' | 'clip_metadata'
            state           TEXT NOT NULL DEFAULT 'pending',
            attempts        INTEGER NOT NULL DEFAULT 0,
            last_error      TEXT,
            payload_json    TEXT NOT NULL DEFAULT '{}',
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            next_attempt_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_jobs_state ON media_jobs(state, next_attempt_at);
        CREATE INDEX IF NOT EXISTS idx_jobs_media ON media_jobs(media_id);

        CREATE TABLE IF NOT EXISTS media_quotas (
            id                   INTEGER PRIMARY KEY AUTOINCREMENT,
            owner_type           TEXT NOT NULL,
            owner_id             TEXT NOT NULL,
            namespace            TEXT NOT NULL,
            max_storage_bytes    INTEGER NOT NULL DEFAULT 0,
            max_upload_bytes     INTEGER NOT NULL DEFAULT 0,
            max_file_count       INTEGER NOT NULL DEFAULT 0,
            allowed_mime_prefixes_json TEXT NOT NULL DEFAULT '[]',
            allowed_types_json   TEXT NOT NULL DEFAULT '[]',
            unlimited            INTEGER NOT NULL DEFAULT 0,
            created_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(owner_type, owner_id, namespace)
        );

        CREATE TABLE IF NOT EXISTS media_usage (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            owner_type      TEXT NOT NULL,
            owner_id        TEXT NOT NULL,
            namespace       TEXT NOT NULL,
            total_bytes     INTEGER NOT NULL DEFAULT 0,
            hot_bytes       INTEGER NOT NULL DEFAULT 0,
            warm_bytes      INTEGER NOT NULL DEFAULT 0,
            cold_bytes      INTEGER NOT NULL DEFAULT 0,
            file_count      INTEGER NOT NULL DEFAULT 0,
            updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(owner_type, owner_id, namespace)
        );

        CREATE TABLE IF NOT EXISTS media_lifecycle_audit (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            media_id    TEXT NOT NULL,
            from_status TEXT,
            to_status   TEXT,
            from_tier   TEXT,
            to_tier     TEXT,
            actor_type  TEXT,
            actor_id    TEXT,
            detail_json TEXT NOT NULL DEFAULT '{}',
            recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_lifecycle_media ON media_lifecycle_audit(media_id, recorded_at DESC);

        CREATE TABLE IF NOT EXISTS media_legacy_map (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            source       TEXT NOT NULL,        -- 'hobostreamer'
            kind         TEXT NOT NULL,        -- 'vod' | 'clip' | 'thumbnail' | 'paste'
            legacy_id    TEXT NOT NULL,
            media_id     TEXT NOT NULL,
            created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(source, kind, legacy_id)
        );
    `);

    dbInstance = db;
    return db;
}

function get() {
    if (!dbInstance) throw new Error('media db: init() not called');
    return dbInstance;
}

function describePersistence() {
    return persistenceDescriptor || { service: 'openvibe-media', mode: 'sqlite', database_url_configured: false };
}

module.exports = { init, get, describePersistence };
