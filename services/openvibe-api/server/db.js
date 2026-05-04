'use strict';

/**
 * db.js — openvibe-api SQLite persistence
 *
 * Manages a single `api_keys` table for hashed API key storage.
 * Mirrors in services/openvibe-api/server/migrations/postgres/001_api_keys.sql
 */

const path     = require('path');
const crypto   = require('crypto');
const Database = require('better-sqlite3');
const { createServiceRuntime: _unused, ..._ } = (() => { try { return require('@openvibe/runtime'); } catch { return {}; } })();

// ── constants ─────────────────────────────────────────────────────────────────
const SERVICE_NAME = 'openvibe-api';
const POSTGRES_MIGRATIONS_DIR = path.resolve(__dirname, 'migrations', 'postgres');

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS api_keys (
    id          TEXT PRIMARY KEY,
    key_hash    TEXT NOT NULL UNIQUE,
    user_id     TEXT NOT NULL,
    name        TEXT NOT NULL,
    scopes      TEXT NOT NULL DEFAULT '[]',
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    last_used_at TEXT,
    revoked_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id   ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash  ON api_keys(key_hash);
`;

// ── runtime store ─────────────────────────────────────────────────────────────
let _db = null;

function init(dbPath) {
    if (_db) return _db;
    const resolved = dbPath || defaultSqlitePath();
    _db = new Database(resolved);
    _db.pragma('journal_mode = WAL');
    _db.exec(SCHEMA_SQL);
    return _db;
}

function getDb() {
    if (!_db) throw new Error('[openvibe-api/db] not initialized — call init() first');
    return _db;
}

function defaultSqlitePath() {
    return path.resolve(process.cwd(), 'data', 'openvibe-api.db');
}

// ── key helpers ───────────────────────────────────────────────────────────────
function hashKey(rawKey) {
    return crypto.createHash('sha256').update(rawKey).digest('hex');
}

function generateRawKey() {
    // ovk_ prefix + 32 random bytes in base64url
    return 'ovk_' + crypto.randomBytes(32).toString('base64url');
}

// ── CRUD ──────────────────────────────────────────────────────────────────────
function createApiKey({ userId, name, scopes }) {
    const db   = getDb();
    const id   = 'ak_' + crypto.randomBytes(8).toString('hex');
    const raw  = generateRawKey();
    const hash = hashKey(raw);
    const scopesJson = JSON.stringify(Array.isArray(scopes) ? scopes : []);

    db.prepare(`
        INSERT INTO api_keys (id, key_hash, user_id, name, scopes, created_at)
        VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    `).run(id, hash, String(userId), String(name).slice(0, 120), scopesJson);

    return { id, name, scopes: JSON.parse(scopesJson), created_at: new Date().toISOString(), key: raw };
}

function listApiKeys(userId) {
    const db = getDb();
    return db.prepare(`
        SELECT id, user_id, name, scopes, created_at, last_used_at, revoked_at
        FROM api_keys
        WHERE user_id = ? AND revoked_at IS NULL
        ORDER BY created_at DESC
    `).all(String(userId)).map((row) => ({
        ...row,
        scopes: (() => { try { return JSON.parse(row.scopes); } catch { return []; } })(),
    }));
}

function getApiKeyByHash(hash) {
    const db = getDb();
    return db.prepare(`
        SELECT * FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL
    `).get(hash);
}

function touchApiKey(id) {
    try {
        getDb().prepare(`UPDATE api_keys SET last_used_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?`).run(id);
    } catch { /* best-effort */ }
}

function revokeApiKey(id, userId) {
    const db  = getDb();
    const row = db.prepare(`SELECT * FROM api_keys WHERE id = ? AND user_id = ? AND revoked_at IS NULL`).get(id, String(userId));
    if (!row) return null;
    db.prepare(`UPDATE api_keys SET revoked_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?`).run(id);
    return { id, revoked: true };
}

function describePersistence() {
    try {
        const count = getDb().prepare('SELECT count(*) as n FROM api_keys').get();
        return { driver: 'sqlite', status: 'ok', api_keys: count.n };
    } catch (err) {
        return { driver: 'sqlite', status: 'error', error: err.message };
    }
}

module.exports = {
    SERVICE_NAME,
    POSTGRES_MIGRATIONS_DIR,
    SCHEMA_SQL,
    defaultSqlitePath,
    init,
    hashKey,
    createApiKey,
    listApiKeys,
    getApiKeyByHash,
    touchApiKey,
    revokeApiKey,
    describePersistence,
};
