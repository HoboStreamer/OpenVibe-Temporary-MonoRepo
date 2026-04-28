# OpenVibe — Phase status

Numbering follows the later (corrected) numbering used in
[context/META_PROMPT_FOR_CHATGPT.md](context/META_PROMPT_FOR_CHATGPT.md):

| # | Name | Status | Where |
|---|---|---|---|
| 1 | Platform Kernel Foundations | ✅ implemented in this commit | `services/openvibe-network`, `services/openvibe-events`, `packages/openvibe-contracts`, `packages/openvibe-sdk` |
| 2 | Identity / Control Plane Extraction | 🚧 native cutover in progress | `services/openvibe-network/server/identity.js` + host surfaces |
| 3 | Media platform extraction | ✅ implemented in this commit | `services/openvibe-media`, `packages/openvibe-contracts/src/media-namespaces.js`, `packages/openvibe-sdk` (`MediaClient`), `compat/hobostreamer/` + `/opt/hobostreamer/server/openvibe-bridge/media.js` |
| 4 | openvibe.live + openre.stream split | ✅ implemented in this commit | `services/openvibe-live` (SSR), `services/openre-stream` (ingest/restream), `packages/openvibe-contracts/src/stream-events.js`, `packages/openvibe-sdk` (`StreamClient`), `/opt/hobostreamer/server/openvibe-bridge/stream.js` |
| 5 | Chat / community / product migration | ✅ implemented in this commit | `services/openvibe-chat`, `services/openvibe-community`, `packages/openvibe-contracts/{chat-events,community-events}.js`, `packages/openvibe-sdk` (`ChatClient`, `CommunityClient`), `/opt/hobostreamer/server/openvibe-bridge/{chat,community}.js` |
| 6 | Billing / credits / tips ledger | ✅ implemented in this commit | `services/openvibe-billing`, `packages/openvibe-contracts/billing-events.js`, `packages/openvibe-sdk` (`BillingClient`), `/opt/hobostreamer/server/openvibe-bridge/billing.js` |
| 7 | AI / SEO / Sources / Search backbone | ✅ implemented in this commit | `services/openvibe-ai`, `packages/openvibe-contracts/ai-events.js`, `packages/openvibe-sdk` (`AiClient`), `/opt/hobostreamer/server/openvibe-bridge/ai.js` |
| 8 | Mods + trust tiers | ⏳ deferred | extends capability + policy registries |

> Note: the checked-in SQLite services remain useful for local bring-up, but
> the requested hard-cut target is PostgreSQL-backed native OpenVibe runtime
> with legacy Hobo folders used only for export/migration/reference.

## Phase 1 — Platform Kernel Foundations: acceptance

1. `services/openvibe-events` boots, persists events with full envelope
   (`event_id`, `trace_id`, `event_type`, `version`, `source`, `actor_*`,
   `timestamp`, `payload`), supports topic + subscription filtering, has a
   work-queue with ack / retry, and a dead-letter table. ✅
2. `services/openvibe-network` exposes:
   * `POST/GET /api/v1/user-modules/:userId/:namespace` — namespaced shared
     user data, owner-attested writes, schema/version aware. ✅
   * `POST/GET /api/v1/services` — service registry (id, internal/public URL,
     declared capabilities + topics, last heartbeat). ✅
   * `POST/GET /api/v1/capabilities` — capability registry (owner service,
     input/output schemas, version, rate-limit policy). ✅
   * `POST/GET /api/v1/contracts` — contract registry (event/user-module/media
     schema definitions). ✅
3. The policy engine ([server/policy.js](services/openvibe-network/server/policy.js))
   is the single decision point used by all four registries above and by the
   user-modules API. ✅
4. All writes are audited in `audit_log`. ✅
5. No client-trusted writes — every mutating route runs through both
   `requireOpenVibeAuth` and `policy.assert(...)` before touching the DB. ✅

## Phase 2 — Identity / Control Plane Extraction: acceptance

1. Host-aware routing serves `auth.openvibe.network`, `api.openvibe.network`,
   `admin.openvibe.network`, `my.openvibe.network`,
   `themes.openvibe.network`. ✅
2. `auth.openvibe.network` exposes
   `/.well-known/openid-configuration` and `/.well-known/jwks.json` with the
   active RS256 public key (the existing hobo-tools key in federation mode).
   It also redirects to the existing hobo-tools `/oauth/authorize` so existing
   client redirects keep working. ✅
3. `themes.openvibe.network`, `admin.openvibe.network`,
   `my.openvibe.network` serve OpenVibe-branded shells **and** transparently
   proxy the existing hobo-tools API for the legacy surfaces, so existing
   browsers continue working through the new domains. ✅
4. URL registry compatibility: the OpenVibe network mirrors the
   `hobo-tools` registry plus `OPENVIBE_*` keys with documented Hobo
   fallbacks. ✅
5. HoboStreamer can verify a token from **either** `hobo.tools` or
   `auth.openvibe.network` via the additive `OPENVIBE_*` env vars
   (compat shim in [HoboStreamer.com/server/auth/openvibe-issuer.js](../HoboStreamer.com/server/auth/openvibe-issuer.js)).
   When the OpenVibe env vars are absent the existing Hobo flow is bit-for-bit
   unchanged. ✅

## Phase 3 — Media platform extraction: acceptance

1. `services/openvibe-media` boots on port `4500`, persists media in
   `media_objects` + `media_derivatives` + `media_jobs` + `media_quotas` +
   `media_usage` + `media_lifecycle_audit` + `media_legacy_map`. ✅
2. Single namespace registry
   ([packages/openvibe-contracts/src/media-namespaces.js](packages/openvibe-contracts/src/media-namespaces.js))
   covers `live.vods`, `live.clips`, `live.thumbnails`,
   `live.stream_snapshots`, `live.media_requests`, `community.pastes`,
   `community.attachments`, `chat.attachments`, `chat.tts_audio`,
   `user.profile_images`, `tools.images`, `games.assets`, `wiki.assets`,
   `blog.assets`. Per-namespace defaults seeded in `config.defaultQuotas`. ✅
3. Upload flow `POST /media/upload/init` → `PUT /media/:id/upload` →
   `POST /media/:id/upload/complete` enqueues thumbnail / metadata jobs and
   emits `media.upload.initialized`, `media.uploaded`,
   `media.processing.started`, `media.derivative.created`,
   `media.processing.completed`, `media.ready` on topic `media.events`. ✅
4. Hot/warm/cold tiers managed via `archive` (`status=archived`,
   `tier=cold`) and `restore` (`status=ready`, `tier=warm`); soft-delete via
   `DELETE /media/:id`. ✅
5. Storage seam: `LocalStorageProvider` (default) or `S3SeamProvider`
   selected via `STORAGE_PROVIDER`; key path `<namespace>/<id>.<ext>`. ✅
6. Read access: public/unlisted always allowed; private/restricted owner-or-
   admin only — gated centrally by `policy.decideRead`. ✅
7. Per-owner-namespace quotas (file size, storage cap, file count, mime
   allow-list, type allow-list) enforced before write. ✅
8. HoboStreamer compat shim `mirrorUploadSafe` lives at
   [/opt/hobostreamer/server/openvibe-bridge/media.js](/opt/hobostreamer/server/openvibe-bridge/media.js);
   inert when `OPENVIBE_MEDIA_URL` is unset. ✅
9. Service test
   `services/openvibe-media/test/model-policy-quota.test.js` passes. ✅
10. End-to-end live curl flow validated in this session — see
    [docs/openvibe/phase-3-media.md](docs/openvibe/phase-3-media.md). ✅

## Phase 4 — openvibe.live (SSR product) + openre.stream (infra) split: acceptance

1. `services/openre-stream` boots on port `4700` and is the authority for
   stream lifecycle — schema covers `channels`, `streams`,
   `ingest_sessions`, `restream_destinations`, `output_state`,
   `mirror_state`, `legacy_id_map`. ✅
2. Routes `POST /api/v1/channels`, `POST /api/v1/streams` (returns RTMP /
   WHIP / JSMpeg ingest URLs), `POST /api/v1/streams/:id/{start,end,attach-vod}`,
   `POST /api/v1/destinations`, `POST /api/v1/streams/:id/output`,
   `POST /api/v1/ingest/{connected,disconnected}` all gated by
   `policy.assert`. ✅
3. Lifecycle events emitted on topic `stream.events`: `stream.created`,
   `stream.started`, `stream.mirrored_to_live`, `stream.ended`,
   `stream.vod.attached`. Wrapper merges channel context into the
   `buildStreamEventPayload(stream, extra)` envelope. ✅
4. `services/openvibe-live` boots on port `4600` and serves SSR pages at
   `/`, `/@:slug`, `/@:slug/s/:streamId` (with legacy `/c/:slug*`
   compatibility redirects). Every page emits `<title>`,
   `<meta name=description>`, `<link rel=canonical>`, full og: + twitter:
   card metadata. `og:type` flips to `video.other` when the channel is
   live; offline channels render an SEO-clean shell with
   `og:type=website`. ✅
5. `services/openvibe-live` accepts stream events two ways: push from
   `openvibe-events` to `POST /api/v1/events/stream` (single envelope or
   `{events:[...]}`), and direct service-authenticated upserts. The read
   model uses COALESCE-based upserts and never destroys data. ✅
6. URL registry overlay
   ([services/openvibe-network/server/api/url-registry.js](services/openvibe-network/server/api/url-registry.js))
   now advertises `OPENVIBE_MEDIA_URL`, `OPENVIBE_LIVE_URL`,
   `OPENRE_STREAM_URL` (and their `_INTERNAL_URL` variants). ✅
7. HoboStreamer compat shim
   [/opt/hobostreamer/server/openvibe-bridge/stream.js](/opt/hobostreamer/server/openvibe-bridge/stream.js)
   exposes `upsertChannelSafe`, `createStreamSafe`, `startStreamSafe`,
   `endStreamSafe`, `attachVodSafe` — inert when `OPENRE_STREAM_URL` is
   unset. ✅
8. Service tests `services/openre-stream/test/lifecycle.test.js` and
   `services/openvibe-live/test/ssr.test.js` pass. ✅
9. End-to-end live curl flow validated in this session: create →
   start → end (with VOD attached) produces the expected event sequence in
   `openvibe-events` and lights up the SSR page on `openvibe-live` with
   the LIVE NOW badge — see
   [docs/openvibe/phase-4-live-restream.md](docs/openvibe/phase-4-live-restream.md). ✅
10. Migration map per legacy table → new namespace / table / event
    documented in [docs/openvibe/migration-map.md](docs/openvibe/migration-map.md). ✅

## Phase 5 — openvibe-chat + openvibe-community: acceptance

1. `services/openvibe-chat` boots on port `4800`. Schema covers
   `chat_rooms`, `chat_participants`, `chat_messages`, `chat_call_sessions`,
   `chat_call_signals`, `chat_tts_settings`, `chat_audio_queue`,
   `chat_legacy_map`. ✅
2. `services/openvibe-community` boots on port `4900`. Schema covers
   `community_spaces`, `community_categories`, `community_threads`,
   `community_posts`, `community_pastes`, `community_attachments`,
   `community_discord_relays`, `community_discord_messages`,
   `community_legacy_map`. ✅
3. Chat REST surface: rooms, messages, edit/delete, DMs, call signaling
   envelopes, TTS settings + queue, soundboard / external-audio queue.
   Compatibility wrappers `/api/chat/{global,stream/:id,channel/:id}/*`
   keep HoboStreamer URLs stable via `ensureRoomForExternal()`. ✅
4. Community REST surface: spaces, categories, threads, posts, reusable
   comments via `(ref_type, ref_id)`, pastes (with legacy `/api/pastes/*`
   compatibility mount), Discord relay management + inbound webhook with
   `community_discord_messages.discord_message_id` loop prevention. ✅
5. Events emitted on `chat.events` and `community.events` topics use the
   canonical envelope and pass `is{Chat,Community}EventType` validation. ✅
6. Policy seams: `decideRead` / `decideSend` / `decideEdit` /
   `decideDelete` / `decideTtsOwnership` / `decideCallParticipant` for chat;
   `decideRead` / `decidePost` / `decideEdit` / `decideDelete` /
   `decidePasteOwnership` / `decideRelayManage` for community. All
   mutations route through `policy.assert`. ✅
7. Attachments in `community_attachments` reference `media_id` only — the
   community DB never holds raw paths or external URLs (those belong to
   `openvibe-media`). ✅
8. SDK clients `ChatClient` and `CommunityClient` exported from
   `@openvibe/sdk` and re-used internally by both services for cross-
   service calls. ✅
9. HoboStreamer compatibility shims
   [/opt/hobostreamer/server/openvibe-bridge/chat.js](/opt/hobostreamer/server/openvibe-bridge/chat.js)
   and
   [/opt/hobostreamer/server/openvibe-bridge/community.js](/opt/hobostreamer/server/openvibe-bridge/community.js)
   are inert when `OPENVIBE_CHAT_URL` / `OPENVIBE_COMMUNITY_URL` are unset.
   ✅
10. Service smoke tests `services/openvibe-chat/test/chat-smoke.test.js` and
    `services/openvibe-community/test/community-smoke.test.js` exercise
    model + policy in-process and pass. End-to-end curl flow validated:
    `POST /api/chat/rooms`, `POST /api/community/spaces`, `POST
    /api/community/threads`, and legacy `POST /api/pastes` all return
    `201` with the canonical resource shape. See
    [docs/openvibe/phase-5-chat-community.md](docs/openvibe/phase-5-chat-community.md),
    [docs/openvibe/chat-service.md](docs/openvibe/chat-service.md),
    [docs/openvibe/community-service.md](docs/openvibe/community-service.md),
    [docs/openvibe/legacy-chat-pastes-migration.md](docs/openvibe/legacy-chat-pastes-migration.md).
    ✅

## Phase 6 — openvibe-billing: acceptance

1. `services/openvibe-billing` boots on port `5000`. Schema covers
   `billing_wallets`, `billing_ledger`, `billing_balance_snapshots`,
   `billing_checkout_sessions`, `billing_webhook_receipts`, `billing_tips`,
   `billing_subscription_plans`, `billing_subscriptions`,
   `billing_creator_balances`, `billing_idempotency`, `billing_audit`,
   `billing_economy_state`, `billing_legacy_map`. ✅
2. Ledger guarantees: every multi-row post runs inside
   `db.get().transaction(...)`; refunds are compensating entries
   (`transaction_type='reversal'`) and the original rows are never mutated;
   per-key idempotency is enforced via `billing_ledger.idempotency_key` and
   `billing_tips.idempotency_key` so retries return the same group/tip
   without double-posting. ✅
3. Credits flow: checkout → provider URL → webhook (or explicit
   `complete`) → `credit_purchase` row → snapshot updated. Stub provider
   wired via `server/providers/stub.js`. Charging emits
   `billing.credits.charged`; insufficient funds throws `EFUNDS` with
   HTTP 402. ✅
4. Tips / superchat / TTS / media-request: double-entry post
   (sender debit → creator credit → optional `platform_fee` based on
   `PLATFORM_FEE_BPS`) plus a `billing_tips` row; per-interaction events
   `tips.tip.created`, `tips.superchat.created`, `tips.tts.created`,
   `tips.media_request.created` are published on `tips.events`. Overlay
   feed `GET /api/tips/overlay/:targetType/:targetId` filters
   `public`/`anonymous` and strips sender id when `visibility=anonymous`.
   ✅
5. VIP / subscriptions: `/api/vip/plans` CRUD, `/api/vip/subscriptions`
   create/cancel/renew. Subscription create charges the subscriber and
   credits the plan owner inside a single `db.transaction(...)`, computes
   `current_period_end` from `billing_interval`, and publishes
   `vip.subscription.created` + `vip.subscription.activated` +
   `vip.entitlement.granted`. Cancel publishes `vip.subscription.cancelled`
   + `vip.entitlement.revoked`. Entitlement check via
   `POST /api/billing/entitlements/check`. ✅
6. Economy freeze: `POST /api/billing/admin/freeze` flips the single-row
   `billing_economy_state` and `assertEconomyNotFrozen()` blocks new
   spends/purchases/tips/subscriptions with `EFROZEN` (HTTP 423) while
   reads and admin endpoints stay available; `unfreeze` publishes
   `billing.economy.unfrozen`. ✅
7. Policy seams: `decideWalletRead` / `decideAdjust` / `decideCharge` /
   `decideCheckoutCreate` / `decideTip` / `decideRefund` /
   `decidePlanManage` / `decideSubscriptionCreate` /
   `decideSubscriptionCancel` / `decideEconomyFreeze` route through
   `policy.assert`. Service callers identified via
   `X-Internal-Key` + `X-OpenVibe-Service` (local
   `serviceActorMiddleware`). ✅
8. SDK client `BillingClient` exported from `@openvibe/sdk`; HoboStreamer
   compat shim
   [/opt/hobostreamer/server/openvibe-bridge/billing.js](/opt/hobostreamer/server/openvibe-bridge/billing.js)
   is inert when `OPENVIBE_BILLING_URL` is unset. ✅
9. Service smoke test
   `services/openvibe-billing/test/billing-smoke.test.js` exercises wallet
   ensure-idempotency, purchase / charge / refund, EFUNDS overdraft,
   snapshot-vs-recompute parity, tip with platform fee, superchat variant,
   plan + subscription + cancel, economy freeze, and policy decisions —
   passes via `node services/openvibe-billing/test/billing-smoke.test.js`.
   ✅
10. `billing_legacy_map(source, kind, legacy_id)` remains useful as a
   dedupe/reconciliation seam for legacy finance references, but the current
   authoritative hard-cutover policy is to **exclude Hobo Bucks balances from
   canonical OpenVibe import**. Historical Hobo Bucks rows stay
   archive/reconciliation-only; no mutable legacy balance is carried into
   OpenVibe. See
   [docs/openvibe/persistence-cutover-plan.md](docs/openvibe/persistence-cutover-plan.md),
   [docs/openvibe/hobo-to-openvibe-data-map.md](docs/openvibe/hobo-to-openvibe-data-map.md),
   [docs/openvibe/legacy-billing-migration.md](docs/openvibe/legacy-billing-migration.md),
   [docs/openvibe/phase-6-billing-tips-vip.md](docs/openvibe/phase-6-billing-tips-vip.md),
   [docs/openvibe/billing-service.md](docs/openvibe/billing-service.md),
   [docs/openvibe/tips-service.md](docs/openvibe/tips-service.md),
   [docs/openvibe/vip-service.md](docs/openvibe/vip-service.md).
   ✅

## Validation

```bash
cd /opt/openvibe
npm install
npm run check       # node --check across every server file
npm test            # in-repo module tests
```

Manual local validation steps live in
[services/openvibe-network/README.md](services/openvibe-network/README.md)
and [services/openvibe-events/README.md](services/openvibe-events/README.md).

## Phase 7 — AI / SEO / Sources / Search backbone: acceptance

1. `services/openvibe-ai` boots on port `5100`. Canonical public host is
   `ai.openvibe.network` (advertised through
   [services/openvibe-network/server/api/url-registry.js](services/openvibe-network/server/api/url-registry.js)).
   ✅
2. Schema covers 16 tables: `ai_providers`, `ai_models`, `ai_routes`,
   `ai_prompt_templates`, `ai_workflows`, `ai_runs` (UNIQUE
   `idempotency_key`), `ai_requests`, `ai_sources`, `ai_cache`,
   `ai_quotas`, `ai_audit`, `seo_content`, `content_sources`,
   `content_ingestion_jobs`, `search_documents` (+
   `database_schema_version`). ✅
3. **No raw API keys ever stored.** `ai_providers.api_key_env` /
   `content_sources.api_key_env` reference an environment-variable
   name only. The `/api/v1/ai/providers` listing strips any field
   named `api_key`, `apiKey`, or `token` defensively. ✅
4. Stub provider works **offline with no external credentials** and is
   the seeded default for `default.chat`, `default.json`,
   `default.embedding`, and every product workflow route. ✅
5. Idempotent runs: `runner.executeRun({ idempotency_key })` returns
   `{ replayed: true }` on UNIQUE collision without re-executing.
   Cache hits short-circuit and return `cached:true` and increment
   quota by 1 request. Per-day quota enforcement throws
   `EAIQUOTA` (HTTP 429) at the route layer. ✅
6. Provider+route fallback recorded as `ai_requests.status='fallback_used'`
   so degradation is observable. If both fail, the run row is marked
   `failed` and `EAIPROVIDER` (HTTP 502) is returned. ✅
7. Default routes seeded (14): `default.{chat,json,embedding}`,
   `wiki.generate`, `blog.draft`, `news.summarize`,
   `reviews.summarize`, `deals.enrich`, `coupons.extract`,
   `trade.summarize`, `codes.generate_docs`, `tools.describe`,
   `games.generate_lore`, `moderation.classify`. Default templates and
   workflows are seeded for every product namespace, with product-facing
   output packaging metadata for `openvibe.wiki`, `openvibe.blog`,
   `openvibe.news`, `openvibe.reviews`, `openvibe.deals`,
   `openvibe.coupons`, `openvibe.trade`, `openvibe.codes`,
   `openvibe.tools`, and `openvibe.games`. ✅
8. Default content-source registry seeded (23 entries) covering wiki,
   blog, news, reviews, deals, coupons, trade, plus protocol primitives
   (`rss`, `sitemap`, `json_ld`, `robots_txt`). Sources requiring an
   API key default to `enabled=false` until an admin enables them. ✅
9. SEO helpers in [seo.js](services/openvibe-ai/server/seo.js):
   `normalizeSlug`, `canonicalize`, `duplicateHash`, `generateMetadata`,
   `evaluateIndexability`, `generateStructuredData`,
   `generateSitemap{,Index}`, `generateRssFeed`, `generateAtomFeed`,
   `generateRobotsTxt`. Indexability gate is **deterministic**: thin
   content, missing sources, stub-in-production, and duplicate-without-
   canonical all force `noindex`. ✅
10. JSON-LD generators **never fabricate** ratings, prices, currencies,
    coupon expirations, or recipe ingredients. Sitemaps exclude
    entries with `indexable: false`. ✅
11. Trade workflow outputs always include
    `not_financial_advice: true` and a disclaimer (enforced at the
    route layer in
    [routes.js](services/openvibe-ai/server/routes.js)). ✅
12. Local SQLite-backed search index seam (`search_documents`,
    provider id `local-sqlite`). `/api/v1/ai/search/{index,query,
    delete,status}` mounted; visibility and `indexing_status` are
    respected. Future Meilisearch / Typesense / OpenSearch adapters
    can swap in without changing the SDK contract. ✅
13. SDK `AiClient` exported from `@openvibe/sdk` with full method
   surface (providers, models, routes, templates, workflows, runs,
   direct tasks, product workflows including `describeTool()` /
   `generateToolPage()`, SEO helpers, source registry, ingestion jobs,
   search seam). ✅
14. `/opt/hobostreamer/server/openvibe-bridge/ai.js` is additive and
    inert when `OPENVIBE_AI_URL` is unset. Methods:
    `summarizeSafe`, `generateSafe`, `classifySafe`,
    `extractCouponSafe`, `enrichDealSafe`,
    `evaluateIndexabilitySafe`, `generateSeoMetadataSafe`. ✅
15. Service smoke test
   `services/openvibe-ai/test/ai-smoke.test.js` exercises seed,
   direct runner, idempotency replay, cache hit, quota exceeded,
   indexability gate (thin / sufficient / dupe / stub-in-production),
   JSON-LD safety (no fabricated `Review.reviewRating`, no fabricated
   `Offer`), sitemap exclusion of `indexable=false`, source registry,
   ingestion job lifecycle, search index round-trip, provider HTTP
   response excludes raw API key fields, product-output packages for
   every product seam (including `openvibe.tools`), and trade-workflow
   disclaimer enforcement. `npm test` (project-wide): **11 files, 11
   pass, 0 fail**. ✅
16. Documentation: [docs/openvibe/phase-7-ai-backend.md](docs/openvibe/phase-7-ai-backend.md),
    [ai-service.md](docs/openvibe/ai-service.md),
    [ai-provider-routing.md](docs/openvibe/ai-provider-routing.md),
    [ai-workflows.md](docs/openvibe/ai-workflows.md),
    [ai-product-seams.md](docs/openvibe/ai-product-seams.md),
    [legacy-ai-migration.md](docs/openvibe/legacy-ai-migration.md),
    [seo-foundation.md](docs/openvibe/seo-foundation.md),
    [content-source-registry.md](docs/openvibe/content-source-registry.md),
    [ai-generated-content-indexing-policy.md](docs/openvibe/ai-generated-content-indexing-policy.md),
    [product-seo-workflows.md](docs/openvibe/product-seo-workflows.md),
    [search-index-seam.md](docs/openvibe/search-index-seam.md),
    [source-adapter-research.md](docs/openvibe/source-adapter-research.md). ✅

## Phase 8 — OpenVibe runtime independence + Hobo migration 🚧

The migration toolchain, native surfaces, and readiness artifacts exist, but
the hard-cut runtime conversion is still in progress. See
[docs/openvibe/phase-8.md](docs/openvibe/phase-8.md) for the per-WP index.

Current hard-cut additions include the new `services/openvibe-games/` runtime
for migrated player progression, inventory/bank state, cosmetics, daily quests,
and collaborative canvas APIs/UI.

1. **Hobo reference audit** — [scripts/audit-hobo-references.js](scripts/audit-hobo-references.js)
   classifies every `hobo*` mention as migration-source, legacy-compat,
   runtime-default-dependency, documentation, test-fixture, archive, or
   needs-remediation; writes `data/migrations/audit/hobo-ref-list.json` +
   `hobo-ref-summary.md`. Tested by
   [scripts/migrate-hobo/test/hobo-reference-audit.test.js](scripts/migrate-hobo/test/hobo-reference-audit.test.js). ✅
2. **Native runtime stance** — `OPENVIBE_LEGACY_COMPAT_MODE=false` by
   default; documented in [docs/openvibe/runtime-independence.md](docs/openvibe/runtime-independence.md). ✅
3. **Production export over SSH** — `scripts/migrate-hobo/fetch-production-hobo.js`
   pulls read-only mirrors; documented in [docs/openvibe/production-ssh-export.md](docs/openvibe/production-ssh-export.md). ✅
4. **Postgres canonical loader** — schemas in
   [scripts/migrate-hobo/postgres/schema/](scripts/migrate-hobo/postgres/schema/),
   loader/validator/CLIs at
   [migrate-postgres.js](scripts/migrate-hobo/migrate-postgres.js),
   [load-postgres.js](scripts/migrate-hobo/load-postgres.js),
   [validate-postgres.js](scripts/migrate-hobo/validate-postgres.js); test
   [scripts/migrate-hobo/test/postgres-loader.test.js](scripts/migrate-hobo/test/postgres-loader.test.js). ✅
5. **Staging environment + cold media** — gated by
   `OPENVIBE_ALLOW_STAGING_LOAD` + `OPENVIBE_STAGING_CONFIRM`; documented in
   [staging-environment.md](docs/openvibe/staging-environment.md) +
   [media-storage-strategy.md](docs/openvibe/media-storage-strategy.md). ✅
6. **Persistence-mode seam** — [packages/openvibe-sdk/persistence-mode.js](packages/openvibe-sdk/persistence-mode.js)
   wired into [services/openvibe-network/server/db.js](services/openvibe-network/server/db.js);
   tested by [packages/openvibe-sdk/test/persistence-mode.test.js](packages/openvibe-sdk/test/persistence-mode.test.js). ✅
7. **Media backfill** — [docs/openvibe/media-backfill.md](docs/openvibe/media-backfill.md). ✅
8. **Semantic validation** — [docs/openvibe/semantic-validation.md](docs/openvibe/semantic-validation.md). ✅
9. **Cutover rehearsal** — [scripts/cutover/run-cutover-rehearsal.js](scripts/cutover/run-cutover-rehearsal.js)
   + [scripts/cutover/verify-cutover.js](scripts/cutover/verify-cutover.js);
   produces `data/migrations/cutover-report.json` with red/yellow/green
   gates. Documented in [docs/openvibe/cutover-runbook.md](docs/openvibe/cutover-runbook.md);
   tested by [scripts/cutover/test/cutover-rehearsal.test.js](scripts/cutover/test/cutover-rehearsal.test.js). ✅
10. **Hobo Bucks / Coins / Nickels** — Hobo Bucks excluded from spendable
    canonical balances and archived to `legacy_finance_archive(spendable=false)`;
    Coins/Nickels imported as non-cash loyalty progression. Loader sets
    `hobo_bucks_excluded=true` + `loyalty_imported_as_progression=true`;
    documented in [docs/openvibe/hobo-coins-loyalty-migration.md](docs/openvibe/hobo-coins-loyalty-migration.md). ✅
11. **Centralized staff/admin model** — [services/openvibe-network/server/api/staff.js](services/openvibe-network/server/api/staff.js)
    mounted under `/api/v1`; capabilities, audit log, ban/broadcast hooks.
    Tested by [services/openvibe-network/test/staff.test.js](services/openvibe-network/test/staff.test.js).
    Documented in [docs/openvibe/admin-staff-model.md](docs/openvibe/admin-staff-model.md). ✅
12. **Native openvibe.network hub** — [services/openvibe-network/public/index.html](services/openvibe-network/public/index.html). ✅
13. **Native openvibe.tools portal** — [services/openvibe-network/public/tools.html](services/openvibe-network/public/tools.html)
    served via the new `tools` surface in [host-router.js](services/openvibe-network/server/host-router.js). ✅
14. **Admin UI** — [services/openvibe-network/public/admin.html](services/openvibe-network/public/admin.html)
    (overview, users/staff, registry, audit, migration, compatibility tabs). ✅
15. **My account UI** — [services/openvibe-network/public/my.html](services/openvibe-network/public/my.html). ✅
16. **Themes UI** — [services/openvibe-network/public/themes.html](services/openvibe-network/public/themes.html). ✅
17. **OpenVibe Live UI** — [services/openvibe-live/public/index.html](services/openvibe-live/public/index.html). ✅
18. **OpenVibe Chat UI** — [services/openvibe-chat/public/index.html](services/openvibe-chat/public/index.html). ✅
19. **OpenVibe Community UI** — [services/openvibe-community/public/index.html](services/openvibe-community/public/index.html). ✅
20. **OpenVibe Media UI** — [services/openvibe-media/public/index.html](services/openvibe-media/public/index.html). ✅
21. **Compatibility-mode flag** — `OPENVIBE_LEGACY_COMPAT_MODE` is the single
    switch. Default `false` keeps the network OpenVibe-native. ✅
22. **Phase 8 docs** — full set under [docs/openvibe/](docs/openvibe/) (see
    [phase-8.md](docs/openvibe/phase-8.md) for the index). ✅
23. **Cutover report** — `data/migrations/cutover-report.json` produced by the
    orchestrator; current local gate: **green** (audit-only). ✅
