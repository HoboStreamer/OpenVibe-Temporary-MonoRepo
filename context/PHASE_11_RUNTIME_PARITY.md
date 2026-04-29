# Phase 11 — runtime parity tracker

Last audited: 2026-04-29 (post-validation update)

## Implemented

- Shared runtime foundation exists:
  - `packages/openvibe-runtime/index.js`
  - `packages/openvibe-observability/index.js`
  - `packages/openvibe-persistence/runtime.js`
  - `packages/openvibe-redis/index.js`
  - `packages/openvibe-queue/index.js`
- Truthful `/health`, `/ready`, and `/metrics` endpoints are mounted across the native services via:
  - `services/openvibe-network/server/index.js`
  - `services/openvibe-events/server/index.js`
  - `services/openvibe-media/server/index.js`
  - `services/openvibe-live/server/index.js`
  - `services/openre-stream/server/index.js`
  - `services/openvibe-chat/server/index.js`
  - `services/openvibe-community/server/index.js`
  - `services/openvibe-billing/server/index.js`
  - `services/openvibe-ai/server/index.js`
  - `services/openvibe-games/server/index.js`
  - `services/openvibe-workers/server/index.js`
  - `services/openvibe-realtime/server/index.js`
- Network control-plane kernel slice is implemented:
  - `services/openvibe-network/server/api/capability-invoke.js`
  - `services/openvibe-network/server/api/user-modules.js`
  - `services/openvibe-network/server/capabilities/index.js`
  - `services/openvibe-network/server/schema-tools.js`
  - `packages/openvibe-sdk/capabilities.js`
  - `packages/openvibe-sdk/user-modules.js`
  - `services/openvibe-network/test/capability-invoke.test.js`
  - `services/openvibe-network/test/user-modules.test.js`
- Redis stream fanout primitives already exist in:
  - `services/openvibe-events/server/bus.js`
  - `packages/openvibe-queue/streams.js`
- Realtime namespace/auth/presence primitives already exist in:
  - `services/openvibe-realtime/server/socket-runtime.js`
  - `packages/openvibe-realtime/auth.js`
  - `packages/openvibe-realtime/rooms.js`
  - `packages/openvibe-realtime/events.js`
- Realtime event bridge is now implemented and wired into service health/readiness/runtime visibility:
  - `services/openvibe-realtime/server/event-bridge.js`
  - `services/openvibe-realtime/server/index.js`
  - `services/openvibe-realtime/server/config.js`
  - `services/openvibe-realtime/test/event-bridge.test.js`
  - `services/openvibe-realtime/test/realtime-smoke.test.js`
  - `scripts/readiness/check-realtime-socketio.js`
- Worker heartbeat and queue/runtime telemetry are now implemented:
  - `services/openvibe-workers/server/config.js`
  - `services/openvibe-workers/server/processor-runtime.js`
  - `services/openvibe-workers/server/runtime.js`
  - `services/openvibe-workers/test/workers-smoke.test.js`
  - `packages/openvibe-queue/bullmq.js`
  - `packages/openvibe-queue/test/queue.test.js`
- Admin runtime status aggregation and operator visibility are now implemented:
  - `services/openvibe-network/server/config.js`
  - `services/openvibe-network/server/api/staff.js`
  - `services/openvibe-network/server/index.js`
  - `services/openvibe-network/public/admin.html`
- Offline readiness/report scripts already exist:
  - `scripts/readiness/check-scalable-runtime.js`
  - `scripts/readiness/check-queue-health.js`
  - `scripts/readiness/check-realtime-socketio.js`
  - `scripts/readiness/check-storage-providers.js`
  - `scripts/readiness/check-media-pipeline.js`
  - `scripts/readiness/check-nginx-config.js`
  - `scripts/readiness/check-cloudflare-assumptions.js`
  - `scripts/readiness/generate-production-readiness-report.js`

## Partially implemented

- Postgres runtime seam exists but is not wired into DB-backed services:
  - shared helper: `packages/openvibe-persistence/runtime.js`
  - descriptor helper: `packages/openvibe-sdk/persistence-mode.js`
  - currently unused by service DB modules (confirmed by search)
- SQLite-only DB modules still back the core services:
  - `services/openvibe-network/server/db.js`
  - `services/openvibe-events/server/db.js`
  - `services/openvibe-media/server/db.js`
  - `services/openvibe-live/server/db.js`
  - `services/openre-stream/server/db.js`
  - `services/openvibe-chat/server/db.js`
  - `services/openvibe-community/server/db.js`
  - `services/openvibe-billing/server/db.js`
  - `services/openvibe-ai/server/db.js`
  - `services/openvibe-games/server/db.js`
- Workers expose queue/runtime scaffolding, but major jobs still use placeholder behavior in:
  - `services/openvibe-workers/server/processors.js`
- Realtime bridge now works, but without Redis it truthfully degrades to HTTP polling fallback and remains yellow in readiness:
  - `services/openvibe-realtime/server/event-bridge.js`
  - `scripts/readiness/check-realtime-socketio.js`
- Worker heartbeat/runtime visibility is now surfaced, but workers remain red/yellow until Redis-backed distributed mode is configured:
  - `services/openvibe-workers/server/runtime.js`
  - `services/openvibe-network/public/admin.html`
- Browser smoke exists only as HTTP/file inspection, not Playwright automation:
  - `scripts/staging/browser-smoke.js`
  - `scripts/staging/test/browser-smoke.test.js`
- Local compose stack is partial and only starts a subset of required services:
  - `deploy/compose/docker-compose.local.yml`

## Still missing

- Service runtime selectors and Postgres adapters for:
  - `services/openvibe-network/server/db/index.js`
  - `services/openvibe-events/server/db/index.js`
  - `services/openvibe-media/server/db/index.js`
  - `services/openvibe-live/server/db/index.js`
  - `services/openre-stream/server/db/index.js`
  - `services/openvibe-chat/server/db/index.js`
  - `services/openvibe-community/server/db/index.js`
  - `services/openvibe-billing/server/db/index.js`
  - `services/openvibe-ai/server/db/index.js`
  - `services/openvibe-games/server/db/index.js`
  - plus corresponding `server/db/sqlite.js`, `server/db/postgres.js`, and `server/migrations/postgres/` trees
- Content service DB-backed runtime foundation:
  - missing file `services/openvibe-content/server/db.js`
  - missing models/admin/search adapters requested by the runtime-parity prompt
- Playwright browser smoke implementation:
  - missing file `scripts/staging/browser-smoke-playwright.js`
  - missing test `scripts/staging/test/browser-smoke-playwright.test.js`
- Production-like local stack scripts:
  - missing `scripts/dev/start-production-like-stack.sh`
  - missing `scripts/dev/stop-production-like-stack.sh`
  - missing `scripts/dev/wait-for-stack.js`
  - missing `scripts/readiness/check-local-prod-stack.js`
- Legacy grounding trees requested in the implementation prompt are not present in this checkout:
  - missing `/opt/openvibe/HoboStreamer.com`
  - missing `/opt/openvibe/HoboApp`
  - missing `/opt/openvibe/OpenVibe-Temporary-MonoRepo/HoboReposToMigrateFrom`

## Tests to pass

Required existing commands after each runtime-parity tranche:

- `npm run check`
- `npm test`
- `npm run readiness`
- `npm run smoke:browser`
- `node scripts/readiness/check-scalable-runtime.js --offline --dry-run --skip-external`
- `node scripts/readiness/check-queue-health.js --offline --dry-run --skip-external`
- `node scripts/readiness/check-realtime-socketio.js --offline --dry-run --skip-external`
- `node services/openvibe-network/test/capability-invoke.test.js`
- `node services/openvibe-network/test/user-modules.test.js`
- `node services/openvibe-events/test/bus.test.js`
- `node services/openvibe-realtime/test/*.test.js`
- `node services/openvibe-workers/test/*.test.js`

Additional acceptance gates still not yet satisfiable from the current repo state:

- `npm run smoke:browser:playwright` once `scripts/staging/browser-smoke-playwright.js` exists
- `npm run stack:local:start` / `npm run readiness:local-prod` / `npm run stack:local:stop` once stack scripts exist

Validated on 2026-04-29 for this tranche:

- `npm run check` ✅ — `[check] 230 files, 0 failures`
- `npm test` ✅ — `[test] 45 files, 45 pass, 0 fail`
- `npm run smoke:browser` ❌ — `gate=red`, summary `green=7 yellow=1 red=16`; network/admin/auth/session surfaces passed, but `live`, `chat`, `community`, `media`, `ai`, `games`, and `content` default ports were not running.
- `node packages/openvibe-realtime/test/helpers.test.js` ✅
- `node packages/openvibe-queue/test/queue.test.js` ✅
- `node services/openvibe-realtime/test/socket-auth.test.js` ✅
- `node services/openvibe-realtime/test/realtime-smoke.test.js` ✅
- `node services/openvibe-realtime/test/event-bridge.test.js` ✅
- `node services/openvibe-workers/test/workers-smoke.test.js` ✅
- `node scripts/readiness/check-realtime-socketio.js --offline --dry-run --skip-external` ✅ — gate `yellow` (polling fallback, no Redis)
- `node scripts/readiness/check-queue-health.js --offline --dry-run --skip-external` ✅ — gate `yellow` (registry-only, no Redis)
- `npm run readiness` ✅ artifact written to `data/readiness/openvibe-production-readiness-report.json` with `gate=red`, summary `green=6 yellow=5 red=1`
- Browser validation ✅ on an isolated validation stack (`events:4410`, `workers:5310`, `realtime:5410`, `network:4110`): `admin.html` runtime tab rendered the new **Distributed runtime status** section, including service cards, worker heartbeat JSON, realtime bridge JSON, and populated queue rows.

## Files changed

- `context/PHASE_11_RUNTIME_PARITY.md` — runtime-parity tracker updated with verified implementation and validation status.
- `packages/openvibe-queue/bullmq.js` — fixed disabled queue bundle stats so no-Redis workers return safe queue telemetry.
- `packages/openvibe-queue/test/queue.test.js` — added regression coverage for disabled queue stats.
- `packages/openvibe-realtime/auth.js` — tightened room authorization for private community/thread rooms.
- `packages/openvibe-realtime/events.js` — added canonical event-to-namespace/room mapping helpers and expanded namespace coverage.
- `packages/openvibe-realtime/rooms.js` — added shared room builders for chat rooms, channels, spaces, and threads.
- `packages/openvibe-realtime/test/helpers.test.js` — extended coverage for new rooms/namespaces/mapping behavior.
- `services/openvibe-network/public/admin.html` — added distributed runtime cards, heartbeat/bridge payload blocks, and queue table.
- `services/openvibe-network/server/api/staff.js` — added runtime-status aggregation across events/workers/realtime and preserved structured error payloads.
- `services/openvibe-network/server/config.js` — added worker/realtime internal URLs.
- `services/openvibe-network/server/index.js` — wired config into staff/admin routes.
- `services/openvibe-realtime/package.json` — declared contracts/queue/sdk workspace dependencies required by the event bridge.
- `services/openvibe-realtime/server/config.js` — added event bridge configuration knobs.
- `services/openvibe-realtime/server/event-bridge.js` — new events→Socket.IO bridge with Redis Streams mode and HTTP polling fallback.
- `services/openvibe-realtime/server/index.js` — exposed bridge health/readiness/routes and lifecycle startup/shutdown.
- `services/openvibe-realtime/test/event-bridge.test.js` — new focused bridge tests.
- `services/openvibe-realtime/test/realtime-smoke.test.js` — validated bridge wiring in the service smoke suite.
- `services/openvibe-workers/package.json` — added Redis workspace dependency for heartbeat/presence support.
- `services/openvibe-workers/server/config.js` — added worker instance and heartbeat settings.
- `services/openvibe-workers/server/processor-runtime.js` — added heartbeat emission, cleanup, and queue runtime summary data.
- `services/openvibe-workers/server/runtime.js` — surfaced heartbeat in health/readiness payloads.
- `services/openvibe-workers/test/workers-smoke.test.js` — added heartbeat readiness assertions.
- `scripts/readiness/check-realtime-socketio.js` — started the bridge during offline readiness inspection and checked bridge mode explicitly.
