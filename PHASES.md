# OpenVibe — Phase status

Execution note: earlier planning drafts used a different label for late-phase
mod work. The checked-in repository now treats **Phase 8** as the native
runtime-independence + migration milestone and **Phase 9** as the hardening /
parity / final-cutover-truthfulness tranche. The table below reflects the
current execution track.

| # | Name | Status | Where |
|---|---|---|---|
| 1 | Platform Kernel Foundations | ✅ implemented in this commit | `services/openvibe-network`, `services/openvibe-events`, `packages/openvibe-contracts`, `packages/openvibe-sdk` |
| 2 | Identity / Control Plane Extraction | 🚧 native cutover in progress | `services/openvibe-network/server/identity.js` + host surfaces |
| 3 | Media platform extraction | ✅ implemented in this commit | `services/openvibe-media`, `packages/openvibe-contracts/src/media-namespaces.js`, `packages/openvibe-sdk` (`MediaClient`), `compat/hobostreamer/` + `/opt/hobostreamer/server/openvibe-bridge/media.js` |
| 4 | openvibe.live + openre.stream split | ✅ implemented in this commit | `services/openvibe-live` (SSR), `services/openre-stream` (ingest/restream), `packages/openvibe-contracts/src/stream-events.js`, `packages/openvibe-sdk` (`StreamClient`), `/opt/hobostreamer/server/openvibe-bridge/stream.js` |
| 5 | Chat / community / product migration | ✅ implemented in this commit | `services/openvibe-chat`, `services/openvibe-community`, `packages/openvibe-contracts/{chat-events,community-events}.js`, `packages/openvibe-sdk` (`ChatClient`, `CommunityClient`), `/opt/hobostreamer/server/openvibe-bridge/{chat,community}.js` |
| 6 | Billing / credits / tips ledger | ✅ implemented in this commit | `services/openvibe-billing`, `packages/openvibe-contracts/billing-events.js`, `packages/openvibe-sdk` (`BillingClient`), `/opt/hobostreamer/server/openvibe-bridge/billing.js` |
| 7 | AI / SEO / Sources / Search backbone | ✅ implemented in this commit | `services/openvibe-ai`, `packages/openvibe-contracts/ai-events.js`, `packages/openvibe-sdk` (`AiClient`), `/opt/hobostreamer/server/openvibe-bridge/ai.js` |
| 8 | OpenVibe runtime independence + Hobo migration | 🚧 in progress | `scripts/migrate-hobo/`, `scripts/cutover/`, native OpenVibe surfaces, `docs/openvibe/phase-8.md` |
| 9 | Hard-cut hardening + cutover parity | 🚧 in progress | `context/PHASE_9.md`, `scripts/migrate-hobo/`, cutover/reporting/browser parity work |
| 10 | Scalable runtime foundation / deploy / readiness | 🚧 in progress | `context/PHASE_10_SCALING.md`, `packages/openvibe-runtime`, `packages/openvibe-observability`, `deploy/`, `scripts/readiness/` |
| 11 | Runtime parity bring-up | ✅ implemented | `context/PHASE_11_RUNTIME_PARITY.md` |
| 14 | Queue-native + legacy roots | ✅ implemented | `context/PHASE_14_QUEUE_NATIVE_AND_LEGACY_ROOTS.md` |
| 15 | Native processors, public hosts, canonical bootstrap | ✅ implemented | `context/PHASE_15_NATIVE_PROCESSORS_AND_PRODUCT_POLISH.md` |
| 16 | Product workflows (chat call participants, community paste versions + Discord audit, tips/VIP/live status seams) + capability catalog + canonical migration alignment | ✅ shipped slices 1–4, 6–8, 11; slices 5/9/10 truthfully deferred | `context/PHASE_16_PRODUCT_WORKFLOWS_AND_CANONICAL_RUNTIME.md` |

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
2. `auth.openvibe.network` exposes `/.well-known/openid-configuration`
   and `/.well-known/jwks.json` with the active RS256 public key for native
   OpenVibe authentication. It serves the OpenVibe authorization flow directly
   and does not depend on a live `hobo.tools` process. ✅
3. `themes.openvibe.network`, `admin.openvibe.network`,
   `my.openvibe.network` serve OpenVibe-branded shells natively. Legacy Hobo
   API compatibility is not part of the default runtime path. ✅
4. URL registry compatibility: the OpenVibe network mirrors imported
   `hobo-tools` registry data as a migration input, while OpenVibe-native
   URLs are authoritative. ✅
5. HoboStreamer can verify tokens from `auth.openvibe.network` via the
   additive `OPENVIBE_*` env vars and compatibility shim in
   [HoboStreamer.com/server/auth/openvibe-issuer.js](../HoboStreamer.com/server/auth/openvibe-issuer.js).
   Legacy `hobo.tools` verification is optional and disabled by default. ✅

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

## Phase 9 — hard-cut hardening + cutover parity 🚧

Phase 9 is the follow-on tranche that converts the large Phase 8 foundation
into a cutover path operators can trust. It focuses on safety defaults,
truthful reports, browser parity, and compatibility-off validation rather than
net-new platform categories.

1. **Phase 9 baseline doc** — [context/PHASE_9.md](context/PHASE_9.md)
   captures the active hardening scope, work packages, and verification loop. ✅
2. **Localhost/staging URL correctness** — shared origin resolution now keeps
   `openvibe.*.localhost` surfaces on local canonical domains instead of
   leaking to production URLs. Verified in-session via browser validation. ✅
3. **Production fetch hardening** — [scripts/migrate-hobo/fetch-production-hobo.js](scripts/migrate-hobo/fetch-production-hobo.js)
   now defaults to dry-run, refuses snapshot/copy flows without `--confirm`,
   supports `--production-paths`, expands analytics DB discovery, and emits a
   richer `production-fetch-report.json`. Covered by
   [scripts/migrate-hobo/test/production-fetch.test.js](scripts/migrate-hobo/test/production-fetch.test.js). ✅
4. **Focused + repo-wide validation** — the current Phase 9 fetch tranche is
   verified by `node scripts/migrate-hobo/test/production-fetch.test.js`,
   `npm run check`, and `npm test`. ✅
5. **Postgres runtime truthfulness** — tighten loader/validator/readiness flows
   so runtime messaging matches actual canonical persistence behavior. ⏳
6. **Cutover report honesty** — the top-level rehearsal now emits `phase: 9`,
   records `track: 'hard-cut-hardening'`, and can fold
   `data/migrations/browser-smoke-report.json` into the final gate via
   `browser_smoke_gate`. Additional go/no-go tightening remains next. 🚧
7. **Browser smoke/parity harness** — initial harness landed at
   [scripts/staging/browser-smoke.js](scripts/staging/browser-smoke.js) with
   regression coverage in
   [scripts/staging/test/browser-smoke.test.js](scripts/staging/test/browser-smoke.test.js).
   In-session browser checks also verified real local pages for
   `openvibe.network.localhost`, `openvibe.tools.localhost`,
   `openvibe.live.localhost`, and `openvibe.chat.localhost`. 🚧
8. **Compatibility-off staging proof** — validate native OpenVibe flows with
   `OPENVIBE_LEGACY_COMPAT_MODE=false` and no hidden Hobo runtime dependency. ⏳

## Phase 10 — scalable runtime foundation 🚧

Phase 10 is the first implementation slice of the horizontally scalable target.
It does not finish Postgres/Redis/media-plane/realtime in one shot, but it does
land the shared runtime contract every later tranche depends on.

1. **Shared runtime packages** — `packages/openvibe-observability`,
   `packages/openvibe-runtime`, `packages/openvibe-persistence`, and
   `packages/openvibe-redis` now exist as first-pass foundation packages. ✅
2. **Async orchestration foothold** — `packages/openvibe-queue` and
   `services/openvibe-workers` now provide the first checked-in queue / worker
   registry layer for distributed background execution. ✅
3. **Truthful runtime endpoints** — every native service entrypoint now exposes
   `/health`, `/ready`, and `/metrics` via the shared runtime middleware. ✅
4. **Admin runtime visibility** — `admin.openvibe.network` now includes a
   runtime tab with readiness checks and metrics preview. ✅
5. **Deployment scaffolding** — `deploy/nginx/**`, `deploy/env/**`, and
   `deploy/compose/docker-compose.local.yml` provide the first checked-in
   runtime deployment templates. ✅
6. **Repo-level readiness** — `scripts/readiness/check-scalable-runtime.js`
   writes `data/migrations/runtime-readiness-report.json` and is exposed at the
   root via `npm run readiness`. ✅
7. **CI validation** — `.github/workflows/ci.yml` now runs install, syntax,
   tests, and offline scalable-runtime readiness. ✅
8. **Still next** — true Postgres repository adapters, Redis-backed live
   processors, realtime gateway, object-storage-native media flows, DVR/clips, and AI media
   analysis remain follow-on implementation work. ⏳

## Phase 16 — product workflows + canonical runtime polish ✅

Phase 16 is an incremental product runtime tranche layered on the Phase 14/15
foundations (canonical bootstrap helper, capability registry seed). All
eleven slices ship with truthful schemas, routes, smoke coverage, and
admin matrix wiring.

1. **Canonical bootstrap consolidation** — already shipped in Phase 15 via
   [packages/openvibe-persistence/canonical-bootstrap.js](packages/openvibe-persistence/canonical-bootstrap.js). ✅
2. **Capability registry seed** — already shipped in Phase 15 via
   [packages/openvibe-contracts/capabilities.js](packages/openvibe-contracts/capabilities.js)
   and `seedCapabilityRegistry` in
   [services/openvibe-network/server/index.js](services/openvibe-network/server/index.js). ✅
3. **Chat call participants, stream bindings, audio integrations** — new
   tables, model functions, routes, and event types with
   [services/openvibe-chat/test/chat-smoke.test.js](services/openvibe-chat/test/chat-smoke.test.js)
   coverage. ✅
4. **Community paste version history + Discord relay audit + outbound mock
   seam** — new tables, model functions, routes, and event types with
   [services/openvibe-community/test/community-smoke.test.js](services/openvibe-community/test/community-smoke.test.js)
   coverage. ✅
5. **Content full DB-backed product workflows** — `content_review_decisions`
   and `content_distribution_audit` tables (sqlite + postgres mirror),
   review/distribution routes, and `GET /api/v1/content/product/status`
   with [services/openvibe-content/test/content-api.test.js](services/openvibe-content/test/content-api.test.js)
   coverage. ✅
6. **Tips product status seam** — `GET /api/tips/product/status`. ✅
7. **VIP product status seam** — `GET /api/vip/product/status`. ✅
8. **Live stream integrations descriptor** — `GET /api/v1/streams/:id/integrations`
   returns the composition map of chat/tips/vip/audio/ai URLs. ✅
9. **Browser smoke workflow checks** — four new product/status JSON
   surface checks in [scripts/staging/browser-smoke.js](scripts/staging/browser-smoke.js)
   (tips, VIP, AI, content) plus updated test fixtures. ✅
10. **Admin runtime product matrix UI** — `buildRuntimeStatus` fans out
    to all four `/product/status` endpoints and admin.html renders a
    `product-capability-matrix` panel under the runtime tab. ✅
11. **Phase 16 tracker doc** — [context/PHASE_16_PRODUCT_WORKFLOWS_AND_CANONICAL_RUNTIME.md](context/PHASE_16_PRODUCT_WORKFLOWS_AND_CANONICAL_RUNTIME.md). ✅
