-- 010_identity_control.sql — identity + control plane tables.

SET search_path TO openvibe, public;

CREATE TABLE IF NOT EXISTS identity_users (
    id              TEXT PRIMARY KEY,
    username        TEXT,
    display_name    TEXT,
    email           TEXT,
    role            TEXT,
    flags_json      JSONB DEFAULT '{}'::jsonb,
    legacy_source   TEXT,
    legacy_id       TEXT,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_identity_users_username ON identity_users(username);

CREATE TABLE IF NOT EXISTS identity_linked_accounts (
    id              BIGSERIAL PRIMARY KEY,
    user_id         TEXT REFERENCES identity_users(id) ON DELETE CASCADE,
    service         TEXT NOT NULL,
    external_id     TEXT,
    metadata_json   JSONB DEFAULT '{}'::jsonb,
    legacy_source   TEXT,
    legacy_id       TEXT,
    UNIQUE(service, external_id)
);

CREATE TABLE IF NOT EXISTS identity_anon_users (
    id               TEXT PRIMARY KEY,
    anon_number      TEXT,
    session_token    TEXT,
    display_name     TEXT,
    preferences_json JSONB DEFAULT '{}'::jsonb,
    total_messages   BIGINT DEFAULT 0,
    total_commands   BIGINT DEFAULT 0,
    first_seen       TIMESTAMPTZ,
    last_seen        TIMESTAMPTZ,
    fingerprint      TEXT,
    legacy_source    TEXT,
    legacy_id        TEXT,
    created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS identity_verification_keys (
    id            TEXT PRIMARY KEY,
    user_id       TEXT REFERENCES identity_users(id) ON DELETE CASCADE,
    key_type      TEXT,
    metadata_json JSONB DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS identity_username_conflicts (
    canonical_user_id      TEXT NOT NULL REFERENCES identity_users(id) ON DELETE CASCADE,
    hobotools_username     TEXT,
    hobostreamer_username  TEXT,
    legacy_id              TEXT,
    created_at             TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (canonical_user_id, legacy_id)
);

CREATE TABLE IF NOT EXISTS identity_user_effects (
    user_id     TEXT REFERENCES identity_users(id) ON DELETE CASCADE,
    effect_type TEXT NOT NULL,
    effect_id   TEXT NOT NULL,
    data_json   JSONB DEFAULT '{}'::jsonb,
    PRIMARY KEY (user_id, effect_type, effect_id)
);

CREATE TABLE IF NOT EXISTS themes_catalog (
    id            TEXT PRIMARY KEY,
    name          TEXT,
    description   TEXT,
    css_vars_json JSONB DEFAULT '{}'::jsonb,
    legacy_source TEXT,
    legacy_id     TEXT,
    created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS themes_user_preferences (
    user_id   TEXT REFERENCES identity_users(id) ON DELETE CASCADE,
    theme_id  TEXT REFERENCES themes_catalog(id) ON DELETE SET NULL,
    overrides_json JSONB DEFAULT '{}'::jsonb,
    PRIMARY KEY (user_id)
);

CREATE TABLE IF NOT EXISTS control_url_registry (
    key         TEXT PRIMARY KEY,
    value       TEXT,
    description TEXT,
    updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS control_user_preferences (
    user_id        TEXT NOT NULL REFERENCES identity_users(id) ON DELETE CASCADE,
    scope          TEXT NOT NULL,
    language       TEXT,
    settings_json  JSONB DEFAULT '{}'::jsonb,
    legacy_source  TEXT,
    legacy_id      TEXT,
    updated_at     TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (user_id, scope)
);

CREATE TABLE IF NOT EXISTS control_oauth_clients (
    client_id     TEXT PRIMARY KEY,
    display_name  TEXT,
    redirect_uris JSONB DEFAULT '[]'::jsonb,
    scopes        JSONB DEFAULT '[]'::jsonb,
    legacy_source TEXT
);

CREATE TABLE IF NOT EXISTS control_notifications (
    id            TEXT PRIMARY KEY,
    user_id       TEXT,
    category      TEXT,
    type          TEXT,
    payload_json  JSONB,
    read_at       TIMESTAMPTZ,
    created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS control_notification_preferences (
    user_id  TEXT,
    category TEXT,
    enabled  BOOLEAN DEFAULT true,
    PRIMARY KEY (user_id, category)
);
