'use strict';

const path = require('path');
const {
    createLegacyPersistenceRuntime,
    describeBootstrapSource,
    createLegacyPostgresStore,
    createLegacySqliteStore,
} = require('@openvibe/persistence');

const SERVICE_NAME = 'openvibe-community';
const POSTGRES_MIGRATIONS_DIR = path.resolve(__dirname, 'migrations', 'postgres');
const SCHEMA_SQL = `
        CREATE TABLE IF NOT EXISTS community_spaces (
            id              TEXT PRIMARY KEY,
            slug            TEXT NOT NULL UNIQUE,
            name            TEXT NOT NULL,
            description     TEXT,
            visibility      TEXT NOT NULL DEFAULT 'public',
            owner_type      TEXT,
            owner_id        TEXT,
            created_by_actor_type TEXT,
            created_by_actor_id   TEXT,
            metadata_json   TEXT NOT NULL DEFAULT '{}',
            archived_at     DATETIME,
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS community_categories (
            id              TEXT PRIMARY KEY,
            community_id    TEXT NOT NULL,
            slug            TEXT NOT NULL,
            name            TEXT NOT NULL,
            description     TEXT,
            sort_order      INTEGER NOT NULL DEFAULT 0,
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (community_id) REFERENCES community_spaces(id) ON DELETE CASCADE,
            UNIQUE (community_id, slug)
        );

        CREATE TABLE IF NOT EXISTS community_threads (
            id              TEXT PRIMARY KEY,
            community_id    TEXT,
            category_id     TEXT,
            slug            TEXT,
            title           TEXT NOT NULL,
            thread_type     TEXT NOT NULL DEFAULT 'discussion',
            status          TEXT NOT NULL DEFAULT 'open',
            visibility      TEXT NOT NULL DEFAULT 'public',
            ref_type        TEXT,
            ref_id          TEXT,
            created_by_actor_type TEXT,
            created_by_actor_id   TEXT,
            metadata_json   TEXT NOT NULL DEFAULT '{}',
            last_activity_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_community_threads_community ON community_threads(community_id);
        CREATE INDEX IF NOT EXISTS idx_community_threads_category  ON community_threads(category_id);
        CREATE INDEX IF NOT EXISTS idx_community_threads_ref        ON community_threads(ref_type, ref_id);
        CREATE INDEX IF NOT EXISTS idx_community_threads_status     ON community_threads(status);

        CREATE TABLE IF NOT EXISTS community_posts (
            id              TEXT PRIMARY KEY,
            thread_id       TEXT NOT NULL,
            parent_post_id  TEXT,
            author_type     TEXT,
            author_id       TEXT,
            body            TEXT NOT NULL,
            body_format     TEXT NOT NULL DEFAULT 'markdown',
            source_type     TEXT NOT NULL DEFAULT 'openvibe',
            source_id       TEXT,
            metadata_json   TEXT NOT NULL DEFAULT '{}',
            edited_at       DATETIME,
            deleted_at      DATETIME,
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (thread_id) REFERENCES community_threads(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_community_posts_thread ON community_posts(thread_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_community_posts_source ON community_posts(source_type, source_id);

        CREATE TABLE IF NOT EXISTS community_pastes (
            id              TEXT PRIMARY KEY,
            slug            TEXT NOT NULL UNIQUE,
            title           TEXT,
            body            TEXT NOT NULL,
            language        TEXT,
            visibility      TEXT NOT NULL DEFAULT 'public',
            expires_at      DATETIME,
            created_by_actor_type TEXT,
            created_by_actor_id   TEXT,
            view_count      INTEGER NOT NULL DEFAULT 0,
            metadata_json   TEXT NOT NULL DEFAULT '{}',
            deleted_at      DATETIME,
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS community_attachments (
            id              TEXT PRIMARY KEY,
            attached_to_type TEXT NOT NULL,
            attached_to_id   TEXT NOT NULL,
            media_id         TEXT NOT NULL,
            attachment_type  TEXT,
            sort_order       INTEGER NOT NULL DEFAULT 0,
            created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_community_attachments_target ON community_attachments(attached_to_type, attached_to_id);
        CREATE INDEX IF NOT EXISTS idx_community_attachments_media  ON community_attachments(media_id);

        CREATE TABLE IF NOT EXISTS community_discord_relays (
            id                  TEXT PRIMARY KEY,
            community_id        TEXT,
            discord_guild_id    TEXT,
            discord_channel_id  TEXT NOT NULL,
            openvibe_category_id TEXT,
            openvibe_thread_id   TEXT,
            relay_direction      TEXT NOT NULL DEFAULT 'discord_to_openvibe',
            enabled              INTEGER NOT NULL DEFAULT 1,
            last_synced_at       DATETIME,
            metadata_json        TEXT NOT NULL DEFAULT '{}',
            created_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at           DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_relays_channel ON community_discord_relays(discord_channel_id);

        CREATE TABLE IF NOT EXISTS community_discord_messages (
            discord_message_id   TEXT PRIMARY KEY,
            discord_channel_id   TEXT,
            openvibe_post_id     TEXT,
            openvibe_thread_id   TEXT,
            relay_direction      TEXT NOT NULL DEFAULT 'discord_to_openvibe',
            metadata_json        TEXT NOT NULL DEFAULT '{}',
            created_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at           DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_discord_msgs_post ON community_discord_messages(openvibe_post_id);

        CREATE TABLE IF NOT EXISTS community_legacy_map (
            source     TEXT NOT NULL,
            kind       TEXT NOT NULL,
            legacy_id  TEXT NOT NULL,
            new_id     TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (source, kind, legacy_id)
        );

        -- Phase 16 — paste version history. Append-only; one row per
        -- create/update so HoboStreamer paste imports retain edit lineage.
        CREATE TABLE IF NOT EXISTS community_paste_versions (
            id              TEXT PRIMARY KEY,
            paste_id        TEXT NOT NULL,
            version         INTEGER NOT NULL,
            title           TEXT,
            body            TEXT NOT NULL,
            language        TEXT,
            edited_by_actor_type TEXT,
            edited_by_actor_id   TEXT,
            change_summary  TEXT,
            metadata_json   TEXT NOT NULL DEFAULT '{}',
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (paste_id, version),
            FOREIGN KEY (paste_id) REFERENCES community_pastes(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_community_paste_versions_paste
            ON community_paste_versions(paste_id, version DESC);

        -- Phase 16 — Discord relay audit. Captures inbound, outbound,
        -- dedupe-skipped, and failed relay attempts so the runtime tab and
        -- readiness reports show truthful relay activity rather than counting
        -- messages alone.
        CREATE TABLE IF NOT EXISTS community_relay_audit (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            relay_direction     TEXT NOT NULL,
            outcome             TEXT NOT NULL,
            relay_id            TEXT,
            discord_channel_id  TEXT,
            discord_message_id  TEXT,
            openvibe_post_id    TEXT,
            openvibe_thread_id  TEXT,
            idempotency_key     TEXT,
            error_message       TEXT,
            metadata_json       TEXT NOT NULL DEFAULT '{}',
            recorded_at         DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_community_relay_audit_dir
            ON community_relay_audit(relay_direction, recorded_at DESC);
        CREATE INDEX IF NOT EXISTS idx_community_relay_audit_outcome
            ON community_relay_audit(outcome, recorded_at DESC);
    `;

function defaultSqlitePath() {
    return path.resolve(__dirname, '..', 'data', 'openvibe-community.db');
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
    SERVICE_NAME,
    POSTGRES_MIGRATIONS_DIR,
    SCHEMA_SQL,
    defaultSqlitePath,
    createSqliteStore,
    createPostgresStore,
});
