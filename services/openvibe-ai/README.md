# openvibe-ai

Shared AI orchestration, SEO, content-source registry, ingestion, and search-index seam for the OpenVibe network. Canonical public host: **`ai.openvibe.network`**. Default port: **5100**.

## Run

```bash
cp .env.example .env
node server/index.js
```

The service boots offline by default — the built-in **stub provider** generates deterministic outputs with no external API keys required.

## Test

```bash
node test/ai-smoke.test.js
```

## Highlights

- **No raw API keys ever stored.** Providers and content sources reference an environment-variable name (`api_key_env`) only.
- **Idempotent runs** via `idempotency_key` (UNIQUE).
- **Cache + quota + fallback** built into `runner.executeRun`.
- **Deterministic SEO indexability gate** — thin content, missing sources, stub-in-production, and duplicates are auto-`noindex`.
- **Trade outputs always include `not_financial_advice: true`** and a disclaimer.
- **JSON-LD generators never fabricate** ratings, prices, or coupon expirations.

## Endpoints (selected)

| Path                                             | Purpose                              |
| ------------------------------------------------ | ------------------------------------ |
| `GET  /health`                                   | liveness + canonical host + counts    |
| `GET  /api/v1/ai/status`                         | runtime status                        |
| `GET  /api/v1/ai/providers`                      | list providers (no key values)        |
| `POST /api/v1/ai/runs`                           | create run with idempotency           |
| `POST /api/v1/ai/{chat,generate,summarize,…}`    | direct task helpers                   |
| `POST /api/v1/ai/wiki/generate-space`            | wiki workflow                         |
| `POST /api/v1/ai/seo/{metadata,indexability,…}`  | SEO helpers                           |
| `POST /api/v1/ai/sources`                        | register content source               |
| `POST /api/v1/ai/ingestion/jobs`                 | create ingestion job                  |
| `POST /api/v1/ai/search/{index,query,delete}`    | local search-index seam               |

See [docs/openvibe/](../../docs/openvibe/) for full specifications.
