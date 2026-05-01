-- 040_billing_loyalty.sql — billing + loyalty (Hobo Coins/Nickels) + legacy archive.
-- Hobo Bucks are NOT spendable. They land in legacy_finance_archive only and
-- are forbidden from the canonical billing ledger. See
-- docs/openvibe/hobo-coins-loyalty-migration.md for details.

SET search_path TO openvibe, public;

CREATE TABLE IF NOT EXISTS billing_subscriptions (
    id              TEXT PRIMARY KEY,
    subscriber_id   TEXT,
    creator_id      TEXT,
    plan            TEXT,
    status          TEXT,
    amount_cents    BIGINT,
    currency        TEXT,
    started_at      TIMESTAMPTZ,
    ended_at        TIMESTAMPTZ,
    metadata_json   JSONB DEFAULT '{}'::jsonb,
    legacy_source   TEXT,
    legacy_id       TEXT
);

CREATE TABLE IF NOT EXISTS legacy_finance_archive (
    id            BIGSERIAL PRIMARY KEY,
    legacy_source TEXT NOT NULL,
    legacy_table  TEXT NOT NULL,
    legacy_id     TEXT,
    user_id       TEXT,
    amount_raw    TEXT,
    payload_json  JSONB NOT NULL,
    spendable     BOOLEAN NOT NULL DEFAULT false,
    notes         TEXT,
    archived_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS loyalty_accounts (
    user_id        TEXT PRIMARY KEY,
    coins_balance  BIGINT NOT NULL DEFAULT 0,
    nickels_balance BIGINT NOT NULL DEFAULT 0,
    metadata_json  JSONB DEFAULT '{}'::jsonb,
    updated_at     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS loyalty_transactions (
    id            TEXT PRIMARY KEY,
    user_id       TEXT,
    kind          TEXT,
    amount        BIGINT,
    reason        TEXT,
    created_at    TIMESTAMPTZ DEFAULT now(),
    legacy_source TEXT,
    legacy_id     TEXT
);

CREATE TABLE IF NOT EXISTS loyalty_rewards (
    id           TEXT PRIMARY KEY,
    user_id      TEXT,
    reward_kind  TEXT,
    metadata_json JSONB DEFAULT '{}'::jsonb,
    created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS loyalty_redemptions (
    id           TEXT PRIMARY KEY,
    user_id      TEXT,
    reward_id    TEXT,
    status       TEXT,
    metadata_json JSONB DEFAULT '{}'::jsonb,
    created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS loyalty_watch_time (
    user_id      TEXT,
    stream_id    TEXT,
    seconds      BIGINT,
    captured_at  TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (user_id, stream_id)
);
