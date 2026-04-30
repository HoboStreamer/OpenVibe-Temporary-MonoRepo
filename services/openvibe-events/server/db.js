'use strict';

// openvibe-events — SQLite-backed persistence layer.
//
// Tables:
//   events            — append-only event log (one row per envelope)
//   subscriptions     — subscriber registrations (topic + optional filters + delivery target)
//   delivery_queue    — work items: one row per (event, subscription) waiting to be delivered
//   dead_letters      — terminal failures (max attempts exceeded or unrecoverable)
//
// All schema changes use `CREATE TABLE IF NOT EXISTS` and conditional
// ALTER TABLE migrations so older installs keep working.

const path = require('path');
const {
    createLegacyPersistenceRuntime,
    describeBootstrapSource,
    createLegacyPostgresStore,
    createLegacySqliteStore,
} = require('@openvibe/persistence');

const SERVICE_NAME = 'openvibe-events';
const POSTGRES_MIGRATIONS_DIR = path.resolve(__dirname, 'migrations', 'postgres');
const SCHEMA_SQL = `
        CREATE TABLE IF NOT EXISTS events (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id     TEXT UNIQUE NOT NULL,
            trace_id     TEXT NOT NULL,
            topic        TEXT NOT NULL,
            event_type   TEXT NOT NULL,
            version      INTEGER NOT NULL DEFAULT 1,
            source       TEXT NOT NULL,
            actor_type   TEXT,
            actor_id     TEXT,
            timestamp    TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_events_topic_time ON events(topic, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
        CREATE INDEX IF NOT EXISTS idx_events_trace ON events(trace_id);

        CREATE TABLE IF NOT EXISTS subscriptions (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            subscription_id TEXT UNIQUE NOT NULL,
            consumer        TEXT NOT NULL,         -- service id or mod id
            topic           TEXT NOT NULL,
            event_type      TEXT,                  -- optional exact-match filter
            delivery        TEXT NOT NULL,         -- 'log' | 'http'
            target_url      TEXT,                  -- required when delivery='http'
            internal_key    TEXT,                  -- optional shared secret to send as X-Internal-Key
            active          INTEGER NOT NULL DEFAULT 1,
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_subscriptions_topic_active ON subscriptions(topic, active);

        CREATE TABLE IF NOT EXISTS delivery_queue (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id        TEXT NOT NULL,
            subscription_id TEXT NOT NULL,
            state           TEXT NOT NULL DEFAULT 'pending',  -- pending | in_flight | done | failed
            attempts        INTEGER NOT NULL DEFAULT 0,
            next_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            last_error      TEXT,
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(event_id, subscription_id)
        );
        CREATE INDEX IF NOT EXISTS idx_queue_pending ON delivery_queue(state, next_attempt_at);

        CREATE TABLE IF NOT EXISTS dead_letters (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id        TEXT NOT NULL,
            subscription_id TEXT NOT NULL,
            attempts        INTEGER NOT NULL,
            last_error      TEXT,
            failed_at       DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_dlq_event ON dead_letters(event_id);
    `;

function defaultSqlitePath() {
    return path.resolve(__dirname, '..', 'data', 'openvibe-events.db');
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
