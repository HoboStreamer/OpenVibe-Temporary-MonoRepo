-- 001_core.sql — Phase 8 OpenVibe Postgres staging schema (core / migration metadata).
-- Idempotent. Designed to be applied via scripts/migrate-hobo/migrate-postgres.js.

CREATE SCHEMA IF NOT EXISTS openvibe;
SET search_path TO openvibe, public;

CREATE TABLE IF NOT EXISTS migration_runs (
    run_id        TEXT PRIMARY KEY,
    started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at   TIMESTAMPTZ,
    bundle_dir    TEXT,
    mode          TEXT,
    status        TEXT NOT NULL DEFAULT 'started',
    notes         TEXT,
    summary_json  JSONB
);

CREATE TABLE IF NOT EXISTS migration_legacy_id_map (
    source     TEXT NOT NULL,
    kind       TEXT NOT NULL,
    legacy_id  TEXT NOT NULL,
    new_id     TEXT NOT NULL,
    run_id     TEXT REFERENCES migration_runs(run_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (source, kind, legacy_id)
);

CREATE TABLE IF NOT EXISTS migration_audit (
    id          BIGSERIAL PRIMARY KEY,
    run_id      TEXT REFERENCES migration_runs(run_id),
    dataset     TEXT,
    action      TEXT NOT NULL,
    record_id   TEXT,
    detail_json JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS migration_reconciliation (
    id           BIGSERIAL PRIMARY KEY,
    run_id       TEXT REFERENCES migration_runs(run_id),
    dataset      TEXT NOT NULL,
    expected     BIGINT,
    actual       BIGINT,
    skipped      BIGINT DEFAULT 0,
    excluded     BIGINT DEFAULT 0,
    notes        TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS migration_import_hold (
    id           BIGSERIAL PRIMARY KEY,
    dataset      TEXT NOT NULL,
    record_id    TEXT,
    payload_json JSONB NOT NULL,
    legacy_ref   JSONB,
    run_id       TEXT REFERENCES migration_runs(run_id),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_migration_import_hold_dataset
    ON migration_import_hold(dataset, created_at DESC);
