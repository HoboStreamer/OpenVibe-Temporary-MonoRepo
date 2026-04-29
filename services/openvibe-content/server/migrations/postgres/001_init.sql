CREATE TABLE IF NOT EXISTS content_sources (
    id              TEXT PRIMARY KEY,
    surface         TEXT NOT NULL,
    source_key      TEXT NOT NULL UNIQUE,
    display_name    TEXT NOT NULL,
    origin_url      TEXT,
    kind            TEXT NOT NULL DEFAULT 'feed',
    status          TEXT NOT NULL DEFAULT 'active',
    notes           TEXT,
    metadata_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_content_sources_surface ON content_sources(surface, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS content_items (
    id              TEXT PRIMARY KEY,
    surface         TEXT NOT NULL,
    source_id       TEXT REFERENCES content_sources(id) ON DELETE SET NULL,
    slug            TEXT NOT NULL,
    title           TEXT NOT NULL,
    summary         TEXT,
    body_md         TEXT,
    body_html       TEXT,
    state           TEXT NOT NULL DEFAULT 'draft',
    indexable       BOOLEAN NOT NULL DEFAULT FALSE,
    published_at    TIMESTAMPTZ,
    metadata_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
    search_text     TEXT NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(surface, slug)
);
CREATE INDEX IF NOT EXISTS idx_content_items_surface ON content_items(surface, state, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_items_published ON content_items(surface, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_items_search ON content_items USING GIN (to_tsvector('simple', search_text));

CREATE TABLE IF NOT EXISTS content_jobs (
    id              TEXT PRIMARY KEY,
    job_type        TEXT NOT NULL,
    surface         TEXT,
    source_id       TEXT REFERENCES content_sources(id) ON DELETE SET NULL,
    item_id         TEXT REFERENCES content_items(id) ON DELETE SET NULL,
    state           TEXT NOT NULL DEFAULT 'queued',
    scheduled_at    TIMESTAMPTZ,
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    error           TEXT,
    payload_json    JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_content_jobs_state ON content_jobs(state, job_type, created_at DESC);
