-- 030_chat_community_media.sql — chat, community, and media domains.

SET search_path TO openvibe, public;

CREATE TABLE IF NOT EXISTS chat_messages (
    id            TEXT PRIMARY KEY,
    room          TEXT,
    sender_id     TEXT,
    body          TEXT,
    sent_at       TIMESTAMPTZ DEFAULT now(),
    metadata_json JSONB DEFAULT '{}'::jsonb,
    legacy_source TEXT,
    legacy_id     TEXT
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_room ON chat_messages(room, sent_at DESC);

CREATE TABLE IF NOT EXISTS chat_rooms (
    id            TEXT PRIMARY KEY,
    kind          TEXT,
    metadata_json JSONB DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_moderation_actions (
    id            TEXT PRIMARY KEY,
    room          TEXT,
    actor_id      TEXT,
    target_id     TEXT,
    action        TEXT,
    reason        TEXT,
    created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS community_pastes (
    id            TEXT PRIMARY KEY,
    owner_id      TEXT,
    title         TEXT,
    body          TEXT,
    visibility    TEXT,
    metadata_json JSONB DEFAULT '{}'::jsonb,
    legacy_source TEXT,
    legacy_id     TEXT,
    created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS community_paste_likes (
    paste_id   TEXT REFERENCES community_pastes(id) ON DELETE CASCADE,
    user_id    TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (paste_id, user_id)
);

CREATE TABLE IF NOT EXISTS community_paste_comments (
    id         TEXT PRIMARY KEY,
    paste_id   TEXT REFERENCES community_pastes(id) ON DELETE CASCADE,
    user_id    TEXT,
    body       TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS community_comments (
    id            TEXT PRIMARY KEY,
    target_kind   TEXT,
    target_id     TEXT,
    user_id       TEXT,
    body          TEXT,
    metadata_json JSONB DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS media_objects (
    id            TEXT PRIMARY KEY,
    namespace     TEXT NOT NULL,
    media_type    TEXT,
    owner_id      TEXT,
    storage_key   TEXT,
    size_bytes    BIGINT,
    sha256        TEXT,
    status        TEXT,
    tier          TEXT,
    metadata_json JSONB DEFAULT '{}'::jsonb,
    legacy_source TEXT,
    legacy_id     TEXT,
    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_media_objects_namespace ON media_objects(namespace);

CREATE TABLE IF NOT EXISTS media_derivatives (
    id          TEXT PRIMARY KEY,
    parent_id   TEXT REFERENCES media_objects(id) ON DELETE CASCADE,
    kind        TEXT,
    storage_key TEXT,
    size_bytes  BIGINT,
    metadata_json JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS media_lifecycle_audit (
    id           BIGSERIAL PRIMARY KEY,
    media_id     TEXT,
    action       TEXT,
    detail_json  JSONB,
    recorded_at  TIMESTAMPTZ DEFAULT now()
);
