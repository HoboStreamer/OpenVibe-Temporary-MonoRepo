# Phase 7 — AI / SEO / Sources / Search backbone

OpenVibe Phase 7 introduces **`openvibe-ai`** at canonical public domain
**`ai.openvibe.network`** (default port `5100`). It is the shared AI
orchestration, SEO, content-source, and search-index seam used by every
OpenVibe product (wiki, blog, news, reviews, deals, coupons, trade,
codes, tools, games) and by HoboStreamer via an additive bridge.

## What ships in Phase 7

- `services/openvibe-ai/` — the new service:
  - 16-table SQLite schema (providers / models / routes / templates /
    workflows / runs / requests / sources / cache / quotas / audit /
    seo_content / content_sources / content_ingestion_jobs /
    search_documents).
  - Built-in **stub provider** that runs offline with no API keys.
  - Default routes, prompt templates and workflows seeded on boot.
  - 13 default content-source registry entries (admin-editable).
  - Local SQLite-backed search-index seam (Meili/Typesense/OpenSearch
    seams to be added in later phases).
- `packages/openvibe-contracts/ai-events.js` — AI / SEO / content /
  search event types, validators, enums, payload builders, and the
  canonical `AI_OPENVIBE_NETWORK_HOST` constant.
- `packages/openvibe-sdk/ai-client.js` — `AiClient` for cross-service use.
- `services/openvibe-network` — config block and URL registry now
  advertise the AI service URL plus `AI_OPENVIBE_NETWORK_HOST`.
- `/opt/hobostreamer/server/openvibe-bridge/ai.js` — additive, inert
  unless `OPENVIBE_AI_URL` is set.

## Acceptance summary

| Requirement | Status |
| --- | --- |
| Service boots on port 5100 | ✅ |
| Canonical host = `ai.openvibe.network` | ✅ |
| Schema covers 16 tables | ✅ |
| Stub provider works offline | ✅ |
| Idempotent runs via UNIQUE `idempotency_key` | ✅ |
| Cache TTL respected | ✅ |
| Quota enforcement (per-day default 20 000) | ✅ |
| Provider+route fallback recorded as `fallback_used` | ✅ |
| Deterministic indexability gate | ✅ |
| JSON-LD never fabricates ratings/prices | ✅ |
| Trade outputs marked `not_financial_advice` | ✅ |
| Provider responses never expose API key values | ✅ |
| SDK `AiClient` exported | ✅ |
| Smoke test green (`node scripts/run-tests.js`) | ✅ |
