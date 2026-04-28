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
const fs = require('fs');
const Database = require('better-sqlite3');
const { warnIfUnsupported } = require('@openvibe/sdk');

let dbInstance = null;
let persistenceDescriptor = null;

function init(dbPath) {
    persistenceDescriptor = warnIfUnsupported('openvibe-events', dbPath);
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    db.exec(`
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
    `);

    dbInstance = db;
    return db;
}

function get() {
    if (!dbInstance) throw new Error('events db: init() not called');
    return dbInstance;
}

function describePersistence() {
    return persistenceDescriptor || { service: 'openvibe-events', mode: 'sqlite', database_url_configured: false };
}

module.exports = { init, get, describePersistence };
