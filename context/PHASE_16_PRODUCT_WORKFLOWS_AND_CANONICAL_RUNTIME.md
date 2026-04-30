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
