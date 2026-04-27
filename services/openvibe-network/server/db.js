'use strict';

// openvibe-network — SQLite persistence for the kernel control plane.
//
// Tables (all migration-safe via CREATE TABLE IF NOT EXISTS):
//   user_modules         — namespaced, owner-attested, versioned per-user data
//   user_modules_history — append-only changelog for user_modules
//   service_registry     — service identity + URLs + declared capabilities/topics + heartbeat
//   capability_registry  — capability id + owner service + version + schemas + policy
//   contract_registry    — schema/contract definitions (events, modules, media, ...)
//   url_registry_overlay — OpenVibe-only URL registry keys (extends hobo-tools registry)
//   audit_log            — every mutating action across the kernel

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { warnIfUnsupported } = require('@openvibe/sdk');

let dbInstance = null;
let persistenceDescriptor = null;

function init(dbPath) {
    persistenceDescriptor = warnIfUnsupported('openvibe-network', dbPath);
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    db.exec(`
        CREATE TABLE IF NOT EXISTS user_modules (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id      TEXT NOT NULL,
            namespace    TEXT NOT NULL,
            owner        TEXT NOT NULL,         -- service id authoritative for this row
            schema_version INTEGER NOT NULL DEFAULT 1,
            data_json    TEXT NOT NULL,
            updated_by_actor_type TEXT,
            updated_by_actor_id   TEXT,
            created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, namespace)
        );
        CREATE INDEX IF NOT EXISTS idx_user_modules_user ON user_modules(user_id);

        CREATE TABLE IF NOT EXISTS user_modules_history (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id         TEXT NOT NULL,
            namespace       TEXT NOT NULL,
            schema_version  INTEGER NOT NULL,
            data_json       TEXT NOT NULL,
            actor_type      TEXT,
            actor_id        TEXT,
            recorded_at     DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_user_modules_history ON user_modules_history(user_id, namespace, recorded_at DESC);

        CREATE TABLE IF NOT EXISTS service_registry (
            service_id      TEXT PRIMARY KEY,
            display_name    TEXT NOT NULL,
            description     TEXT,
            internal_url    TEXT,
            public_url      TEXT,
            capabilities_json TEXT NOT NULL DEFAULT '[]',
            topics_json     TEXT NOT NULL DEFAULT '[]',
            metadata_json   TEXT NOT NULL DEFAULT '{}',
            last_heartbeat  DATETIME,
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS capability_registry (
            capability_id   TEXT NOT NULL,
            version         INTEGER NOT NULL DEFAULT 1,
            owner_service   TEXT NOT NULL,
            description     TEXT,
            input_schema_json  TEXT NOT NULL DEFAULT '{}',
            output_schema_json TEXT NOT NULL DEFAULT '{}',
            policy_json     TEXT NOT NULL DEFAULT '{}',
            rate_limit_json TEXT NOT NULL DEFAULT '{}',
            emits_topics_json TEXT NOT NULL DEFAULT '[]',
            deprecated      INTEGER NOT NULL DEFAULT 0,
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (capability_id, version)
        );

        CREATE TABLE IF NOT EXISTS contract_registry (
            contract_id     TEXT NOT NULL,        -- e.g. 'event:auth.token.issued' or 'module:live.profile'
            version         INTEGER NOT NULL DEFAULT 1,
            kind            TEXT NOT NULL,        -- 'event' | 'capability' | 'user_module' | 'media' | 'service_manifest'
            owner_service   TEXT NOT NULL,
            schema_json     TEXT NOT NULL,
            description     TEXT,
            deprecated      INTEGER NOT NULL DEFAULT 0,
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (contract_id, version)
        );

        CREATE TABLE IF NOT EXISTS url_registry_overlay (
            key         TEXT PRIMARY KEY,
            value       TEXT,
            description TEXT,
            updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS audit_log (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            actor_type  TEXT,
            actor_id    TEXT,
            action      TEXT NOT NULL,
            resource    TEXT NOT NULL,
            outcome     TEXT NOT NULL,        -- 'allow' | 'deny' | 'error'
            detail_json TEXT,
            recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor_type, actor_id, recorded_at DESC);
    `);

    dbInstance = db;
    return db;
}

function get() {
    if (!dbInstance) throw new Error('network db: init() not called');
    return dbInstance;
}

function describePersistence() {
    return persistenceDescriptor || { service: 'openvibe-network', mode: 'sqlite', database_url_configured: false };
}

module.exports = { init, get, describePersistence };
