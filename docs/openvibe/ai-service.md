# `openvibe-ai` service

Canonical public host: **`ai.openvibe.network`**. Default port: `5100`.

## Auth model

- `X-Internal-Key` + `X-OpenVibe-Service` headers identify a peer service
  (Phase 6 pattern). Service actors can call all admin endpoints.
- Logged-in users (`req.user.role === 'admin'`) can mutate provider /
  model / route / template / workflow records; ordinary authenticated
  users can call run/task/workflow endpoints.
- Anonymous callers are rejected for any run-creation endpoint to
  prevent unattributed AI usage.

## Schema (16 tables)

`ai_providers`, `ai_models`, `ai_routes`, `ai_prompt_templates`,
`ai_workflows`, `ai_runs` (UNIQUE idempotency_key), `ai_requests`,
`ai_sources`, `ai_cache`, `ai_quotas`, `ai_audit`,
`seo_content`, `content_sources`, `content_ingestion_jobs`,
`search_documents`. **No table stores raw API keys** — only an
`api_key_env` column referencing an environment-variable name.

## Endpoint surface (`/api/v1/ai/*`)

- **Status / admin**: `/status`, `/admin/summary`, `/admin/usage`,
  `/admin/cache`.
- **Catalogs**: `/providers`, `/models`, `/routes`, `/templates`,
  `/workflows`, `/sources`.
- **Runs**: `/runs`, `/runs/:id`, `/runs/:id/{cancel,retry}`.
- **Direct tasks**: `/chat`, `/generate`, `/summarize`, `/classify`,
  `/extract`, `/enrich`, `/embed`.
- **Product workflows**: `/wiki/{generate-space,generate-page}`,
  `/blog/draft-post`, `/news/{summarize-story,compare-perspectives}`,
  `/reviews/summarize-entity`, `/deals/enrich-deal`,
  `/coupons/extract-coupon`,
  `/trade/summarize-market-context` (always
  `not_financial_advice: true`),
  `/codes/generate-docs`, `/games/generate-lore`.
- **SEO**: `/seo/{metadata,indexability,structured-data,sitemap-entry,
  sitemap,sitemap-index,rss,atom,robots,slug,canonical,duplicate-hash}`.
- **Content / ingestion**: `/sources/:id/{test,fetch,robots-check}`,
  `/ingestion/jobs`, `/ingestion/jobs/:id/{run,cancel}`,
  `/content/quality`.
- **Search seam**: `/search/{index,query,delete,status}`.

`/api/ai/*` is exposed as a compatibility alias of `/api/v1/ai/*`.

## Environment

| Variable | Purpose |
| --- | --- |
| `PORT` | listen port (default 5100) |
| `OPENVIBE_AI_URL` | external base URL |
| `OPENVIBE_AI_INTERNAL_URL` | internal base URL |
| `AI_OPENVIBE_NETWORK_HOST` | canonical public host (`ai.openvibe.network`) |
| `AI_DEFAULT_PROVIDER` | default provider key (`stub`) |
| `AI_DEFAULT_PER_MINUTE` | per-actor per-minute rate limit |
| `AI_DEFAULT_PER_DAY` | per-actor per-day cap |
| `AI_CACHE_TTL_SECONDS` | task-result cache TTL |
| `OPENVIBE_EVENTS_URL` | events bus URL |
| `INTERNAL_API_KEY` | shared internal key |
