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
const LEGACY_SCHEMA_REPAIRS = {
    events: [
        ['event_id', 'TEXT'],
        ['trace_id', 'TEXT'],
        ['topic', 'TEXT'],
        ['event_type', 'TEXT'],
        ['version', 'INTEGER DEFAULT 1'],
        ['source', 'TEXT'],
        ['actor_type', 'TEXT'],
        ['actor_id', 'TEXT'],
        ['timestamp', 'TEXT'],
        ['payload_json', "TEXT DEFAULT '{}'"],
        ['created_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP'],
    ],
    subscriptions: [
        ['subscription_id', 'TEXT'],
        ['consumer', 'TEXT'],
        ['topic', 'TEXT'],
        ['event_type', 'TEXT'],
        ['delivery', 'TEXT'],
        ['target_url', 'TEXT'],
        ['internal_key', 'TEXT'],
        ['active', 'INTEGER DEFAULT 1'],
        ['created_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP'],
    ],
    delivery_queue: [
        ['event_id', 'TEXT'],
        ['subscription_id', 'TEXT'],
        ['state', "TEXT DEFAULT 'pending'"],
        ['attempts', 'INTEGER DEFAULT 0'],
        ['next_attempt_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP'],
        ['last_error', 'TEXT'],
        ['created_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP'],
        ['updated_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP'],
    ],
    dead_letters: [
        ['event_id', 'TEXT'],
        ['subscription_id', 'TEXT'],
        ['attempts', 'INTEGER DEFAULT 0'],
        ['last_error', 'TEXT'],
        ['failed_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP'],
    ],
};
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
const LEGACY_BOOTSTRAP_SQL = [
    `ALTER TABLE events ADD COLUMN IF NOT EXISTS event_id TEXT`,
    `ALTER TABLE events ADD COLUMN IF NOT EXISTS trace_id TEXT`,
    `ALTER TABLE events ADD COLUMN IF NOT EXISTS topic TEXT`,
    `ALTER TABLE events ADD COLUMN IF NOT EXISTS event_type TEXT`,
    `ALTER TABLE events ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1`,
    `ALTER TABLE events ADD COLUMN IF NOT EXISTS source TEXT`,
    `ALTER TABLE events ADD COLUMN IF NOT EXISTS actor_type TEXT`,
    `ALTER TABLE events ADD COLUMN IF NOT EXISTS actor_id TEXT`,
    `ALTER TABLE events ADD COLUMN IF NOT EXISTS timestamp TEXT`,
    `ALTER TABLE events ADD COLUMN IF NOT EXISTS payload_json TEXT DEFAULT '{}'`,
    `ALTER TABLE events ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`,
    `UPDATE events
        SET event_id = COALESCE(event_id, 'evt_legacy_' || id::TEXT),
            trace_id = COALESCE(trace_id, 'trc_legacy_' || id::TEXT),
            topic = COALESCE(topic, 'legacy'),
            event_type = COALESCE(event_type, 'legacy.event'),
            version = COALESCE(version, 1),
            source = COALESCE(source, 'legacy'),
            timestamp = COALESCE(timestamp, created_at::TEXT, CURRENT_TIMESTAMP::TEXT),
            payload_json = COALESCE(payload_json, '{}')`,
    `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS subscription_id TEXT`,
    `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS consumer TEXT`,
    `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS topic TEXT`,
    `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS event_type TEXT`,
    `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS delivery TEXT`,
    `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS target_url TEXT`,
    `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS internal_key TEXT`,
    `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS active INTEGER DEFAULT 1`,
    `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`,
    `UPDATE subscriptions
        SET subscription_id = COALESCE(subscription_id, 'sub_legacy_' || id::TEXT),
            consumer = COALESCE(consumer, 'legacy'),
            topic = COALESCE(topic, 'legacy'),
            delivery = COALESCE(delivery, 'log'),
            active = COALESCE(active, 1)`,
    `ALTER TABLE delivery_queue ADD COLUMN IF NOT EXISTS event_id TEXT`,
    `ALTER TABLE delivery_queue ADD COLUMN IF NOT EXISTS subscription_id TEXT`,
    `ALTER TABLE delivery_queue ADD COLUMN IF NOT EXISTS state TEXT DEFAULT 'pending'`,
    `ALTER TABLE delivery_queue ADD COLUMN IF NOT EXISTS attempts INTEGER DEFAULT 0`,
    `ALTER TABLE delivery_queue ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`,
    `ALTER TABLE delivery_queue ADD COLUMN IF NOT EXISTS last_error TEXT`,
    `ALTER TABLE delivery_queue ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`,
    `ALTER TABLE delivery_queue ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`,
    `UPDATE delivery_queue
        SET event_id = COALESCE(event_id, 'evt_legacy_queue_' || id::TEXT),
            subscription_id = COALESCE(subscription_id, 'sub_legacy_queue_' || id::TEXT),
            state = COALESCE(state, 'pending'),
            attempts = COALESCE(attempts, 0),
            next_attempt_at = COALESCE(next_attempt_at, CURRENT_TIMESTAMP)`,
    `ALTER TABLE dead_letters ADD COLUMN IF NOT EXISTS event_id TEXT`,
    `ALTER TABLE dead_letters ADD COLUMN IF NOT EXISTS subscription_id TEXT`,
    `ALTER TABLE dead_letters ADD COLUMN IF NOT EXISTS attempts INTEGER DEFAULT 0`,
    `ALTER TABLE dead_letters ADD COLUMN IF NOT EXISTS last_error TEXT`,
    `ALTER TABLE dead_letters ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`,
    `UPDATE dead_letters
        SET event_id = COALESCE(event_id, 'evt_legacy_dlq_' || id::TEXT),
            subscription_id = COALESCE(subscription_id, 'sub_legacy_dlq_' || id::TEXT),
            attempts = COALESCE(attempts, 0),
            failed_at = COALESCE(failed_at, CURRENT_TIMESTAMP)`,
];

function listColumns(database, tableName) {
    try {
        return database.prepare(`
            SELECT column_name AS name
            FROM information_schema.columns
            WHERE table_schema = CURRENT_SCHEMA()
              AND table_name = ?
            ORDER BY ordinal_position
        `).all(String(tableName)).map((row) => String(row.name));
    } catch {
        return database.prepare(`PRAGMA table_info(${String(tableName)})`).all().map((row) => String(row.name));
    }
}

function ensureColumns(database, tableName, columns) {
    const existing = new Set(listColumns(database, tableName));
    for (const [columnName, definition] of columns || []) {
        if (existing.has(columnName)) continue;
        database.exec(`ALTER TABLE ${String(tableName)} ADD COLUMN ${String(columnName)} ${String(definition)}`);
    }
}

function repairLegacySchema(database) {
    if (!database || typeof database.exec !== 'function') return;
    ensureColumns(database, 'events', LEGACY_SCHEMA_REPAIRS.events);
    ensureColumns(database, 'subscriptions', LEGACY_SCHEMA_REPAIRS.subscriptions);
    ensureColumns(database, 'delivery_queue', LEGACY_SCHEMA_REPAIRS.delivery_queue);
    ensureColumns(database, 'dead_letters', LEGACY_SCHEMA_REPAIRS.dead_letters);

    database.exec(`
        UPDATE events
        SET event_id = COALESCE(event_id, 'evt_legacy_' || id),
            trace_id = COALESCE(trace_id, 'trc_legacy_' || id),
            topic = COALESCE(topic, 'legacy'),
            event_type = COALESCE(event_type, 'legacy.event'),
            version = COALESCE(version, 1),
            source = COALESCE(source, 'legacy'),
            timestamp = COALESCE(timestamp, created_at, CURRENT_TIMESTAMP),
            payload_json = COALESCE(payload_json, '{}')
    `);
    database.exec(`
        UPDATE subscriptions
        SET subscription_id = COALESCE(subscription_id, 'sub_legacy_' || id),
            consumer = COALESCE(consumer, 'legacy'),
            topic = COALESCE(topic, 'legacy'),
            delivery = COALESCE(delivery, 'log'),
            active = COALESCE(active, 1)
    `);
    database.exec(`
        UPDATE delivery_queue
        SET event_id = COALESCE(event_id, 'evt_legacy_queue_' || id),
            subscription_id = COALESCE(subscription_id, 'sub_legacy_queue_' || id),
            state = COALESCE(state, 'pending'),
            attempts = COALESCE(attempts, 0),
            next_attempt_at = COALESCE(next_attempt_at, CURRENT_TIMESTAMP)
    `);
    database.exec(`
        UPDATE dead_letters
        SET event_id = COALESCE(event_id, 'evt_legacy_dlq_' || id),
            subscription_id = COALESCE(subscription_id, 'sub_legacy_dlq_' || id),
            attempts = COALESCE(attempts, 0),
            failed_at = COALESCE(failed_at, CURRENT_TIMESTAMP)
    `);
}

function defaultSqlitePath() {
    return path.resolve(__dirname, '..', 'data', 'openvibe-events.db');
}

function createSqliteStore(options) {
    const opts = Object.assign({}, options || {});
    return createLegacySqliteStore({
        serviceName: SERVICE_NAME,
        sqlitePath: opts.sqlitePath || defaultSqlitePath(),
        schemaSql: SCHEMA_SQL,
        afterInit: repairLegacySchema,
    });
}

function createPostgresStore(options) {
    const opts = Object.assign({}, options || {});
    return createLegacyPostgresStore({
        serviceName: SERVICE_NAME,
        databaseUrl: opts.databaseUrl,
        migrationsDir: opts.migrationsDir || POSTGRES_MIGRATIONS_DIR,
        schemaSql: SCHEMA_SQL,
        afterInit: repairLegacySchema,
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
