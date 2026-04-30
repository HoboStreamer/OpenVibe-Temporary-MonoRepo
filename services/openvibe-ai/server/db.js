'use strict';

// openvibe-ai — SQLite persistence (migration-safe via CREATE IF NOT EXISTS).
//
// Phase 7 storage: providers, models, routes, prompt templates, workflows,
// runs, request log, source documents/citations, content sources, ingestion
// jobs, SEO content metadata, search index docs, AI cache, quotas/usage,
// audit log.
//
// API tokens are NEVER stored here — providers/sources reference env-var
// names only (see `api_key_env`).

const path = require('path');
const {
    createLegacyPersistenceRuntime,
    createLegacyPostgresStore,
    createLegacySqliteStore,
} = require('@openvibe/persistence');

const SERVICE_NAME = 'openvibe-ai';
const SCHEMA_SQL = `
        CREATE TABLE IF NOT EXISTS ai_providers (
            id              TEXT PRIMARY KEY,
            provider_key    TEXT NOT NULL,
            display_name    TEXT NOT NULL,
            status          TEXT NOT NULL DEFAULT 'active',
            base_url        TEXT,
            auth_mode       TEXT NOT NULL DEFAULT 'none',
            api_key_env     TEXT,
            default_model   TEXT,
            supports_chat       INTEGER NOT NULL DEFAULT 1,
            supports_json       INTEGER NOT NULL DEFAULT 0,
            supports_embeddings INTEGER NOT NULL DEFAULT 0,
            supports_tools      INTEGER NOT NULL DEFAULT 0,
            supports_streaming  INTEGER NOT NULL DEFAULT 0,
            timeout_ms      INTEGER NOT NULL DEFAULT 30000,
            priority        INTEGER NOT NULL DEFAULT 100,
            metadata_json   TEXT NOT NULL DEFAULT '{}',
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (provider_key)
        );

        CREATE TABLE IF NOT EXISTS ai_models (
            id              TEXT PRIMARY KEY,
            provider_id     TEXT NOT NULL,
            model_key       TEXT NOT NULL,
            display_name    TEXT NOT NULL,
            model_type      TEXT NOT NULL DEFAULT 'chat',
            status          TEXT NOT NULL DEFAULT 'active',
            context_window  INTEGER,
            max_output_tokens INTEGER,
            cost_input_per_million  REAL,
            cost_output_per_million REAL,
            supports_json      INTEGER NOT NULL DEFAULT 0,
            supports_tools     INTEGER NOT NULL DEFAULT 0,
            supports_streaming INTEGER NOT NULL DEFAULT 0,
            metadata_json   TEXT NOT NULL DEFAULT '{}',
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (provider_id, model_key),
            FOREIGN KEY (provider_id) REFERENCES ai_providers(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS ai_routes (
            id                    TEXT PRIMARY KEY,
            route_key             TEXT NOT NULL UNIQUE,
            primary_provider_id   TEXT,
            primary_model_id      TEXT,
            fallback_provider_id  TEXT,
            fallback_model_id     TEXT,
            temperature           REAL,
            max_output_tokens     INTEGER,
            response_format       TEXT NOT NULL DEFAULT 'text',
            status                TEXT NOT NULL DEFAULT 'active',
            metadata_json         TEXT NOT NULL DEFAULT '{}',
            created_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at            DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS ai_prompt_templates (
            id                  TEXT PRIMARY KEY,
            template_key        TEXT NOT NULL UNIQUE,
            name                TEXT NOT NULL,
            description         TEXT,
            version             INTEGER NOT NULL DEFAULT 1,
            input_schema_json   TEXT NOT NULL DEFAULT '{}',
            output_schema_json  TEXT NOT NULL DEFAULT '{}',
            system_prompt       TEXT,
            user_prompt_template TEXT,
            default_route_key   TEXT,
            owner_type          TEXT,
            owner_id            TEXT,
            visibility          TEXT NOT NULL DEFAULT 'system',
            status              TEXT NOT NULL DEFAULT 'active',
            metadata_json       TEXT NOT NULL DEFAULT '{}',
            created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS ai_workflows (
            id                  TEXT PRIMARY KEY,
            workflow_key        TEXT NOT NULL UNIQUE,
            name                TEXT NOT NULL,
            description         TEXT,
            service_namespace   TEXT NOT NULL DEFAULT 'system',
            version             INTEGER NOT NULL DEFAULT 1,
            input_schema_json   TEXT NOT NULL DEFAULT '{}',
            steps_json          TEXT NOT NULL DEFAULT '[]',
            output_schema_json  TEXT NOT NULL DEFAULT '{}',
            default_route_key   TEXT,
            status              TEXT NOT NULL DEFAULT 'active',
            metadata_json       TEXT NOT NULL DEFAULT '{}',
            created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS ai_runs (
            id                  TEXT PRIMARY KEY,
            workflow_key        TEXT,
            workflow_version    INTEGER,
            template_key        TEXT,
            route_key           TEXT,
            status              TEXT NOT NULL DEFAULT 'queued',
            requested_by_type   TEXT,
            requested_by_id     TEXT,
            source_service      TEXT,
            target_type         TEXT,
            target_id           TEXT,
            input_json          TEXT NOT NULL DEFAULT '{}',
            output_json         TEXT,
            error               TEXT,
            trace_id            TEXT,
            idempotency_key     TEXT UNIQUE,
            metadata_json       TEXT NOT NULL DEFAULT '{}',
            created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
            started_at          DATETIME,
            completed_at        DATETIME
        );
        CREATE INDEX IF NOT EXISTS idx_ai_runs_status ON ai_runs(status, created_at);
        CREATE INDEX IF NOT EXISTS idx_ai_runs_target ON ai_runs(target_type, target_id);
        CREATE INDEX IF NOT EXISTS idx_ai_runs_workflow ON ai_runs(workflow_key);

        CREATE TABLE IF NOT EXISTS ai_requests (
            id                      TEXT PRIMARY KEY,
            run_id                  TEXT,
            provider_id             TEXT,
            model_id                TEXT,
            route_key               TEXT,
            status                  TEXT NOT NULL DEFAULT 'started',
            prompt_hash             TEXT,
            input_tokens_estimate   INTEGER,
            output_tokens_estimate  INTEGER,
            cost_estimate           REAL,
            latency_ms              INTEGER,
            error                   TEXT,
            metadata_json           TEXT NOT NULL DEFAULT '{}',
            created_at              DATETIME DEFAULT CURRENT_TIMESTAMP,
            completed_at            DATETIME
        );
        CREATE INDEX IF NOT EXISTS idx_ai_requests_run ON ai_requests(run_id);

        CREATE TABLE IF NOT EXISTS ai_sources (
            id              TEXT PRIMARY KEY,
            run_id          TEXT,
            source_type     TEXT,
            source_id       TEXT,
            url             TEXT,
            title           TEXT,
            author          TEXT,
            published_at    DATETIME,
            retrieved_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
            snippet         TEXT,
            content_hash    TEXT,
            trust_score     REAL,
            metadata_json   TEXT NOT NULL DEFAULT '{}'
        );
        CREATE INDEX IF NOT EXISTS idx_ai_sources_run ON ai_sources(run_id);

        CREATE TABLE IF NOT EXISTS ai_cache (
            cache_key       TEXT PRIMARY KEY,
            route_key       TEXT,
            prompt_hash     TEXT,
            input_hash      TEXT,
            output_json     TEXT NOT NULL,
            expires_at      DATETIME,
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            metadata_json   TEXT NOT NULL DEFAULT '{}'
        );
        CREATE INDEX IF NOT EXISTS idx_ai_cache_expires ON ai_cache(expires_at);

        CREATE TABLE IF NOT EXISTS ai_quotas (
            id              TEXT PRIMARY KEY,
            actor_type      TEXT NOT NULL,
            actor_id        TEXT NOT NULL,
            service_namespace TEXT,
            period          TEXT NOT NULL,
            limit_requests  INTEGER,
            limit_tokens    INTEGER,
            limit_cost      REAL,
            used_requests   INTEGER NOT NULL DEFAULT 0,
            used_tokens     INTEGER NOT NULL DEFAULT 0,
            used_cost       REAL NOT NULL DEFAULT 0,
            window_start    DATETIME,
            window_end      DATETIME,
            updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (actor_type, actor_id, service_namespace, period, window_start)
        );

        CREATE TABLE IF NOT EXISTS ai_audit (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            actor_type      TEXT,
            actor_id        TEXT,
            action          TEXT NOT NULL,
            target_type     TEXT,
            target_id       TEXT,
            trace_id        TEXT,
            metadata_json   TEXT NOT NULL DEFAULT '{}',
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_ai_audit_actor ON ai_audit(actor_type, actor_id, created_at);

        -- Phase 7 SEO content metadata (per generated/imported page)
        CREATE TABLE IF NOT EXISTS seo_content (
            id              TEXT PRIMARY KEY,
            content_type    TEXT NOT NULL,
            target_product  TEXT,
            target_id       TEXT,
            seo_title       TEXT,
            seo_description TEXT,
            slug            TEXT,
            canonical_url   TEXT,
            canonical_domain TEXT,
            robots_directive TEXT NOT NULL DEFAULT 'noindex,follow',
            og_title        TEXT,
            og_description  TEXT,
            og_image_media_id TEXT,
            twitter_card    TEXT,
            structured_data_json TEXT,
            breadcrumbs_json TEXT,
            source_count    INTEGER NOT NULL DEFAULT 0,
            citation_count  INTEGER NOT NULL DEFAULT 0,
            freshness_score REAL,
            quality_score   REAL,
            duplicate_group_id TEXT,
            canonical_content_hash TEXT,
            generated_by    TEXT NOT NULL DEFAULT 'ai',
            ai_disclosure   TEXT,
            sensitive_category TEXT,
            requires_manual_review INTEGER NOT NULL DEFAULT 0,
            review_required INTEGER NOT NULL DEFAULT 0,
            indexing_status TEXT NOT NULL DEFAULT 'draft',
            published_at    DATETIME,
            generated_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            expires_at      DATETIME,
            metadata_json   TEXT NOT NULL DEFAULT '{}'
        );
        CREATE INDEX IF NOT EXISTS idx_seo_content_target ON seo_content(target_product, target_id);
        CREATE INDEX IF NOT EXISTS idx_seo_content_status ON seo_content(indexing_status);
        CREATE INDEX IF NOT EXISTS idx_seo_content_dupe ON seo_content(canonical_content_hash);

        -- Phase 7 source registry (admin-configurable)
        CREATE TABLE IF NOT EXISTS content_sources (
            id              TEXT PRIMARY KEY,
            source_key      TEXT NOT NULL UNIQUE,
            source_name     TEXT NOT NULL,
            source_type     TEXT NOT NULL,
            category        TEXT,
            base_url        TEXT,
            api_base_url    TEXT,
            auth_mode       TEXT NOT NULL DEFAULT 'none',
            api_key_env     TEXT,
            rss_url         TEXT,
            sitemap_url     TEXT,
            robots_txt_url  TEXT,
            rate_limit_per_minute INTEGER,
            enabled         INTEGER NOT NULL DEFAULT 1,
            respect_robots  INTEGER NOT NULL DEFAULT 1,
            requires_review INTEGER NOT NULL DEFAULT 0,
            terms_notes     TEXT,
            sensitive_category TEXT,
            default_indexing_status TEXT NOT NULL DEFAULT 'draft',
            metadata_json   TEXT NOT NULL DEFAULT '{}',
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_content_sources_cat ON content_sources(category);

        CREATE TABLE IF NOT EXISTS content_ingestion_jobs (
            id              TEXT PRIMARY KEY,
            source_id       TEXT,
            job_type        TEXT NOT NULL,
            target_product  TEXT,
            status          TEXT NOT NULL DEFAULT 'queued',
            input_json      TEXT NOT NULL DEFAULT '{}',
            output_json     TEXT,
            error           TEXT,
            trace_id        TEXT,
            metadata_json   TEXT NOT NULL DEFAULT '{}',
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            started_at      DATETIME,
            completed_at    DATETIME,
            FOREIGN KEY (source_id) REFERENCES content_sources(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_ingest_jobs_status ON content_ingestion_jobs(status);

        -- Phase 7 search index seam (default local SQLite-backed adapter)
        CREATE TABLE IF NOT EXISTS search_documents (
            cache_key       TEXT PRIMARY KEY,
            index_key       TEXT NOT NULL,
            document_type   TEXT NOT NULL,
            document_id     TEXT NOT NULL,
            title           TEXT,
            summary         TEXT,
            body_text       TEXT,
            canonical_url   TEXT,
            tags_json       TEXT NOT NULL DEFAULT '[]',
            source_ids_json TEXT NOT NULL DEFAULT '[]',
            freshness_score REAL,
            quality_score   REAL,
            visibility      TEXT NOT NULL DEFAULT 'public',
            indexing_status TEXT NOT NULL DEFAULT 'ready',
            embedding_ref   TEXT,
            metadata_json   TEXT NOT NULL DEFAULT '{}',
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (index_key, document_type, document_id)
        );
        CREATE INDEX IF NOT EXISTS idx_search_docs_index ON search_documents(index_key, indexing_status);
    `;

function defaultSqlitePath() {
    return path.resolve(__dirname, '..', 'data', 'openvibe-ai.db');
}

function createSqliteStore(options) {
    const opts = Object.assign({}, options || {});
    return createLegacySqliteStore({
        serviceName: SERVICE_NAME,
        sqlitePath: opts.sqlitePath || defaultSqlitePath(),
        schemaSql: SCHEMA_SQL,
    });
}

function createPostgresStore(options) {
    const opts = Object.assign({}, options || {});
    return createLegacyPostgresStore({
        serviceName: SERVICE_NAME,
        databaseUrl: opts.databaseUrl,
        schemaSql: SCHEMA_SQL,
    });
}

const sqliteStore = createSqliteStore({ sqlitePath: defaultSqlitePath() });
const runtime = createLegacyPersistenceRuntime({
    serviceName: SERVICE_NAME,
    defaultSqlitePath,
    sqlite: sqliteStore,
    createPostgres({ databaseUrl }) {
        return createPostgresStore({ databaseUrl });
    },
});

module.exports = Object.assign({}, runtime, {
    SERVICE_NAME,
    SCHEMA_SQL,
    defaultSqlitePath,
    createSqliteStore,
    createPostgresStore,
});
