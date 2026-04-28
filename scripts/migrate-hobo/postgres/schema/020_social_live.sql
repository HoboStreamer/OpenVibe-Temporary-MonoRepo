-- 020_social_live.sql — follows + live channels/streams + restream.

SET search_path TO openvibe, public;

CREATE TABLE IF NOT EXISTS social_follows (
    follower_id TEXT NOT NULL,
    followed_id TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (follower_id, followed_id)
);

CREATE TABLE IF NOT EXISTS live_channels (
    id            TEXT PRIMARY KEY,
    owner_id      TEXT,
    title         TEXT,
    description   TEXT,
    metadata_json JSONB DEFAULT '{}'::jsonb,
    legacy_source TEXT,
    legacy_id     TEXT,
    created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS live_streams (
    id            TEXT PRIMARY KEY,
    channel_id    TEXT REFERENCES live_channels(id) ON DELETE CASCADE,
    user_id       TEXT,
    title         TEXT,
    status        TEXT,
    started_at    TIMESTAMPTZ,
    ended_at      TIMESTAMPTZ,
    metadata_json JSONB DEFAULT '{}'::jsonb,
    legacy_source TEXT,
    legacy_id     TEXT
);
CREATE INDEX IF NOT EXISTS idx_live_streams_channel ON live_streams(channel_id);

CREATE TABLE IF NOT EXISTS live_stream_definitions (
    id              TEXT PRIMARY KEY,
    channel_id      TEXT REFERENCES live_channels(id) ON DELETE CASCADE,
    owner_user_id   TEXT,
    title           TEXT,
    ingest_kind     TEXT,
    metadata_json   JSONB DEFAULT '{}'::jsonb,
    legacy_source   TEXT,
    legacy_id       TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_live_stream_definitions_channel ON live_stream_definitions(channel_id);

CREATE TABLE IF NOT EXISTS live_channel_moderators (
    channel_id  TEXT REFERENCES live_channels(id) ON DELETE CASCADE,
    user_id     TEXT,
    role        TEXT,
    granted_at  TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (channel_id, user_id)
);

CREATE TABLE IF NOT EXISTS restream_destinations (
    id            TEXT PRIMARY KEY,
    user_id       TEXT,
    target        TEXT,
    metadata_json JSONB DEFAULT '{}'::jsonb,
    secret_redacted BOOLEAN DEFAULT true,
    legacy_source TEXT
);

CREATE TABLE IF NOT EXISTS robotstreamer_metadata (
    id            TEXT PRIMARY KEY,
    user_id       TEXT,
    metadata_json JSONB DEFAULT '{}'::jsonb,
    token_redacted BOOLEAN DEFAULT true,
    legacy_source TEXT
);

CREATE TABLE IF NOT EXISTS live_stream_analytics (
    stream_id   TEXT,
    captured_at TIMESTAMPTZ DEFAULT now(),
    metric_json JSONB DEFAULT '{}'::jsonb,
    PRIMARY KEY (stream_id, captured_at)
);
