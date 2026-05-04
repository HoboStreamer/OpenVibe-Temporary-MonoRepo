-- 001_api_keys.sql
-- openvibe-api: API key management table
-- Must stay in sync with SCHEMA_SQL in services/openvibe-api/server/db.js

CREATE TABLE IF NOT EXISTS api_keys (
    id          TEXT PRIMARY KEY,
    key_hash    TEXT NOT NULL UNIQUE,
    user_id     TEXT NOT NULL,
    name        TEXT NOT NULL,
    scopes      TEXT NOT NULL DEFAULT '[]',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at TIMESTAMPTZ,
    revoked_at  TIMESTAMPTZ,
    rowid       BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user_id  ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
