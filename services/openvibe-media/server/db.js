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
const {
    createLegacyPersistenceRuntime,
    createLegacyPostgresStore,
    createLegacySqliteStore,
} = require('@openvibe/persistence');

const SERVICE_NAME = 'openvibe-media';
const POSTGRES_MIGRATIONS_DIR = path.resolve(__dirname, 'migrations', 'postgres');
const SCHEMA_SQL = `
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

        CREATE TABLE IF NOT EXISTS media_object_locations (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            media_id          TEXT NOT NULL,
            provider_name     TEXT NOT NULL,
            role              TEXT NOT NULL DEFAULT 'canonical', -- canonical | hot | asset-origin | derivative
            storage_key       TEXT NOT NULL,
            bucket            TEXT,
            endpoint          TEXT,
            region            TEXT,
            public_url        TEXT,
            signed_url_required INTEGER NOT NULL DEFAULT 0,
            checksum_sha256   TEXT,
            size_bytes        INTEGER NOT NULL DEFAULT 0,
            status            TEXT NOT NULL DEFAULT 'active',
            metadata_json     TEXT NOT NULL DEFAULT '{}',
            created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(media_id, provider_name, role, storage_key)
        );
        CREATE INDEX IF NOT EXISTS idx_media_locations_media ON media_object_locations(media_id, role, status);

        CREATE TABLE IF NOT EXISTS media_upload_sessions (
            id                TEXT PRIMARY KEY,
            media_id          TEXT NOT NULL,
            owner_type        TEXT NOT NULL,
            owner_id          TEXT NOT NULL,
            namespace         TEXT NOT NULL,
            provider_name     TEXT NOT NULL,
            storage_key       TEXT NOT NULL,
            upload_mode       TEXT NOT NULL DEFAULT 'multipart',
            status            TEXT NOT NULL DEFAULT 'initialized',
            token             TEXT,
            mime_type         TEXT,
            expected_size_bytes INTEGER,
            metadata_json     TEXT NOT NULL DEFAULT '{}',
            expires_at        DATETIME,
            created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_media_upload_sessions_media ON media_upload_sessions(media_id, status);

        CREATE TABLE IF NOT EXISTS media_upload_parts (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            upload_id         TEXT NOT NULL,
            part_number       INTEGER NOT NULL,
            etag              TEXT,
            size_bytes        INTEGER NOT NULL DEFAULT 0,
            status            TEXT NOT NULL DEFAULT 'signed',
            token             TEXT,
            metadata_json     TEXT NOT NULL DEFAULT '{}',
            created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(upload_id, part_number)
        );
        CREATE INDEX IF NOT EXISTS idx_media_upload_parts_upload ON media_upload_parts(upload_id, status);

        CREATE TABLE IF NOT EXISTS media_size_violations (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            media_id          TEXT NOT NULL,
            violation_type    TEXT NOT NULL,
            detail_json       TEXT NOT NULL DEFAULT '{}',
            created_at        DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS stream_recordings (
            id                TEXT PRIMARY KEY,
            stream_id         TEXT NOT NULL,
            channel_slug      TEXT,
            media_id          TEXT,
            status            TEXT NOT NULL DEFAULT 'recording',
            storage_key       TEXT,
            started_at        DATETIME,
            ended_at          DATETIME,
            metadata_json     TEXT NOT NULL DEFAULT '{}',
            created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_stream_recordings_stream ON stream_recordings(stream_id, status);

        CREATE TABLE IF NOT EXISTS recording_segments (
            id                TEXT PRIMARY KEY,
            recording_id      TEXT NOT NULL,
            segment_index     INTEGER NOT NULL,
            start_ms          INTEGER NOT NULL DEFAULT 0,
            duration_ms       INTEGER NOT NULL DEFAULT 0,
            media_id          TEXT,
            storage_key       TEXT,
            playlist_key      TEXT,
            size_bytes        INTEGER NOT NULL DEFAULT 0,
            status            TEXT NOT NULL DEFAULT 'ready',
            metadata_json     TEXT NOT NULL DEFAULT '{}',
            created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(recording_id, segment_index)
        );

        CREATE TABLE IF NOT EXISTS clip_projects (
            id                TEXT PRIMARY KEY,
            source_stream_id  TEXT,
            source_media_id   TEXT,
            owner_user_id     TEXT,
            title             TEXT,
            status            TEXT NOT NULL DEFAULT 'draft',
            start_ms          INTEGER NOT NULL DEFAULT 0,
            end_ms            INTEGER NOT NULL DEFAULT 0,
            playback_media_id TEXT,
            metadata_json     TEXT NOT NULL DEFAULT '{}',
            created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS clip_exports (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            clip_id           TEXT NOT NULL,
            job_id            TEXT,
            status            TEXT NOT NULL DEFAULT 'queued',
            media_id          TEXT,
            error             TEXT,
            created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS transcript_segments (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            media_id          TEXT NOT NULL,
            start_ms          INTEGER NOT NULL DEFAULT 0,
            end_ms            INTEGER NOT NULL DEFAULT 0,
            text              TEXT NOT NULL,
            confidence        REAL,
            speaker_label     TEXT,
            created_at        DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_transcript_segments_media ON transcript_segments(media_id, start_ms);

        CREATE TABLE IF NOT EXISTS scene_markers (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            media_id          TEXT NOT NULL,
            start_ms          INTEGER NOT NULL DEFAULT 0,
            end_ms            INTEGER NOT NULL DEFAULT 0,
            score             REAL,
            source            TEXT,
            metadata_json     TEXT NOT NULL DEFAULT '{}',
            created_at        DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_scene_markers_media ON scene_markers(media_id, start_ms);

        CREATE TABLE IF NOT EXISTS analysis_candidates (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            media_id          TEXT NOT NULL,
            candidate_type    TEXT NOT NULL,
            start_ms          INTEGER NOT NULL DEFAULT 0,
            end_ms            INTEGER NOT NULL DEFAULT 0,
            score             REAL NOT NULL DEFAULT 0,
            rationale_json    TEXT NOT NULL DEFAULT '{}',
            status            TEXT NOT NULL DEFAULT 'queued',
            created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_analysis_candidates_media ON analysis_candidates(media_id, candidate_type, status);
    `;

function defaultSqlitePath() {
    return path.resolve(__dirname, '..', 'data', 'openvibe-media.db');
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
    defaultSqlitePath,
    createSqliteStore,
    createPostgresStore,
});
