Analyze the #codebase then complete OpenVibe Phase 7 end-to-end inside the current workspace.

Do not fetch external repository URLs. Do not mention or depend on any temporary repository URL. Treat the current VS Code workspace as the active OpenVibe migration workspace. The legacy Hobo source trees under `HoboReposToMigrateFrom/` are migration/reference sources only; new canonical OpenVibe implementation should live in the OpenVibe service/package structure already established in this workspace.

Important context:
- Phase 1 and Phase 2 are complete: OpenVibe kernel/control-plane foundations should already exist.
- Phase 3 is complete: `openvibe-media` should already exist.
- Phase 4 is complete: `openvibe-live`, `openre-stream`, and stream/media/restream integration should already exist.
- Phase 5 is complete: `openvibe-chat` and `openvibe-community` should already exist.
- Phase 6 is complete: `openvibe-billing`, credits ledger, tips, VIP/subscriptions, and `BillingClient` should already exist.
- Phase 7 = `openvibe-ai` shared AI backend orchestration.
- The canonical public/API domain for Phase 7 is `ai.openvibe.network`.
- `services/openvibe-ai` should be the runtime implementation, but the external product-facing domain/API surface must be `ai.openvibe.network`.
- All OpenVibe AI websites/services should use this shared AI backend instead of hardcoding providers independently.

Primary Phase 7 goals:

1. Build/evolve `services/openvibe-ai` as the shared OpenVibe AI/LLM orchestration service.
2. Make `ai.openvibe.network` the canonical API and shared global AI service domain.
3. Add URL registry/config support for:
   - `OPENVIBE_AI_URL`
   - `OPENVIBE_AI_INTERNAL_URL`
   - `AI_OPENVIBE_NETWORK_HOST`
   - local dev fallback host/port
4. Add host-aware routing or gateway/proxy support so requests for `ai.openvibe.network` reach the OpenVibe AI service cleanly.
5. Add reusable OpenVibe AI contracts/events/capabilities/SDK client support.
6. Add admin-configurable provider/model routing without requiring real production API keys for local development.
7. Add safe local/stub provider support so Phase 7 works offline and testably.
8. Add reusable AI jobs/workflows for:
   - chat/completion
   - summarization
   - generation
   - classification
   - extraction
   - enrichment
   - embeddings/vector-search seam
   - source/citation-aware synthesis
   - moderation/review assistance seam
9. Add product-facing AI workflow templates/seams for:
   - `openvibe.wiki`
   - `openvibe.blog`
   - `openvibe.news`
   - `openvibe.reviews`
   - `openvibe.deals`
   - `openvibe.coupons`
   - `openvibe.trade`
   - `openvibe.codes`
   - `openvibe.tools`
   - `openvibe.games`
10. Integrate Phase 7 with completed Phase 1–6 systems:
   - OpenVibe auth/control plane
   - OpenVibe events
   - OpenVibe user modules
   - OpenVibe service registry
   - OpenVibe capability registry
   - OpenVibe contract registry
   - OpenVibe policy engine
   - OpenVibe SDK/contracts packages
   - `openvibe-media`
   - `openvibe-community`
   - `openvibe-chat`
   - `openvibe-billing`
11. Preserve legacy Hobo/HoboStreamer behavior. Do not break existing services while adding the AI service.
12. Implement usable, testable API/admin/workflow surfaces, not placeholder tables.

Do not stop at planning. Implement the code.

---

# 0. Confirmatory analysis before edits

Before changing files, inspect the actual current workspace and report what exists.

First inspect these root/current OpenVibe files or directories if present:

- #file:README.md
- #file:PLAN.md
- #file:PHASES.md
- #file:package.json
- #file:docs
- #file:packages
- #file:packages/openvibe-contracts
- #file:packages/openvibe-contracts/index.js
- #file:packages/openvibe-sdk
- #file:packages/openvibe-sdk/index.js
- #file:services
- #file:services/openvibe-network
- #file:services/openvibe-events
- #file:services/openvibe-media
- #file:services/openvibe-live
- #file:services/openre-stream
- #file:services/openvibe-chat
- #file:services/openvibe-community
- #file:services/openvibe-billing
- #file:services/openvibe-ai
- #file:openvibe-ai
- #file:openvibe-wiki
- #file:openvibe-blog
- #file:openvibe-news
- #file:openvibe-reviews
- #file:openvibe-deals
- #file:openvibe-coupons
- #file:openvibe-trade
- #file:openvibe-codes
- #file:openvibe-tools
- #file:openvibe-games

Then inspect these legacy migration sources if present:

- #file:HoboReposToMigrateFrom/HoboStreamer.com/README.md
- #file:HoboReposToMigrateFrom/HoboStreamer.com/server
- #file:HoboReposToMigrateFrom/HoboStreamer.com/server/index.js
- #file:HoboReposToMigrateFrom/HoboStreamer.com/server/config.js
- #file:HoboReposToMigrateFrom/HoboStreamer.com/server/db/schema.sql
- #file:HoboReposToMigrateFrom/HoboStreamer.com/public
- #file:HoboReposToMigrateFrom/HoboApp/README.md
- #file:HoboReposToMigrateFrom/HoboApp/hobo-tools/README.md
- #file:HoboReposToMigrateFrom/HoboApp/hobo-tools/server/index.js
- #file:HoboReposToMigrateFrom/HoboApp/hobo-tools/server/config.js
- #file:HoboReposToMigrateFrom/HoboApp/hobo-tools/server/db/database.js
- #file:HoboReposToMigrateFrom/HoboApp/packages

Then search #codebase for actual Phase 1–6 implementations and inspect the exact files before editing:

- event backbone
- user modules
- service registry
- capability registry
- contract registry
- policy engine
- OpenVibe auth/control-plane compatibility layer
- OpenVibe URL registry / host-aware routing
- OpenVibe SDK/contracts packages
- `openvibe-media`
- `openvibe-live`
- `openre-stream`
- `openvibe-chat`
- `openvibe-community`
- `openvibe-billing`
- legacy HoboStreamer compatibility adapters
- admin/internal diagnostics surfaces

Before editing, report:

1. Where the event infrastructure currently lives.
2. Where user modules, service registry, capabilities, contracts, and policy enforcement currently live.
3. Where URL registry / host-aware routing currently lives.
4. Where `openvibe-media`, `openvibe-live`, `openre-stream`, `openvibe-chat`, `openvibe-community`, and `openvibe-billing` currently live.
5. Which APIs/events/capabilities those services already expose that Phase 7 must integrate with.
6. Which current files or legacy files reference:
   - AI
   - LLM
   - OpenAI
   - Anthropic
   - Gemini
   - Ollama
   - OpenRouter
   - embeddings
   - summarization
   - scraping
   - news
   - blog generation
   - wiki generation
   - reviews/deals/coupons enrichment
   - prompt templates
   - moderation helpers
   - content classification
   - vector/search/indexing helpers
7. Whether any AI/provider/config/admin surfaces already exist.
8. Which existing registry/config files must advertise `ai.openvibe.network`.
9. Which old routes/tables must remain compatibility adapters.
10. The exact files to edit/create.

Only after this confirmatory analysis should you implement.

---

# 1. Canonical domain/API requirement

The AI service must be designed around this canonical public domain:

`https://ai.openvibe.network`

The local service may run on a local port, but all docs, SDK defaults, service registry entries, and URL registry keys must understand that `ai.openvibe.network` is the public API/service identity.

Required URL/config behavior:

1. Add registry keys:
   - `OPENVIBE_AI_URL`
   - `OPENVIBE_AI_INTERNAL_URL`
   - `AI_OPENVIBE_NETWORK_HOST`

2. Default local dev behavior:
   - public URL fallback: `http://localhost:5100`
   - internal URL fallback: `http://localhost:5100`
   - canonical host: `ai.openvibe.network`

3. Register service identity:
   - service id: `openvibe-ai`
   - public host/domain: `ai.openvibe.network`
   - public URL: env-driven `OPENVIBE_AI_URL`
   - internal URL: env-driven `OPENVIBE_AI_INTERNAL_URL`
   - topics produced/consumed: `ai.events`, optionally `system.events`
   - capabilities: all `ai.*` capabilities added in this phase

4. Host-aware routing:
   - If the existing control plane/gateway supports host routing, add `ai.openvibe.network`.
   - If not, document the reverse-proxy expectation and add local service support for host `ai.openvibe.network`.
   - Do not break existing host routing for `auth`, `api`, `admin`, `my`, `themes`, `live`, `chat`, `community`, `billing`, or other completed services.

5. Canonical API path:
   - Prefer versioned routes under `/api/v1/ai/*`.
   - Keep `/api/ai/*` compatibility aliases if that matches existing service conventions.
   - SDK should use the configured base URL and should not hardcode localhost.

---

# 2. Service boundary for Phase 7

## 2.1 `openvibe-ai` owns

`openvibe-ai` is the cross-platform AI backend orchestration service.

It should own canonical OpenVibe state and behavior for:

- AI providers
- AI models
- provider routing
- provider API key references/secrets metadata
- local/stub model provider
- prompt templates
- workflow templates
- workflow runs/jobs
- AI request logs
- AI response metadata
- token/cost estimates
- budget/usage tracking
- cache records
- source documents/snippets metadata
- citation/source provenance
- embedding/vector-search seam
- content generation jobs
- summarization jobs
- extraction/classification jobs
- enrichment jobs
- moderation-assist jobs
- admin-configurable AI settings
- per-service AI quotas
- per-user/per-service rate limits
- safe failure/fallback routing
- global AI API requests for all OpenVibe AI-powered services

`openvibe-ai` should not own:

- raw media object storage
- billing ledger truth
- stream/chat/community canonical state
- full wiki/blog/news/reviews/deals/coupons product implementations
- final marketplace/mod trust-tier implementation
- production scraper fleet implementation
- secret storage beyond safe env/config references unless existing project patterns support encrypted secrets

It should integrate with those systems through events, capabilities, SDK calls, and service APIs.

## 2.2 Product surfaces for this phase

Phase 7 should create AI orchestration foundations and thin product-facing seams for:

- `openvibe.wiki`
  - generate Wikipedia-like knowledge spaces
  - page tree generation workflow templates
  - source/citation-aware synthesis
  - custom page editing seam later

- `openvibe.blog`
  - AI-assisted posts
  - scheduled/niche blog generation workflow templates
  - official/user blog drafting seam later

- `openvibe.news`
  - multi-source summarization
  - perspective/slant/tone controls
  - source transparency workflow templates

- `openvibe.reviews`
  - entity/review aggregation summarization
  - pros/cons extraction
  - credibility/source metadata seam

- `openvibe.deals`
  - deal summarization/comparison
  - keyword/watch enrichment
  - shopping search cleanup workflow seam

- `openvibe.coupons`
  - coupon extraction/classification/validation summaries
  - browser extension helper API seam later

- `openvibe.trade`
  - market/news summary
  - watchlist/alert explanation seam
  - informational-only analysis templates

- `openvibe.codes`
  - docs/tutorial generation assist
  - SDK/capability example generation
  - codebase/RFC summarization
  - vibe-coding tutorial workflow templates

- `openvibe.tools`
  - common tool-assist AI workflows

- `openvibe.games`
  - game/world/lore/NPC/helper generation seams

If the workspace does not already have these product services, do not over-split yet. Implement the AI workflow templates, capability contracts, and SDK helpers now. Create product-specific route groups only if they are lightweight and clearly useful.

---

# 3. Implement or evolve `openvibe-ai`

If `services/openvibe-ai` already exists, evolve it.
If it does not exist, create it in the same Node/Express/service pattern used by the current OpenVibe services.

Do not invent a new framework.

Use existing workspace conventions:

- Express service
- better-sqlite3 persistence unless an existing abstraction says otherwise
- `@openvibe/contracts`
- `@openvibe/sdk`
- service-auth middleware
- policy assertions
- events client
- service registry declarations
- docs/tests structure

Suggested default service port:
- `5100`, unless the existing registry/config indicates a different open port.

Required package identity:
- package name: `@openvibe/ai`
- description: `OpenVibe shared AI orchestration platform for ai.openvibe.network`
- service id: `openvibe-ai`

## 3.1 Data model

Implement safe additive migrations/storage for AI.

Minimum canonical models:

### AI providers

Support fields equivalent to:

- `id`
- `provider_key`
  - `stub`
  - `openai`
  - `anthropic`
  - `gemini`
  - `ollama`
  - `openrouter`
  - `local_http`
  - `custom`
- `display_name`
- `status`
  - `active`
  - `disabled`
  - `degraded`
- `base_url`
- `auth_mode`
  - `none`
  - `env`
  - `header`
  - `bearer`
  - `custom`
- `api_key_env`
- `default_model`
- `supports_chat`
- `supports_json`
- `supports_embeddings`
- `supports_tools`
- `supports_streaming`
- `timeout_ms`
- `priority`
- `created_at`
- `updated_at`
- `metadata_json`

Rules:
- never store raw API keys in SQLite unless the repo already has an encrypted secret store.
- prefer storing env var names like `OPENVIBE_AI_OPENAI_API_KEY`.
- local dev must work with `stub` provider and no external keys.

### AI models

Support fields equivalent to:

- `id`
- `provider_id`
- `model_key`
- `display_name`
- `model_type`
  - `chat`
  - `completion`
  - `embedding`
  - `vision`
  - `rerank`
  - `moderation`
  - `custom`
- `status`
  - `active`
  - `disabled`
  - `degraded`
- `context_window`
- `max_output_tokens`
- `cost_input_per_million`
- `cost_output_per_million`
- `supports_json`
- `supports_tools`
- `supports_streaming`
- `created_at`
- `updated_at`
- `metadata_json`

### AI routes / routing profiles

Support fields equivalent to:

- `id`
- `route_key`
  - `default.chat`
  - `default.json`
  - `default.embedding`
  - `wiki.generate`
  - `blog.draft`
  - `news.summarize`
  - `reviews.summarize`
  - `deals.enrich`
  - `coupons.extract`
  - `trade.summarize`
  - `codes.generate_docs`
  - `games.generate_lore`
- `primary_provider_id`
- `primary_model_id`
- `fallback_provider_id`
- `fallback_model_id`
- `temperature`
- `max_output_tokens`
- `response_format`
  - `text`
  - `json`
  - `markdown`
- `status`
- `created_at`
- `updated_at`
- `metadata_json`

### Prompt templates

Support fields equivalent to:

- `id`
- `template_key`
- `name`
- `description`
- `version`
- `input_schema_json`
- `output_schema_json`
- `system_prompt`
- `user_prompt_template`
- `default_route_key`
- `owner_type`
- `owner_id`
- `visibility`
  - `system`
  - `service`
  - `public`
  - `private`
- `status`
  - `active`
  - `draft`
  - `deprecated`
  - `archived`
- `created_at`
- `updated_at`
- `metadata_json`

### AI workflow definitions

Support fields equivalent to:

- `id`
- `workflow_key`
- `name`
- `description`
- `service_namespace`
  - `wiki`
  - `blog`
  - `news`
  - `reviews`
  - `deals`
  - `coupons`
  - `trade`
  - `codes`
  - `tools`
  - `games`
  - `system`
- `version`
- `input_schema_json`
- `steps_json`
- `output_schema_json`
- `default_route_key`
- `status`
- `created_at`
- `updated_at`
- `metadata_json`

### AI workflow runs / jobs

Support fields equivalent to:

- `id`
- `workflow_key`
- `workflow_version`
- `template_key`
- `route_key`
- `status`
  - `queued`
  - `running`
  - `succeeded`
  - `failed`
  - `cancelled`
  - `cached`
- `requested_by_type`
- `requested_by_id`
- `source_service`
- `target_type`
  - `wiki`
  - `blog`
  - `news`
  - `reviews`
  - `deals`
  - `coupons`
  - `trade`
  - `codes`
  - `tools`
  - `games`
  - `community`
  - `live`
  - `system`
- `target_id`
- `input_json`
- `output_json`
- `error`
- `trace_id`
- `idempotency_key`
- `created_at`
- `started_at`
- `completed_at`
- `metadata_json`

### AI requests / completions log

Support fields equivalent to:

- `id`
- `run_id`
- `provider_id`
- `model_id`
- `route_key`
- `status`
  - `started`
  - `succeeded`
  - `failed`
  - `fallback_used`
  - `cached`
- `prompt_hash`
- `input_tokens_estimate`
- `output_tokens_estimate`
- `cost_estimate`
- `latency_ms`
- `error`
- `created_at`
- `completed_at`
- `metadata_json`

Do not log raw private prompts/responses by default if they may contain user secrets. Store hashes, metadata, and opt-in debug payloads only when configured.

### AI source documents / citations

Support fields equivalent to:

- `id`
- `run_id`
- `source_type`
  - `url`
  - `media`
  - `community_post`
  - `blog_post`
  - `manual`
  - `uploaded_file`
  - `legacy`
- `source_id`
- `url`
- `title`
- `author`
- `published_at`
- `retrieved_at`
- `snippet`
- `content_hash`
- `trust_score`
- `metadata_json`

### AI cache

Support fields equivalent to:

- `cache_key`
- `route_key`
- `prompt_hash`
- `input_hash`
- `output_json`
- `expires_at`
- `created_at`
- `metadata_json`

### AI quotas / usage

Support fields equivalent to:

- `id`
- `actor_type`
- `actor_id`
- `service_namespace`
- `period`
  - `minute`
  - `hour`
  - `day`
  - `month`
- `limit_requests`
- `limit_tokens`
- `limit_cost`
- `used_requests`
- `used_tokens`
- `used_cost`
- `window_start`
- `window_end`
- `updated_at`

### AI audit log

Support fields equivalent to:

- `id`
- `actor_type`
- `actor_id`
- `action`
- `target_type`
- `target_id`
- `trace_id`
- `created_at`
- `metadata_json`

## 3.2 APIs

Implement REST APIs using the existing service route patterns.

Canonical public domain:
- `ai.openvibe.network`

Canonical versioned API:
- `/api/v1/ai/*`

Compatibility aliases:
- `/api/ai/*` may alias to `/api/v1/ai/*` if this matches existing service conventions.

Minimum APIs:

### Health / status

- `GET /health`
- `GET /api/v1/ai/status`
- `GET /api/v1/ai/admin/summary`

Health/status should show:
- service ok
- canonical host/domain
- configured public/internal URLs
- DB ok
- active provider count
- active route count
- queue/job summary
- event service dependency status if practical

### Providers/models/admin

- `GET /api/v1/ai/providers`
- `POST /api/v1/ai/providers`
- `GET /api/v1/ai/providers/:providerId`
- `PUT /api/v1/ai/providers/:providerId`
- `DELETE /api/v1/ai/providers/:providerId` or soft-disable
- `GET /api/v1/ai/models`
- `POST /api/v1/ai/models`
- `PUT /api/v1/ai/models/:modelId`
- `DELETE /api/v1/ai/models/:modelId` or soft-disable

Admin/provider routes must require service/admin permission. Do not trust client-side admin flags.

Provider API responses must never return raw API keys. Returning `api_key_env` is acceptable.

### Routing profiles

- `GET /api/v1/ai/routes`
- `POST /api/v1/ai/routes`
- `GET /api/v1/ai/routes/:routeKey`
- `PUT /api/v1/ai/routes/:routeKey`
- `DELETE /api/v1/ai/routes/:routeKey` or soft-disable

### Prompt templates

- `GET /api/v1/ai/templates`
- `POST /api/v1/ai/templates`
- `GET /api/v1/ai/templates/:templateKey`
- `PUT /api/v1/ai/templates/:templateKey`
- `POST /api/v1/ai/templates/:templateKey/deprecate`

### Workflow definitions

- `GET /api/v1/ai/workflows`
- `POST /api/v1/ai/workflows`
- `GET /api/v1/ai/workflows/:workflowKey`
- `PUT /api/v1/ai/workflows/:workflowKey`
- `POST /api/v1/ai/workflows/:workflowKey/deprecate`

### Workflow run/job APIs

- `POST /api/v1/ai/runs`
  - creates a run/job from workflow_key/template_key/input
  - validates actor permission
  - validates quota
  - supports idempotency key
  - optionally executes synchronously for stub/simple workflows
  - otherwise queues job

- `GET /api/v1/ai/runs`
- `GET /api/v1/ai/runs/:runId`
- `POST /api/v1/ai/runs/:runId/cancel`
- `POST /api/v1/ai/runs/:runId/retry`

### Direct AI capability APIs

These are convenience APIs over workflow/template routing:

- `POST /api/v1/ai/chat`
- `POST /api/v1/ai/generate`
- `POST /api/v1/ai/summarize`
- `POST /api/v1/ai/classify`
- `POST /api/v1/ai/extract`
- `POST /api/v1/ai/enrich`
- `POST /api/v1/ai/embed`

Each must:
- use route profiles
- enforce quotas
- emit events
- record request metadata
- support stub/local provider
- sanitize output shape

### Source/citation APIs

- `POST /api/v1/ai/sources`
- `GET /api/v1/ai/runs/:runId/sources`
- `POST /api/v1/ai/runs/:runId/sources`
- `GET /api/v1/ai/runs/:runId/citations`

This creates the foundation for transparent wiki/news/reviews outputs.

### Product workflow APIs

Implement lightweight route groups for future products.

These should create AI runs using registered workflow definitions, not hardcoded one-off logic:

- `POST /api/v1/ai/wiki/generate-space`
- `POST /api/v1/ai/wiki/generate-page`
- `POST /api/v1/ai/blog/draft-post`
- `POST /api/v1/ai/news/summarize-story`
- `POST /api/v1/ai/news/compare-perspectives`
- `POST /api/v1/ai/reviews/summarize-entity`
- `POST /api/v1/ai/deals/enrich-deal`
- `POST /api/v1/ai/coupons/extract-coupon`
- `POST /api/v1/ai/trade/summarize-market-context`
- `POST /api/v1/ai/codes/generate-docs`
- `POST /api/v1/ai/games/generate-lore`

Do not fully implement the product services here. These endpoints should provide working AI orchestration seams and testable stub outputs.

### Cache/usage/admin

- `GET /api/v1/ai/admin/usage`
- `GET /api/v1/ai/admin/cache`
- `DELETE /api/v1/ai/admin/cache/:cacheKey`
- `POST /api/v1/ai/admin/recalculate-usage`

## 3.3 Provider system

Implement provider abstraction.

Required providers:

### Stub provider

Must work locally without any external API key.

Behavior:
- returns deterministic outputs
- supports chat/generate/summarize/classify/extract/enrich/embed in a simple fake way
- useful for tests and local demos
- clearly marks output as stub-generated
- should make product workflows return realistic shapes, not nonsense placeholders

### Local HTTP provider seam

Optional if simple:
- allows configuring `base_url`
- sends a generic local-model request shape
- disabled unless configured

### External provider seams

Add safe adapter skeletons for common providers:
- OpenAI
- Anthropic
- Gemini
- OpenRouter
- Ollama/local

Do not require external packages or real calls unless existing dependency patterns make that practical.
If implementing real HTTP calls, use built-in fetch in Node 18+ and strict timeouts.
Never print API keys.
Never store API keys directly.

Provider adapter interface should support:

- `chat({ messages, model, options })`
- `generate({ prompt, model, options })`
- `summarize({ text, sources, model, options })`
- `classify({ input, labels, model, options })`
- `extract({ input, schema, model, options })`
- `enrich({ input, schema, model, options })`
- `embed({ input, model, options })`
- `supports(feature)`

## 3.4 Routing/fallback

Implement AI route selection.

Requirements:

- route_key maps to primary provider/model
- fallback provider/model optional
- disabled/degraded providers are skipped
- failed primary attempts fallback if configured
- request log records fallback usage
- response includes provider/model metadata unless hidden by policy
- local/stub route exists by default
- `ai.openvibe.network` must be the documented canonical API base for all consumers

Seed default routes:

- `default.chat`
- `default.json`
- `default.embedding`
- `wiki.generate`
- `blog.draft`
- `news.summarize`
- `reviews.summarize`
- `deals.enrich`
- `coupons.extract`
- `trade.summarize`
- `codes.generate_docs`
- `games.generate_lore`
- `moderation.classify`

## 3.5 Prompt/workflow templates

Seed default workflow/template records.

Minimum templates/workflows:

### Wiki

- `wiki.generate_space`
  - input: topic, desired_depth, source_hints, tone
  - output: title, summary, page_tree, suggested_sources

- `wiki.generate_page`
  - input: topic, page_title, sources, style
  - output: markdown, citations, infobox_fields, related_pages

### Blog

- `blog.draft_post`
  - input: title/topic, audience, sources, tone, target_length
  - output: markdown, title, excerpt, tags, citations

### News

- `news.summarize_story`
  - input: source_items, perspective_mode, requested_angle
  - output: factual_summary, perspectives, timeline, source_table, caveats

- `news.compare_perspectives`
  - input: source_items
  - output: source-perspective comparison, claims, caveats

### Reviews

- `reviews.summarize_entity`
  - input: entity, review_items, categories
  - output: pros, cons, common_complaints, score_summary, source_breakdown

### Deals

- `deals.enrich_deal`
  - input: product/deal data, price history hints, source
  - output: summary, caveats, comparable_items, tags, deal_quality

### Coupons

- `coupons.extract_coupon`
  - input: page/text/source
  - output: code, discount, restrictions, expiration, merchant, confidence

### Trade

- `trade.summarize_market_context`
  - input: symbol/topic, news_items, timeframe
  - output: neutral_summary, risks, catalysts, caveats
  - must include informational-only metadata/caveat

### Codes

- `codes.generate_docs`
  - input: API/contract/source snippets
  - output: markdown docs, examples, warnings

### Games

- `games.generate_lore`
  - input: game/world brief, style, constraints
  - output: lore, NPC ideas, quest ideas, item ideas

### Moderation

- `moderation.classify`
  - input: text/media metadata
  - output: categories, severity, confidence, explanation

All seeded templates should be versioned and status=`active`.

## 3.6 Jobs/queue behavior

Implement a simple AI job runner using current project patterns.

Requirements:

- create queued run
- process synchronously for simple/stub requests where practical
- expose retry/cancel
- track status
- track error
- emit events
- enforce idempotency
- no unbounded recursion
- no long-running API request without timeout
- no infinite requeue loop

If existing `openvibe-events` work queue can support this directly, integrate with it. If not, implement a local `ai_runs` job state with clear future event-worker seam.

## 3.7 Quotas, budgets, and usage

Implement basic usage controls.

Rules:
- every run increments request usage
- token/cost can be estimated when real provider gives no exact data
- enforce per-actor/per-service limits
- default generous local dev quota for stub provider
- quota denial should return clear HTTP 429/402-style error depending on semantics
- usage data should be queryable by admin

Add config/env for:
- default per-minute requests
- default per-day requests
- default token budget
- whether debug prompt logging is allowed
- default provider/route

Do not integrate real billing charges in this phase unless straightforward. But leave a clear seam for future billing-metered AI usage.

## 3.8 Caching

Implement basic cache support.

Requirements:
- cache key derived from route/template/input hash
- TTL support
- no cache for requests marked `no_cache`
- cached response returns status/metadata showing `cached=true`
- admin can inspect/delete cache entries
- cache should not leak private user data across actors; include privacy-sensitive actor/namespace keys where needed

## 3.9 Events

Publish through the existing Phase 1 event backbone.

Required event types:

- `ai.provider.created`
- `ai.provider.updated`
- `ai.provider.disabled`
- `ai.model.created`
- `ai.model.updated`
- `ai.route.created`
- `ai.route.updated`
- `ai.template.created`
- `ai.template.updated`
- `ai.workflow.created`
- `ai.workflow.updated`
- `ai.run.created`
- `ai.run.queued`
- `ai.run.started`
- `ai.run.succeeded`
- `ai.run.failed`
- `ai.run.cancelled`
- `ai.run.cached`
- `ai.usage.recorded`
- `ai.quota.exceeded`
- `ai.source.attached`

Events should include:

- event type/version
- trace_id if supported
- actor info
- provider/model/route/workflow/run IDs where relevant
- source service
- sanitized payload
- never include raw API keys
- avoid logging full private prompt text unless debug mode explicitly allows it

## 3.10 Capabilities/contracts

Register/add contracts for:

AI core:
- `ai.provider.create`
- `ai.provider.update`
- `ai.provider.disable`
- `ai.model.create`
- `ai.route.configure`
- `ai.template.create`
- `ai.workflow.create`
- `ai.run.create`
- `ai.run.cancel`
- `ai.run.retry`

AI tasks:
- `ai.chat`
- `ai.generate`
- `ai.summarize`
- `ai.classify`
- `ai.extract`
- `ai.enrich`
- `ai.embed`

Product workflows:
- `ai.wiki.generate_space`
- `ai.wiki.generate_page`
- `ai.blog.draft_post`
- `ai.news.summarize_story`
- `ai.news.compare_perspectives`
- `ai.reviews.summarize_entity`
- `ai.deals.enrich_deal`
- `ai.coupons.extract_coupon`
- `ai.trade.summarize_market_context`
- `ai.codes.generate_docs`
- `ai.games.generate_lore`
- `ai.moderation.classify`

Update OpenVibe contracts with:

- AI event constants
- AI topic constants
- AI capability constants
- provider/model statuses
- workflow statuses
- run statuses
- route keys
- workflow keys
- product namespace constants for AI
- service ID/registry constants for `openvibe-ai`
- canonical domain constant for `ai.openvibe.network`

Update OpenVibe SDK with:

- `AiClient`
- configurable base URL, defaulting from `OPENVIBE_AI_URL` when available
- provider/model/admin helpers
- route/template/workflow helpers
- run/job helpers
- direct task helpers:
  - `chat`
  - `generate`
  - `summarize`
  - `classify`
  - `extract`
  - `enrich`
  - `embed`
- product workflow helpers:
  - `generateWikiSpace`
  - `generateWikiPage`
  - `draftBlogPost`
  - `summarizeNewsStory`
  - `compareNewsPerspectives`
  - `summarizeReviewsEntity`
  - `enrichDeal`
  - `extractCoupon`
  - `summarizeTradeContext`
  - `generateCodesDocs`
  - `generateGameLore`

Export `AiClient` from the SDK root.

## 3.11 Policy enforcement

Use the existing Phase 1/2 policy engine or service-local seam consistent with current patterns.

Enforce server-side:

- admin-only provider/model/route mutation
- admin/service-only prompt/workflow template creation where appropriate
- user/service/mod run creation based on allowed capability and quota
- service namespace restrictions for product workflows
- private source/citation read restrictions
- debug prompt/response logging only when authorized
- no raw API-key exposure
- cache isolation for private inputs
- cancellation/retry permissions

No client-only checks.

## 3.12 User modules integration

Use user modules for user AI preferences/summaries only, not as raw AI job truth.

Potential namespaces:

- `ai.preferences`
- `ai.usage_summary`
- `wiki.projects`
- `blog.profile`
- `news.preferences`
- `reviews.preferences`
- `deals.watch_preferences`
- `coupons.preferences`
- `trade.watch_preferences`
- `codes.preferences`
- `games.creator_preferences`

Do not store full high-volume prompt/completion logs in user modules.

## 3.13 Integration with `openvibe-media`

AI outputs may reference media but should not store raw files.

Requirements:

- source documents can reference `media_id`
- generated assets can request/create media records through `openvibe-media` later
- image/audio/video analysis remains a seam unless implementation is straightforward
- no raw uploaded files in `openvibe-ai` tables

## 3.14 Integration with `openvibe-community`

Add discussion/source transparency seams:

- AI-generated wiki/blog/news/review/deal/coupon outputs should be able to attach source/citation metadata
- community comments/discussions can later attach to generated content
- moderation/classification workflow can be used by community later

Do not rewrite community authorization in this phase.

## 3.15 Integration with `openvibe-billing`

Add usage/budget seam:

- optionally expose `cost_estimate`
- support future billing-metered AI usage
- do not charge real credits yet unless the Phase 6 billing API makes it trivially safe
- if charges are implemented, they must be through `BillingClient` and idempotent
- default local AI usage should not require billing

## 3.16 Legacy Hobo/HoboStreamer compatibility

Inspect legacy references to AI, vibe-coding helpers, news, generated content, and tool assistance.

Preserve old behavior with adapters only where relevant.

Rules:
- no destructive migration
- no removal of old endpoints
- add OpenVibe AI compatibility bridge only if legacy code has AI-like endpoints to bridge
- if there are no legacy AI endpoints, document that Phase 7 is additive and does not need Hobo compatibility shims yet

---

# 4. Product workflow scaffolding

Phase 7 should not fully build every product, but it must create strong first-class workflow contracts and testable API outputs.

## 4.1 Wiki workflow

Implement a working stub/local workflow:

- input: topic
- output:
  - wiki title
  - summary
  - page tree
  - suggested source list
  - generated page markdown for at least one page
  - citations/source placeholders

The output should be deterministic under stub provider.

## 4.2 Blog workflow

Implement a working stub/local workflow:

- input: topic/title/audience
- output:
  - title
  - excerpt
  - markdown draft
  - tags
  - citations/source placeholders

## 4.3 News workflow

Implement a working stub/local workflow:

- input: list of source items or story text
- output:
  - factual summary
  - perspectives
  - timeline/caveats
  - source transparency list

## 4.4 Reviews workflow

Implement a working stub/local workflow:

- input: entity + review snippets
- output:
  - pros
  - cons
  - common themes
  - source breakdown

## 4.5 Deals workflow

Implement a working stub/local workflow:

- input: deal/product data
- output:
  - summary
  - quality/caveats
  - comparison hints
  - tags

## 4.6 Coupons workflow

Implement a working stub/local workflow:

- input: text/page snippet
- output:
  - coupon code
  - discount
  - restrictions
  - expiration
  - confidence

## 4.7 Trade workflow

Implement a working stub/local workflow:

- input: symbol/topic + source items
- output:
  - neutral informational summary
  - risks
  - catalysts
  - caveats
  - not-financial-advice metadata

## 4.8 Codes workflow

Implement a working stub/local workflow:

- input: contracts/source snippets
- output:
  - docs markdown
  - examples
  - warnings
  - next steps

## 4.9 Games workflow

Implement a working stub/local workflow:

- input: game/world brief
- output:
  - lore
  - NPC ideas
  - quest ideas
  - item ideas

---

# 5. Admin and user-facing surfaces

Implement minimal usable UI/admin surfaces matching current workspace patterns.

## 5.1 Admin AI console

If current admin/control-plane surfaces exist, add lightweight admin/internal diagnostics for:

- providers
- models
- route profiles
- prompt templates
- workflows
- runs/jobs
- failed runs
- usage/quotas
- cache
- event emission health
- canonical `ai.openvibe.network` URL/config status

Do not rewrite the whole admin app.

## 5.2 Developer/test console

Add a minimal local UI or JSON-friendly routes for testing:

- run summarize
- run generate
- run product workflow
- view run status
- view output/citations
- test stub provider
- confirm canonical API base URL

If a static `public` folder is the established pattern, add simple pages under `services/openvibe-ai/public`.

## 5.3 User preferences seam

If current `my.openvibe.network` or user module APIs make it straightforward, add docs or small helper APIs for:

- default AI style
- preferred summary length
- preferred news perspective mode
- opt-out of AI personalization
- debug/history preferences

Do not overbuild account UI in this phase.

---

# 6. Optional migration/backfill scripts

If legacy data structures are clear enough, add idempotent migration scripts for:

- legacy AI/vibe-coding prompts
- legacy generated-content experiments
- legacy news/integration content
- legacy tool-helper prompts
- legacy prompt templates if present

Rules:

- no destructive changes
- idempotent by legacy source/id
- dry-run mode required
- log skipped/failed rows
- do not require production access
- if no legacy AI data exists, document that no backfill is needed

---

# 7. Documentation requirements

Update or create Phase 7 docs.

Suggested docs if the workspace uses `docs/openvibe`:

- `docs/openvibe/phase-7-ai-backend.md`
- `docs/openvibe/ai-service.md`
- `docs/openvibe/ai-provider-routing.md`
- `docs/openvibe/ai-workflows.md`
- `docs/openvibe/ai-product-seams.md`
- `docs/openvibe/legacy-ai-migration.md`

Docs must cover:

- `ai.openvibe.network` as the canonical API/global AI service domain
- AI service boundary
- provider/model config
- no-API-key stub provider
- route/fallback model
- prompt templates
- workflow definitions
- run/job lifecycle
- cache behavior
- quotas/usage
- source/citation model
- privacy/debug logging rules
- event/capability contracts
- SDK usage examples
- product workflow examples for wiki/blog/news/reviews/deals/coupons/trade/codes/games
- env vars/config keys
- local development
- reverse-proxy/host-routing expectation for `ai.openvibe.network`
- manual validation
- deferred work

Update root/phase docs if they already exist from Phases 1–6.

Also update:

- `PHASES.md`
  - mark Phase 7 implemented only after validation
  - document acceptance criteria in the same style as prior phases

- root `README.md`
  - include `openvibe-ai` in layout/quick start if appropriate

- URL/config docs
  - include `OPENVIBE_AI_URL`
  - include `OPENVIBE_AI_INTERNAL_URL`
  - include `AI_OPENVIBE_NETWORK_HOST`

---

# 8. Tests/checks

Add practical regression coverage where current test harness supports it.

At minimum:

AI service tests:

- boot/build app
- seed stub provider/model/routes/templates/workflows
- service registry includes `openvibe-ai`
- URL registry includes `OPENVIBE_AI_URL` and `OPENVIBE_AI_INTERNAL_URL`
- canonical host/domain is exposed in status
- create provider/model/route as admin/service actor
- deny provider/model mutation to unauthorized actor
- run direct `summarize`
- run direct `generate`
- run direct `classify`
- run `wiki.generate_space`
- run `blog.draft_post`
- run `news.summarize_story`
- run `reviews.summarize_entity`
- run `deals.enrich_deal`
- run `coupons.extract_coupon`
- run `trade.summarize_market_context`
- run `codes.generate_docs`
- run `games.generate_lore`
- idempotency prevents duplicate run creation
- cache returns cached result for same route/input
- quota exceeded returns clear denial
- fallback route records fallback usage
- run failure emits failed event
- source/citation records attach to run
- no raw API keys are returned from provider APIs
- `/api/v1/ai/*` canonical routes work
- `/api/ai/*` compatibility aliases work if implemented

Integration tests:

- service registry declaration exists
- capability registry entries exist
- contract exports exist
- SDK exports `AiClient`
- AI events validate
- policy denies unauthorized admin/provider operations
- event emission smoke test
- product workflow outputs are deterministic under stub provider

If no test harness exists, add the lightest practical smoke scripts and document manual validation.

Run basic checks:

- install/build/test commands already present in the workspace
- syntax checks for changed JS/TS
- service boot smoke test if practical

Do not claim tests were run unless you actually run them.

---

# 9. Migration safety rules

- Do not delete data.
- Do not destructively rename tables.
- Do not remove legacy Hobo/HoboStreamer routes.
- Do not require production AI provider credentials for local development.
- Do not store raw API keys in SQLite/plaintext.
- Do not log private prompts/responses by default.
- Do not leak one user/service’s cached private output to another user/service.
- Do not bypass Phase 1 events/capabilities/registry/policy primitives.
- Do not bypass `openvibe-media` for source/media references.
- Do not bypass `openvibe-billing` if adding any paid/metered AI seam.
- Do not fully implement wiki/blog/news/reviews/deals/coupons/trade/games/tools product services in this phase.
- Do not implement the full mod marketplace/trust-tier system in this phase.
- Do not break existing host-aware routing or URL registry behavior.
- Preserve backward-compatible Hobo aliases/adapters until later cleanup phases.
- Keep all generated product outputs source-transparent where the workflow claims to use sources.

---

# 10. Optional production inspection block

If local code or migration docs reveal that real production data is required for a safe backfill plan, include this optional section in your final response only; do not run it yourself.

OPTIONAL — requires explicit developer permission to run against production

Production SSH target is configured as `hobo.tools`.

Default mode is inspect-only. Suggested non-destructive commands only:

- inspect service directories
- inspect database schema
- count legacy AI/vibe-coding prompt rows
- count legacy generated-content/news/integration rows
- inspect prompt/template/config variable names without printing secret values
- inspect env/config variable names without printing secret values
- inspect whether any legacy AI provider keys exist by variable name only, not value
- inspect reverse-proxy/server config names for future `ai.openvibe.network` routing without printing secrets

Before any remote command:

- summarize the exact command
- require explicit developer confirmation
- remind developer to redact secrets/tokens/IPs before pasting logs back

Do not suggest destructive production commands.

---

# 11. Final response format

When finished, provide:

1. Confirmatory analysis summary.
2. Files changed.
3. What changed in each file/group.
4. Schema/migration changes.
5. Env/config changes.
6. Host/domain routing changes for `ai.openvibe.network`.
7. Tests/checks run.
8. Manual validation steps.
9. Legacy compatibility notes.
10. Deferred work for later phases.
11. Explicit statement of how the implementation satisfies Phase 7.

Implement the code. Do not output only a plan.