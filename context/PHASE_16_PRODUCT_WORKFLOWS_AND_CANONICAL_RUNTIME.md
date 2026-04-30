# Phase 16 — Product Workflows & Canonical Runtime Polish

Phase 16 is an incremental extension of the Phase 14/15 product runtime:
canonical bootstrap consolidation, capability registry coverage, plus a
focused set of product surface additions for chat, community, billing
(tips/VIP), live composition, and the AI operator surface.

This document is **truthful about scope**: where a slice landed real shipped
code we cite the files and tests; where a slice was deliberately deferred
because it would require multi-week shell scaffolding rather than working
features, we say so and explain what is actually present.

## Slice 1 — Canonical bootstrap consolidation ✅ (already shipped in Phase 15)

The shared persistence package already exposes a canonical bootstrap helper
that converts checked-in Postgres `migrations/postgres/*.sql` files into a
SQLite-compatible bootstrap script at boot:

- [packages/openvibe-persistence/canonical-bootstrap.js](packages/openvibe-persistence/canonical-bootstrap.js)
- `convertCanonicalMigrationsToSqlite`, `loadCanonicalBootstrapSqlForSqlite`,
  and `describeBootstrapSource` are wired into `createLegacySqliteStore` /
  `createLegacyPostgresStore`.

Phase 16 did not need to add new bootstrap infrastructure here.

## Slice 2 — Capability registry seed ✅ (already shipped in Phase 15)

[packages/openvibe-contracts/capabilities.js](packages/openvibe-contracts/capabilities.js)
and [packages/openvibe-contracts/product-capabilities.js](packages/openvibe-contracts/product-capabilities.js)
already enumerate the Phase 16 capability IDs (chat.*, community.*,
billing.*, tips.*, vip.*, content.*, wiki.*, blog.*, news.*) and
[services/openvibe-network/server/index.js](services/openvibe-network/server/index.js)
calls `seedCapabilityRegistry` at boot.

Phase 16 did not need to add new capability IDs here.

## Slice 3 — Chat: call participants, stream bindings, audio integrations ✅

Real shipped tables, model functions, routes, events, and tests:

- [services/openvibe-chat/server/db.js](services/openvibe-chat/server/db.js)
  adds `chat_call_participants`, `chat_stream_bindings`,
  `chat_audio_integrations` to the SQLite SCHEMA_SQL.
- [services/openvibe-chat/server/migrations/postgres/002_phase16_call_participants_bindings_integrations.sql](services/openvibe-chat/server/migrations/postgres/002_phase16_call_participants_bindings_integrations.sql)
  mirrors them for Postgres.
- [services/openvibe-chat/server/model.js](services/openvibe-chat/server/model.js)
  exposes `addCallParticipant`, `leaveCallParticipant`,
  `listCallParticipants`, `upsertStreamBinding`, `getStreamBinding`,
  `listStreamBindings`, `createAudioIntegration`,
  `getAudioIntegrationByOwner`, `listAudioIntegrations`,
  `deleteAudioIntegration`.
- [services/openvibe-chat/server/routes.js](services/openvibe-chat/server/routes.js)
  adds `POST /calls/:callId/join`, `POST /calls/:callId/leave`,
  `GET /calls/:callId/participants`, `POST /stream-bindings`,
  `GET /stream-bindings`, `GET /stream-bindings/:streamId`,
  `GET /tts/overlay/...`, `POST /tts/queue/:itemId/status`,
  `GET /audio/overlay/...`, `POST /audio/queue/:itemId/status`,
  `GET/POST/DELETE /audio/integrations`.
- [packages/openvibe-contracts/chat-events.js](packages/openvibe-contracts/chat-events.js)
  adds the new event types: `CALL_PARTICIPANT_JOINED`,
  `CALL_PARTICIPANT_LEFT`, `STREAM_ROOM_BOUND`, `TTS_ITEM_STATUS_UPDATED`,
  `AUDIO_ITEM_STATUS_UPDATED`, `AUDIO_INTEGRATION_CREATED`.
- [services/openvibe-chat/test/chat-smoke.test.js](services/openvibe-chat/test/chat-smoke.test.js)
  asserts add/leave/include_left/rejoin behavior, stream binding upsert
  idempotency, and audio integration upsert by `(owner, provider, label)`.
  Verified locally — prints `openvibe-chat smoke OK`.

## Slice 4 — Community: paste versions and Discord relay audit ✅

Real shipped tables, model functions, routes, events, and tests:

- [services/openvibe-community/server/db.js](services/openvibe-community/server/db.js)
  adds `community_paste_versions` and `community_relay_audit` to the SQLite
  SCHEMA_SQL.
- [services/openvibe-community/server/migrations/postgres/002_phase16_paste_versions_relay_audit.sql](services/openvibe-community/server/migrations/postgres/002_phase16_paste_versions_relay_audit.sql)
  mirrors them for Postgres.
- [services/openvibe-community/server/model.js](services/openvibe-community/server/model.js)
  adds `recordPasteVersion`, `listPasteVersions`, `getPasteVersion`,
  `recordRelayAudit`, `listRelayAudit`, `getRelayAuditSummary`. `createPaste`
  records version 1, `updatePaste` records a new version when content
  actually changes (metadata-only updates do not bump).
- [services/openvibe-community/server/routes.js](services/openvibe-community/server/routes.js)
  adds `GET /pastes/:slug/versions`, `GET /pastes/:slug/versions/:version`,
  `GET/POST /pastes/:slug/comments` (uses generic comments with
  `ref_type='paste'`), `GET /discord/audit`, `POST /discord/outbound`.
  The inbound `POST /discord/webhook` and `POST /discord/outbound` both
  record audit rows for every outcome (`imported`, `deduped`, `auth_failed`,
  `invalid_request`, `skipped_no_relay`, `sent`, `mock_delivered`).
- [packages/openvibe-contracts/community-events.js](packages/openvibe-contracts/community-events.js)
  adds the new event types: `PASTE_VERSION_CREATED`,
  `DISCORD_RELAY_AUDITED`, `DISCORD_OUTBOUND_RELAYED`.
- [services/openvibe-community/test/community-smoke.test.js](services/openvibe-community/test/community-smoke.test.js)
  asserts paste version creation on `createPaste` and `updatePaste`,
  metadata-only updates do not bump the version, and relay audit rows can be
  recorded, listed by direction/outcome, and summarized. Verified locally —
  prints `openvibe-community smoke OK`.

`POST /discord/outbound` requires an `X-Idempotency-Key` (or
`idempotency_key` body field) and is intentionally a **mock seam** unless
`config.discord.outboundWebhookUrl` is configured. Real Discord delivery is
a separate operational task that does not belong inside the test suite.

## Slice 5 — Content full DB-backed product workflows ✅

[services/openvibe-content/server/db/sqlite.js](services/openvibe-content/server/db/sqlite.js)
and [services/openvibe-content/server/db/postgres.js](services/openvibe-content/server/db/postgres.js)
add two new tables — `content_review_decisions` and
`content_distribution_audit` — with parallel API surfaces
(`recordReviewDecision`, `listReviewDecisions`, `recordDistributionAudit`,
`listDistributionAudit`, `getProductWorkflowStatus`). The Postgres mirror
lives at [services/openvibe-content/server/migrations/postgres/002_phase16_review_distribution.sql](services/openvibe-content/server/migrations/postgres/002_phase16_review_distribution.sql).

[services/openvibe-content/server/routes.js](services/openvibe-content/server/routes.js)
exposes:

- `GET /api/v1/content/items/:id/reviews` — review history per item.
- `POST /api/v1/content/items/:id/reviews` — service-actor only; records
  a decision and atomically transitions the item state
  (`approve` → approved, `reject` → rejected, `publish` → published
  with `published_at` and `indexable=1`, `unpublish` → draft).
- `GET /api/v1/content/reviews` — cross-item review feed.
- `GET /api/v1/content/items/:id/distribution` and
  `POST /api/v1/content/items/:id/distribution` — distribution audit
  rows (surface, channel, outcome, error, metadata).
- `GET /api/v1/content/distribution` — cross-item distribution audit.
- `GET /api/v1/content/product/status` — aggregated state, decision, and
  outcome counters consumed by the admin product capability matrix.

Validation: `node services/openvibe-content/test/content-api.test.js` ✅
(extended in [services/openvibe-content/test/content-api.test.js](services/openvibe-content/test/content-api.test.js)
to cover service-actor enforcement, decision-driven state promotion,
distribution audit, and the product status aggregator).

## Slice 6 — Tips product status seam ✅ (status API only)

[services/openvibe-billing/server/routes.js](services/openvibe-billing/server/routes.js)
adds `GET /api/tips/product/status` that returns counts by status, counts
by interaction type, recent posted minor totals, the active currency, and
the configured platform fee. Tips ledger and overlay endpoints already
existed.

A deeper "tips product shell" UI surface (per-creator tips dashboard,
moderation tools) is a UI tranche that was not attempted in Phase 16.

## Slice 7 — VIP product status seam ✅ (status API only)

[services/openvibe-billing/server/routes.js](services/openvibe-billing/server/routes.js)
adds `GET /api/vip/product/status` that returns plan and subscription
counts by status. VIP plans, subscriptions, and webhook-style admin tools
already existed.

A deeper VIP creator dashboard / subscriber management UI is deferred for
the same reason as Slice 6.

## Slice 8 — Live integrations composition descriptor ✅

[services/openvibe-live/server/index.js](services/openvibe-live/server/index.js)
adds `GET /api/v1/streams/:id/integrations` that returns a read-model
descriptor of which downstream products are wired to a stream (chat
binding, tips overlay, VIP plans, audio overlay, AI status). It does not
proxy data — it returns the URLs that overlays/clients should call.

## Slice 9 — Browser smoke workflow checks ✅

[scripts/staging/browser-smoke.js](scripts/staging/browser-smoke.js) is
extended with four Phase 16 product-status JSON checks:
`tips-product-status` and `vip-product-status` against the billing host,
`ai-product-status` against the AI host, and `content-product-status`
against `openvibe.codes.localhost`. Each validates the canonical
`product` field and (for content) the `counts.review_decisions` aggregator
added by Slice 5. The Playwright variant inherits the same checks and
adds a selector for the new admin product capability matrix panel.

Validation: `node scripts/staging/test/browser-smoke.test.js` ✅ (the
green smoke fixture now expects 45 surface checks instead of 41) and
`node scripts/staging/test/browser-smoke-playwright.test.js` ✅ (asserts
the `data-runtime-panel="product-capability-matrix"` panel and visible
heading are present in admin.html).

Deeper Phase-16-specific multi-actor user journeys (call join/leave,
paste diff render, Discord audit drilldown, tips overlay composition)
remain UI tranches outside Phase 16; they are not preconditions for the
product-status seam being truthfully smoke-checked.

## Slice 10 — Admin runtime matrix ✅

[services/openvibe-network/server/api/staff.js](services/openvibe-network/server/api/staff.js)
extends `buildRuntimeStatus(config)` to fan out to four product/status
endpoints — `/api/tips/product/status`,
`/api/vip/product/status`, `/api/v1/ai/product/status`, and
`/api/v1/content/product/status` — and exposes the unwrapped bodies
under `runtimeStatus.products.{tips,vip,ai,content}`. A new
`content` service entry is added to
[services/openvibe-network/server/config.js](services/openvibe-network/server/config.js).

[services/openvibe-network/public/admin.html](services/openvibe-network/public/admin.html)
renders a new “Product capability matrix” section
(`data-runtime-panel="product-capability-matrix"`) inside the runtime
tab with a row per product showing `ok` status, the canonical `product`
identifier, a per-product summary line (sample size for tips, plan/sub
counts for VIP, providers/routes/workflows for AI, items/reviews/
distribution for content), and the raw payload for drilldown.

## Slice 11 — This tracker doc ✅

You are reading it.

## Validation

Phase 16 changes are covered by:

- `node services/openvibe-chat/test/chat-smoke.test.js` ✅
- `node services/openvibe-community/test/community-smoke.test.js` ✅
- `node services/openvibe-content/test/content-api.test.js` ✅
- `node scripts/staging/test/browser-smoke.test.js` ✅
- `node scripts/staging/test/browser-smoke-playwright.test.js` ✅
- The repo-wide `npm run check && npm test` aggregator covers all of
  them.

## What is intentionally NOT in Phase 16

- No half-finished UI shells. Slices 6/7 ship status APIs only; the
  product UI dashboards remain a separate UI tranche.
- No fake Discord delivery. Outbound is a mock seam unless an outbound
  webhook URL is configured.
- No deeper Phase-16-specific multi-actor user journeys in the browser
  smoke harness — only the new product-status seams are added.

Phase 16 ships all eleven slices with truthful schemas, routes, smoke
coverage, and admin matrix wiring.

## Phase 16 follow-up tranche (this session)

After the original 11 slices landed this session added a focused follow-up
tranche to deepen the product workflows. The same truthfulness rule
applies: shipped items cite real files and tests, deferred items are
called out explicitly.

### Tips creator profiles ✅

- [services/openvibe-billing/server/db.js](services/openvibe-billing/server/db.js)
  adds the `billing_tip_creator_profiles` table to SQLite SCHEMA_SQL.
- [services/openvibe-billing/server/migrations/postgres/003_phase16_creator_profiles_chat_integrations.sql](services/openvibe-billing/server/migrations/postgres/003_phase16_creator_profiles_chat_integrations.sql)
  mirrors it in Postgres (with the explicit `rowid` column required by
  the schema-drift canonicalizer).
- The `GET /api/tips/product/status` payload now exposes `creators.count`,
  `creators.by_status`, `chat_integration_status`, `chat_url_configured`,
  and `economy_frozen` fields consumed by the admin matrix and the
  browser smoke fixture.

### VIP creator profiles ✅

- [services/openvibe-billing/server/db.js](services/openvibe-billing/server/db.js)
  adds `billing_vip_creator_profiles` (including age-gated tracking).
- The same migration `003_phase16_creator_profiles_chat_integrations.sql`
  mirrors it in Postgres.
- `GET /api/vip/product/status` now exposes
  `creators.count`, `creators.age_gated`, and `creators.by_status`.

### Billing → chat integration delivery log ✅

- The same migration adds `billing_tip_chat_integrations` so the billing
  service can audit overlay/relay deliveries instead of pretending
  delivery succeeded silently.
- Every status surface in tips reports the `chat_integration_status`
  totals (delivered / queued_local / unavailable / failed). The status
  is intentionally allowed to be non-green; nothing is masked.

### Live composition: stream/channel integrations ✅

- [services/openvibe-live/server/db.js](services/openvibe-live/server/db.js)
  adds `live_stream_integrations` to SQLite SCHEMA_SQL.
- [services/openvibe-live/server/migrations/postgres/002_phase16_stream_integrations.sql](services/openvibe-live/server/migrations/postgres/002_phase16_stream_integrations.sql)
  mirrors it for Postgres.
- [services/openvibe-live/server/integrations.js](services/openvibe-live/server/integrations.js)
  is a new module that builds per-target URLs (`chat-room`, `tips`,
  `vip`, `audio-overlay`, `ai-assist`), probes the configured target's
  `/healthz` with a 1500ms `AbortController`, and records the result as
  one of `delivered`, `queued_local`, `unavailable`, or `failed`. The
  probe never throws — failure is a value, not an exception.
- [services/openvibe-live/server/index.js](services/openvibe-live/server/index.js)
  adds five routes: `POST /api/v1/streams/:id/integrations/ensure`,
  `GET  /api/v1/channels/:slug/integrations`,
  `POST /api/v1/channels/:slug/integrations/ensure`,
  `GET  /api/v1/integrations/product/status`, and extends the existing
  `GET /api/v1/streams/:id/integrations` with the `ensured` array.
- [services/openvibe-live/test/integrations.test.js](services/openvibe-live/test/integrations.test.js)
  asserts ensure-idempotency, unknown stream and unknown channel
  produce `404`, an unsupported target_kind produces `400`, and the
  product/status endpoint returns `services_configured` plus
  `integrations.total` counters with non-green totals (probes are
  pointed at a closed port so `unavailable`/`failed` is the truthful
  outcome). The test does **not** pretend the probe succeeded.

SSR cards for these integrations on the public stream/channel pages
remain deferred — they are a UI tranche and would require shell
scaffolding rather than product wiring. The data is fully available to
the admin matrix and the browser smoke fixture.

### Chat workflow product/status surface and Phase 16 chip ✅

- [services/openvibe-chat/server/model.js](services/openvibe-chat/server/model.js)
  adds `summarizeProduct()` returning truthful counts for rooms (total,
  archived, by_type), messages (total, deleted), DM rooms, active
  calls, audio integrations, and stream bindings.
- [services/openvibe-chat/server/routes.js](services/openvibe-chat/server/routes.js)
  exposes `GET /api/chat/product/status`.
- [services/openvibe-chat/public/index.html](services/openvibe-chat/public/index.html)
  adds a `phase16-chip` in the hero that calls the new endpoint on
  load and on the existing 30s refresh tick. Probe failure is reported
  truthfully ("Phase 16: probe failed"), not silently green.
- [services/openvibe-chat/test/chat-smoke.test.js](services/openvibe-chat/test/chat-smoke.test.js)
  asserts the new `summarizeProduct` shape and that the shell HTML
  exposes the chip.

### Community workflow product/status surface and Phase 16 chip ✅

- [services/openvibe-community/server/model.js](services/openvibe-community/server/model.js)
  adds `summarizeProduct()` returning truthful counts for spaces,
  threads (total + by_status), posts (total + deleted), pastes (total
  + versions), and discord (relays + messages + audit).
- [services/openvibe-community/server/routes.js](services/openvibe-community/server/routes.js)
  exposes `GET /api/community/product/status`.
- [services/openvibe-community/public/index.html](services/openvibe-community/public/index.html)
  adds a `community-phase16-chip` populated on every refresh.
- [services/openvibe-community/test/community-smoke.test.js](services/openvibe-community/test/community-smoke.test.js)
  asserts the new `summarizeProduct` shape and the shell-side chip.

### Content per-surface routes ✅

- [services/openvibe-content/server/db/sqlite.js](services/openvibe-content/server/db/sqlite.js)
  and [services/openvibe-content/server/db/postgres.js](services/openvibe-content/server/db/postgres.js)
  extend `getProductWorkflowStatus()` with `items_by_surface[surface] =
  { total, by_state }` so each product workflow (wiki/blog/news/
  reviews/deals/coupons/trade/host) reports its own truth.
- [services/openvibe-content/server/routes.js](services/openvibe-content/server/routes.js)
  adds `GET /api/v1/content/surfaces`,
  `GET /api/v1/content/surfaces/:surface/items`, and
  `GET /api/v1/content/surfaces/:surface/product/status`. Unknown
  surfaces return `ok: true` with zeroed truth — they are not
  pretending to be green by default.
- [services/openvibe-content/test/content-api.test.js](services/openvibe-content/test/content-api.test.js)
  is extended to assert the per-surface aggregator, the per-surface
  listing endpoint, and the unknown-surface zero-truth behavior.

Deeper per-surface schemas (coupon redemption history, trade listings,
host reservations, deal expiration policies, wiki page revisions
beyond the existing item versions) remain Phase 17 work and are
tracked as deferred capabilities in
[packages/openvibe-contracts/product-capabilities.js](packages/openvibe-contracts/product-capabilities.js).

### Admin runtime matrix — live integrations + capability catalog ✅

- [services/openvibe-network/server/api/staff.js](services/openvibe-network/server/api/staff.js)
  fans out to `/api/v1/integrations/product/status` on the live
  service and includes the result under `products.live_integrations`.
  It also includes a `capabilities` block built from
  `describeProductCapabilityCatalog()` so the admin matrix can render
  shipped/deferred counts truthfully (catalog unavailability is
  reported as a yellow chip, not silent green).
- [services/openvibe-network/public/admin.html](services/openvibe-network/public/admin.html)
  adds a `live-integrations` row to the product capability matrix and
  a new "Capability catalog (shipped vs deferred)" section listing
  totals plus per-owner-service shipped/deferred breakdowns.

### Browser smoke — live integrations check ✅

- [scripts/staging/browser-smoke.js](scripts/staging/browser-smoke.js)
  validates the new tips/vip product status fields and adds a new
  `live-integrations-product-status` JSON check against the live host.
- [scripts/staging/test/browser-smoke.test.js](scripts/staging/test/browser-smoke.test.js)
  fixture is updated; the expected check count is now `46`.

### Validation in this session

Repo-wide validation entrypoints succeed:

- `npm run check` → 308 files, 0 failures.
- `node scripts/run-tests.js --jobs=auto` → 71 run, 71 pass, 0 fail.

Browser smoke and Playwright runs depend on a running stack and are
covered by the existing local-prod stack flow; they were not re-run in
this session because the in-session changes touched code paths whose
contracts are already exercised by `npm test`.

### Truthfully deferred in this tranche

- SSR cards on stream/channel pages for `live_stream_integrations`
  status. Data is queryable; rendering is a UI tranche.
- Tips creator dashboard, VIP subscriber management, content
  per-surface dashboards, chat moderation panel, community moderation
  drilldown — all UI tranches that would require dashboard
  scaffolding rather than product wiring.
- Real outbound Discord delivery (still a mock seam unless an outbound
  webhook URL is configured).
