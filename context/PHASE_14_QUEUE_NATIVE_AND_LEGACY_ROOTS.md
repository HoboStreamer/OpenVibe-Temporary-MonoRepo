# Phase 14 — queue-native backends and legacy source roots

Phase 14 closes the biggest runtime/migration seams that were still making the
Phase 11 parity tracker lie by omission.

## Goals

- replace the five highest-value worker HTTP adapters with queue-native direct
  module backends
- stop hard-coding legacy Hobo checkout paths and support shared root
  overrides for export, backfill, and cutover flows
- formalize SQLite bootstrap vs checked-in Postgres migration parity instead of
  trusting duplicated schema strings by vibes alone
- make Redis-backed distributed mode first-class in local-prod readiness and
  browser smoke verification
- deepen surface-specific polish on the operator-facing `media` and
  `community` shells

## Landed in this tranche

- Shared legacy source root resolution now exists in
  `scripts/migrate-hobo/lib/legacy-source-roots.js`.
  - resolution order supports explicit `--legacy-root` / `--db`
  - supports shared `--legacy-source-root` and `OPENVIBE_LEGACY_SOURCE_ROOT`
  - supports per-source env overrides such as
    `OPENVIBE_HOBOSTREAMER_ROOT` / `OPENVIBE_HOBOSTREAMER_DB_PATH`
  - prefers fetched `production-source/<source>` artifacts when present
  - falls back to repo-local `HoboReposToMigrateFrom`
  - falls back to parent-root layouts such as `/opt/openvibe/HoboStreamer.com`
    and `/opt/openvibe/HoboApp/hobo-tools`
- Legacy source resolution is now wired into:
  - `scripts/migrate-hobo/export-hobostreamer.js`
  - `scripts/migrate-hobo/export-hobotools.js`
  - `scripts/migrate-hobo/export-hoboquest.js`
  - `scripts/migrate-hobo/backfill-media.js`
  - `scripts/migrate-hobo/staging-cutover-rehearsal.js`
- Regression coverage for the resolver landed in
  `scripts/migrate-hobo/test/legacy-source-roots.test.js`.

- Queue-native worker backends are now implemented for the first five
  downstream jobs via direct module bootstrap in
  `services/openvibe-workers/server/backends/`.
  - `clips.materialize`
  - `lifecycle.reconcile`
  - `search.reindex`
  - `billing.reconcile`
  - `notifications.broadcast`
- Backend selection is now explicit through
  `OPENVIBE_WORKER_BACKEND_MODE=auto|http|native`.
  - `auto` defaults to native for the five landed jobs
  - `http` preserves compatibility behavior
  - `native` forces direct-module execution for the supported jobs
- Shared service-side seams were extracted so workers and HTTP routes reuse the
  same implementation slices instead of diverging.
  - `services/openvibe-media/server/clip-materializer.js`
  - `services/openvibe-media/server/lifecycle-reconciler.js`
  - `services/openvibe-media/server/playback.js`
  - `services/openvibe-content/server/search-indexer.js`
  - `services/openvibe-billing/server/reconciler.js`
  - `services/openvibe-network/server/notifications/broadcast.js`
- Native worker coverage landed in:
  - `services/openvibe-workers/test/processors.test.js`
  - `services/openvibe-workers/test/native-billing.test.js`
  - `services/openvibe-workers/test/native-notifications.test.js`

- Schema drift is now formalized instead of implicit.
  - `packages/openvibe-persistence/schema-drift.js`
  - `scripts/readiness/check-schema-drift.js`
  - `package.json` (`readiness:schema-drift`)
  - `packages/openvibe-persistence/test/postgres-migrations.test.js`
- The checker normalizes statement-by-statement SQL, strips comments,
  translates SQLite-compatible bootstrap SQL to Postgres form, and also folds
  in `LEGACY_BOOTSTRAP_SQL` where a service uses it.
- One real schema mismatch was corrected in
  `services/openvibe-billing/server/db.js`
  (`billing_economy_state.id` is now `BIGINT` for migration parity).

- Local-prod distributed readiness is now first-class.
  - `scripts/staging/browser-smoke.js` now probes `workers /ready` and
    `realtime /ready`
  - `scripts/staging/test/browser-smoke.test.js` now exercises the new 33-check
    matrix
  - `deploy/compose/docker-compose.local.yml` now declares
    `OPENVIBE_WORKER_BACKEND_MODE: auto` and `OPENVIBE_EVENTS_URL`
  - `scripts/readiness/check-local-prod-stack.js` now reports
    `worker_backend_mode` and stops treating native/auto workers as stale
    HTTP-only wiring
  - `scripts/readiness/check-queue-health.js` now reads live worker runtime /
    readiness data in active mode when available

- Surface-specific shell polish landed for:
  - `services/openvibe-media/public/index.html`
  - `services/openvibe-community/public/index.html`
  - media now exposes runtime probes, upload status, snapshot counters, and a
    clearer quota inspector
  - community now exposes accessible tabs, highlights, runtime probes, and a
    more useful create-paste lane

## Validation

Targeted regression commands that passed in this tranche:

- `node scripts/migrate-hobo/test/legacy-source-roots.test.js`
- `node services/openvibe-workers/test/processors.test.js`
- `node services/openvibe-workers/test/native-billing.test.js`
- `node services/openvibe-workers/test/native-notifications.test.js`
- `node packages/openvibe-persistence/test/postgres-migrations.test.js`
- `node scripts/readiness/check-schema-drift.js`
- `node scripts/staging/test/browser-smoke.test.js`

Repo-wide and Docker-backed validation also passed on 2026-04-30:

- `npm run check`
- `npm test`
- `npm run readiness:schema-drift` ✅
  - `data/readiness/schema-drift-report.json`
  - `gate=green`, `green=10`, `yellow=0`, `red=0`
- `npm run readiness` ✅
  - `data/readiness/openvibe-production-readiness-report.json`
  - `gate=yellow`, `green=9`, `yellow=6`, `red=0`
  - offline mode still truthfully leaves `local_prod_stack.active_stack_probe`
    yellow because the live stack probe is intentionally skipped in offline
    mode
- `npm run stack:local:stop -- --volumes`
- `npm run stack:local:start`
- `npm run stack:local:wait` ✅
  - `data/readiness/local-prod-stack-wait-report.json`
  - `gate=green`, `green=33`, `yellow=0`, `red=0`, `attempts=4`
- `npm run smoke:browser` ✅
  - `gate=green`, `green=33`, `yellow=0`, `red=0`
  - includes `workers-ready` and `realtime-ready`
- `npm run smoke:browser:playwright` ✅
  - `data/readiness/browser-smoke-playwright-report.json`
  - `gate=green`, `green=33`, `yellow=0`, `red=0`, `screenshot_count=16`
- `npm run readiness:local-prod` ✅
  - `data/readiness/local-prod-stack-report.json`
  - `gate=green`, `green=11`, `yellow=0`, `red=0`
  - `worker_backend_mode=auto`
  - active stack probe converged immediately with `green=33`

Rendered browser spot-checks were also performed against the live local stack:

- `http://openvibe.media.localhost:4500/`
  - verified the new runtime snapshot, upload lane, probe controls, quota
    inspector, and storage notes in a rendered browser page
  - `/health` probe returned live JSON in-page
- `http://openvibe.community.localhost:4900/`
  - verified the new hero, snapshot counters, highlights, runtime probes, and
    accessible tab set in a rendered browser page
  - switched to the `Pastes` tab and confirmed the create-paste lane rendered
    correctly

## Remaining next slices

- convert the remaining worker jobs that still use their older adapters
  (`media.thumbnail`, `media.metadata`, `ai.*`, analytics, and
  `migration.bundle-verify`)
- reduce schema duplication further so more services can converge on a single
  canonical bootstrap source instead of relying on drift enforcement alone
- continue deeper page-specific polish on surfaces that still mostly rely on
  shared chrome without richer operator workflows