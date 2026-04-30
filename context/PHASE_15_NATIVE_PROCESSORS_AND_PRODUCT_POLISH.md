# Phase 15 — Native processors, public hosts, and canonical bootstrap

## Goals

Phase 15 closes three long-standing gaps that survived the Phase 11–14 runtime parity push:

1. **Slice A — Native worker backends.** Convert the last seven processor jobs
   (`media.thumbnail`, `media.metadata`, `ai.transcript`, `ai.scene-detect`,
   `analytics.audio-features`, `analytics.motion-detect`,
   `migration.bundle-verify`) to in-process native backends so the worker mesh
   can run end-to-end without external HTTP/Python dependencies.
2. **Slice B — Public host coverage and hobo-tone copy.** Light up
   `openvibe.host`, `openvibe.tips`, and `openvibe.vip` shells; expose
   `news/reviews/deals/coupons/trade/host` content surfaces in browser smoke
   and Playwright; refresh home/pages copy to match the community-first,
   no-investor, not-for-profit voice the Hobo Network actually has.
3. **Slice C — Canonical bootstrap source of truth.** Add
   `packages/openvibe-persistence/canonical-bootstrap.js` so every service can
   describe whether its schema comes from checked-in `migrations/postgres/*.sql`
   or a legacy `SCHEMA_SQL` literal, and surface that in `describePersistence`
   plus the schema-drift readiness gate.

## Landed files

### Slice A — Native worker backends

- `services/openvibe-workers/server/backends/migration-bundle-verifier.js` — new
- `services/openvibe-workers/server/backends/native-analytics.js` — new
  (deterministic SHA256-seeded analyzers, no FFmpeg required)
- `services/openvibe-workers/server/backends/native-ai.js` — new (drives
  `services/openvibe-ai/server/runner.js#executeRun` against the deterministic
  stub provider; surfaces `ai_run` metadata to the worker job result)
- `services/openvibe-workers/server/backends/runtime-bootstrap.js` — extended
  with `ensureAiRuntime()` so worker processes can boot the AI runner without
  HTTP fanout
- `services/openvibe-workers/server/backends/index.js` — catalog entries for
  the seven new native backends
- `services/openvibe-workers/server/processors.js` — new
  `selectBackendVariant(...)` / `selectScriptPairedBackend(...)` /
  `selectNativeOnlyBackend(...)` helpers and per-job payload builders; legacy
  `verifyMigrationBundle` removed from this file (now lives in
  `migration-bundle-verifier.js`)
- `services/openvibe-network/public/admin.html` — runtime tab worker matrix now
  shows selected backend, configured backend mode, fallback backend, last error
  alongside the existing critical/available/last-status columns
- Tests added/extended:
  - `services/openvibe-workers/test/native-migration.test.js`
  - `services/openvibe-workers/test/native-analytics.test.js`
  - `services/openvibe-workers/test/native-ai.test.js`
  - `services/openvibe-workers/test/native-media-processing.test.js`
  - `services/openvibe-workers/test/processors.test.js` — new assertions on
    backend/mode flipping for the seven jobs

### Slice B — Public hosts and copy

- `packages/openvibe-sdk/url-defaults.js` — added `host`, `tips`, and `vip`
  surface defaults (production origin + local-dev mapping)
- `services/openvibe-content/server/config.js` — added `host` surface origin
- `services/openvibe-content/server/host-router.js` — added `openvibe.host`
- `services/openvibe-content/server/ssr.js` — added the `host` surface to the
  catalog and nav, with a draft hosting-policy entry; refreshed
  `codes`/`blog`/`wiki` hero copy to the hobo voice (community-first,
  no-investor, plain-English)
- `services/openvibe-billing/server/host-shell.js` — new host-aware shell that
  serves `OpenVibe Tips` for `openvibe.tips*` and `OpenVibe VIP` for
  `openvibe.vip*` while leaving the existing `billing.openvibe.network`
  default page untouched
- `services/openvibe-billing/server/index.js` — wires `attachBillingHostShell`
  before the static handler
- `services/openvibe-network/public/index.html` — refreshed hero copy and
  promises section to the hobo tone, including a new not-for-profit promise
  card
- `scripts/staging/browser-smoke.js` — new surface checks for
  `news/reviews/deals/coupons/trade/host` content shells plus `tips`/`vip`
  billing shells (Playwright smoke picks them up automatically through the
  shared `SURFACE_CHECKS` export)
- Tests added/extended:
  - `scripts/staging/test/browser-smoke.test.js` — host-aware HTML server,
    new surface count assertion (33 → 41), tips/vip host map for the billing
    fixture
  - `services/openvibe-content/test/content-ssr.test.js` — `openvibe.host`
    home + `/drafts/hosting-policy` assertions
  - `services/openvibe-billing/test/host-shell.test.js` — new

### Slice C — Canonical bootstrap

- `packages/openvibe-persistence/canonical-bootstrap.js` — new helper exposing
  `describeBootstrapSource(...)`, `loadCanonicalBootstrapSql(...)`,
  `listMigrationFiles(...)`, and `listKnownServices(...)`
- `packages/openvibe-persistence/index.js` — re-exports the helper
- `packages/openvibe-persistence/legacy-runtime.js` — passes the optional
  `bootstrap` descriptor through to `describePersistence`
- `packages/openvibe-sdk/persistence-mode.js` — `describePersistence(...)` now
  surfaces `migration_source`, `bootstrap_source`, `schema_sql_reconciled`,
  `has_checked_in_migrations`, and `uses_legacy_bootstrap_sql` so the runtime
  tab and readiness reports can see bootstrap truth
- `services/openvibe-{network,events,media,live,chat,community,billing,ai,games}/server/db.js`
  and `services/openre-stream/server/db.js` — each adopts
  `describeBootstrapSource(SERVICE_NAME, { usesLegacyBootstrapSql: true })` so
  their `describePersistence()` output truthfully marks them as still using
  the legacy `SCHEMA_SQL` literal even though canonical migrations exist
- Tests added:
  - `packages/openvibe-persistence/test/canonical-bootstrap.test.js`
  - `packages/openvibe-sdk/test/persistence-mode.test.js` — bootstrap merge
    + default cases

## Validation results

Captured on 2026-04-30 from `/opt/openvibe/OpenVibe-Temporary-MonoRepo`:

| Command | Result |
| --- | --- |
| `npm run check` | 301 files, 0 failures |
| `npm test` | 64 files, 64 pass, 0 fail |
| `npm run readiness:schema-drift` | gate `green`, 10 green / 0 yellow / 0 red |

## Remaining caveats

- Every service still ships a legacy `SCHEMA_SQL` template literal alongside
  the canonical Postgres migration files. The new bootstrap descriptor
  truthfully reports that with `uses_legacy_bootstrap_sql: true`. Eliminating
  the literal in favor of `loadCanonicalBootstrapSql(SERVICE_NAME)` is a clean
  follow-up that does not block Phase 15.
- The new public hosts (`openvibe.host`, `openvibe.tips`, `openvibe.vip`) are
  intentionally `noindex` and live behind the existing host-router, so DNS,
  Nginx, and Cloudflare configuration in `deploy/` should be reviewed before
  pointing real DNS records at staging/production.
- The seven new native worker backends are deterministic and require no FFmpeg
  or Python. They degrade truthfully when their input dependencies (media
  files, AI runtime DB) are missing instead of pretending the job succeeded.
