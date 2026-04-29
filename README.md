# OpenVibe

OpenVibe is the native platform kernel and product monorepo replacing the
legacy **HoboStreamer.com**, **HoboApp** / `hobo-tools`, and legacy Hobo Quest
runtime surfaces.

This repository is the working OpenVibe runtime. The legacy Hobo folders are
kept alongside it as migration/reference/archive inputs only. They are not
required for the normal OpenVibe runtime and should not be treated as the
default backend.

Current reality in this tree:

- Phases 1–7 are materially implemented in native OpenVibe services.
- Phase 8 is the runtime independence + Hobo migration foundation.
- Phase 9 is the hard-cut hardening / parity / production-readiness tranche.
- Phase 10 is the scalable runtime foundation now underway: shared runtime
  packages, truthful `/ready` + `/metrics` endpoints, operator runtime
  visibility, deploy scaffolding, and repo-level readiness checks.

Active phase truth is tracked in [`PHASES.md`](PHASES.md) and
[`context/PHASE_9.md`](context/PHASE_9.md) plus
[`context/PHASE_10_SCALING.md`](context/PHASE_10_SCALING.md).

The authoritative persistence/cutover plan is
[`docs/openvibe/persistence-cutover-plan.md`](docs/openvibe/persistence-cutover-plan.md).
The canonical legacy data map is
[`docs/openvibe/hobo-to-openvibe-data-map.md`](docs/openvibe/hobo-to-openvibe-data-map.md).

## Current status

| Phase | Focus | Status |
|---|---|---|
| 1 | Platform kernel foundations | ✅ implemented |
| 2 | Identity/control plane extraction | ✅ implemented |
| 3 | Media platform extraction | ✅ implemented |
| 4 | Live / stream split | ✅ implemented |
| 5 | Chat / community product migration | ✅ implemented |
| 6 | Billing / credits / tips ledger | ✅ implemented |
| 7 | AI / SEO / search / content source backbone | ✅ implemented |
| 8 | Runtime independence + migration foundation | 🚧 in progress |
| 9 | Cutover hardening / browser smoke / truthful reports | 🚧 in progress |
| 10 | Scalable runtime foundation / deploy / readiness | 🚧 in progress |

Phase 8 is the native runtime-independence and migration foundation: enable
OpenVibe-first operation, build the canonical export/import bundle, and make
service-local staging workable.

Phase 9 is the follow-on hardening tranche: make production fetch safe by
default, make reports truthful, add browser smoke parity, and ensure the final
cutover runbook is honest about what is still incomplete.

Phase 10 is the next runtime tranche: standardize shared runtime middleware,
ship `/health` + `/ready` + `/metrics` across services, surface runtime state
inside the admin console, and add the first deployment/CI/readiness scaffolds
for the horizontally scalable target architecture.

## Architecture stance

- OpenVibe is the native runtime by default.
- `OPENVIBE_LEGACY_COMPAT_MODE=false` is the default stance for normal
  operation.
- Legacy Hobo repositories are migration/reference/archive inputs only.
- Local development and staging boot from SQLite by default.
- The production target is PostgreSQL + Redis + object storage + async workers.
- Compatibility layers are additive, opt-in, diagnostic, and removable.
- Mutations should flow through OpenVibe APIs, events, and capability-backed
  services, not ad hoc cross-service DB writes.
- Shared identity, media, billing, events, AI/search/SEO, and product surfaces
  are centralized in OpenVibe.
- Hobo Bucks balances are excluded from canonical spendable OpenVibe balance
  imports. Hobo transactions are archive/reconciliation history only.
- Coins, nickels, watch time, and other loyalty/progression records may migrate
  as non-cash progression/history, not canonical wallet balances.
- Secrets and raw credentials must be kept out of canonical import bundles and
  stored only in env/secrets managers.

## Repository layout

```
openvibe/
├── context/                       architecture and phase plan notes
├── docs/openvibe/                 OpenVibe migration, runtime, and product docs
├── packages/                      shared contracts and SDK helpers
├── scripts/cutover/               Phase 9 rehearsal and verification
├── scripts/migrate-hobo/          legacy export / import / staging / postgres loaders
├── services/                      native OpenVibe service apps
├── compat/                        legacy migration compatibility notes
├── data/                          runtime and migration state (gitignored)
├── HoboReposToMigrateFrom/        legacy source repo archives / migration inputs
├── ARCHITECTURE.md                OpenVibe architectural rules and runtime requirements
├── PHASES.md                      current phase tracking
└── README.md                      this entrypoint
```

## Packages

- `packages/openvibe-contracts`
  - shared schemas, event topics, capability IDs, namespaces, and service
    declarations.
  - exports include `./topics`, `./events`, `./capabilities`,
    `./namespaces`, `./media-namespaces`, `./stream-events`, and more.
- `packages/openvibe-sdk`
  - runtime helpers and clients: auth client, Express middleware,
    registry client, events client, URL defaults, persistence-mode helpers,
    and product-specific clients for media, stream, chat, community, and AI.
- `packages/openvibe-observability`
  - Prometheus metrics, structured logging, and lightweight trace helpers for
    native OpenVibe services.
- `packages/openvibe-runtime`
  - shared request context, `/health`, `/ready`, and `/metrics` runtime hooks.
- `packages/openvibe-persistence`
  - env-aware persistence selection and Postgres migration/runtime helpers.
- `packages/openvibe-redis`
  - Redis client, locks, presence, and simple rate-limit helpers for the
    scalable runtime track.
- `packages/openvibe-queue`
  - BullMQ queue helpers, stream key builders, and worker-registry summaries
    for the distributed async execution track.

## Services and websites

| Service | Folder | Port | Accessible hosts | Purpose | Persistence | Docs |
|---|---|---|---|---|---|---|
| OpenVibe Network | `services/openvibe-network` | 4100 | `http://localhost:4100`, `http://openvibe.network.localhost:4100`, `http://admin.openvibe.network.localhost:4100`, `http://my.openvibe.network.localhost:4100`, `http://themes.openvibe.network.localhost:4100`, `http://openvibe.tools.localhost:4100` | Control plane, auth, policy, registry, host-aware surfaces | local SQLite bootstrap | `docs/openvibe/platform-hub.md` |
| OpenVibe Events | `services/openvibe-events` | 4400 | `http://localhost:4400` | Event backbone, topics, retry queue, DLQ | local SQLite bootstrap | `docs/openvibe/phase-8.md` |
| OpenVibe Media | `services/openvibe-media` | 4500 | `http://localhost:4500` | Shared media metadata/object platform | local SQLite bootstrap | `docs/openvibe/media-storage-strategy.md` |
| OpenVibe Live | `services/openvibe-live` | 4600 | `http://localhost:4600`, `http://openvibe.live.localhost:4600` | Native live discovery/channel/stream SSR product | local SQLite bootstrap | `docs/openvibe/openvibe-live-product-readiness.md` |
| OpenRE Stream | `services/openre-stream` | 4700 | `http://localhost:4700` | Ingest, restream destinations, stream lifecycle authority | local SQLite bootstrap | `docs/openvibe/phase-4-live-restream.md` |
| OpenVibe Chat | `services/openvibe-chat` | 4800 | `http://localhost:4800`, `http://openvibe.chat.localhost:4800` | Chat, DMs, call signaling, TTS/audio queue | local SQLite bootstrap | `docs/openvibe/openvibe-chat-product-readiness.md` |
| OpenVibe Community | `services/openvibe-community` | 4900 | `http://localhost:4900` | Spaces, threads, posts, pastes, Discord relay metadata | local SQLite bootstrap | `docs/openvibe/openvibe-community-product-readiness.md` |
| OpenVibe Billing | `services/openvibe-billing` | 5000 | `http://localhost:5000` | Ledger, credits, tips, subscriptions, economy controls | local SQLite bootstrap | `docs/openvibe/billing-service.md` |
| OpenVibe AI | `services/openvibe-ai` | 5100 | `http://localhost:5100` | AI provider routing, workflows, SEO and search seam | local SQLite bootstrap | `docs/openvibe/ai-service.md` |
| OpenVibe Games | `services/openvibe-games` | 5200 | `http://localhost:5200` | Game progression, inventory, canvas, cosmetics | local SQLite bootstrap | `docs/openvibe/phase-8.md` |
| OpenVibe Workers | `services/openvibe-workers` | 5300 | `http://localhost:5300` | Distributed worker control plane, queue registry, and async job host | Redis-backed target / registry-only locally until Redis is configured | `context/PHASE_10_SCALING.md` |

> Some surfaces require the Host header to resolve local names such as
> `openvibe.network.localhost`. Use `curl -H 'Host: openvibe.network.localhost'`
> when needed.

All native services in the current repo now expose:

- `/health` — descriptive service state
- `/ready` — truthful green/yellow/red readiness summary
- `/metrics` — Prometheus scrape output

## Local development quick start

1. Install workspace dependencies:

```bash
cd /opt/openvibe
npm install
```

2. Run repository validation:

```bash
npm run check
npm test
```

3. Start each service from its own folder:

```bash
cd services/openvibe-events
cp .env.example .env
npm start
```

4. Repeat for the services you need.

Recommended startup order for end-to-end flows:

1. `services/openvibe-events`
2. `services/openvibe-network`
3. `services/openvibe-media`
4. `services/openre-stream`
5. `services/openvibe-live`
6. `services/openvibe-chat`
7. `services/openvibe-community`
8. `services/openvibe-billing`
9. `services/openvibe-ai`
10. `services/openvibe-games`
11. `services/openvibe-workers`

Not every service must run for every task. Cross-service demos and migration
rehearsals need more of the stack.

## Environment configuration

Common env vars used across services:

- `PORT`
- `HOST`
- `NODE_ENV`
- `OPENVIBE_ENV`
- `OPENVIBE_PERSISTENCE_MODE`
- `OPENVIBE_DATABASE_URL`
- `DB_PATH`
- `OPENVIBE_REDIS_URL`
- `OPENVIBE_QUEUE_PREFIX`
- `INTERNAL_API_KEY`
- `PUBLIC_BASE_URL`

Service URL env vars:

- `OPENVIBE_NETWORK_URL`
- `OPENVIBE_AUTH_URL`
- `OPENVIBE_API_URL`
- `OPENVIBE_ADMIN_URL`
- `OPENVIBE_MY_URL`
- `OPENVIBE_THEMES_URL`
- `OPENVIBE_EVENTS_URL`
- `OPENVIBE_MEDIA_URL`
- `OPENVIBE_LIVE_URL`
- `OPENRE_STREAM_URL`
- `OPENVIBE_CHAT_URL`
- `OPENVIBE_COMMUNITY_URL`
- `OPENVIBE_BILLING_URL`
- `OPENVIBE_AI_URL`
- `OPENVIBE_GAMES_URL`
- `OPENVIBE_WORKERS_URL`

Media storage env vars:

- `OPENVIBE_MEDIA_HOT_ROOT`
- `STORAGE_ROOT`
- `STORAGE_PROVIDER`
- `OPENVIBE_MEDIA_COLD_PROVIDER`
- `OPENVIBE_MEDIA_COLD_S3_BUCKET`
- `OPENVIBE_MEDIA_COLD_S3_REGION`
- `OPENVIBE_MEDIA_COLD_S3_ENDPOINT`
- `OPENVIBE_MEDIA_COLD_S3_PUBLIC_BASE_URL`
- `OPENVIBE_MEDIA_COLD_S3_FORCE_PATH_STYLE`
- `S3_BUCKET`
- `S3_REGION`
- `S3_PUBLIC_BASE_URL`

Auth / JWKS env vars:

- `OPENVIBE_AUTH_ISSUER`
- `OPENVIBE_AUTH_JWKS_URL`
- `OPENVIBE_PRIVATE_KEY`
- `OPENVIBE_PUBLIC_KEY`

Stream ingest env vars:

- `INGEST_RTMP_URL`
- `INGEST_WHIP_URL`
- `INGEST_JSMPEG_URL`

Billing env vars:

- `PLATFORM_FEE_BPS`
- `CREDITS_CURRENCY`
- `PAYMENT_PROVIDER_DEFAULT`

AI env vars:

- `AI_DEFAULT_PROVIDER`
- `AI_DEFAULT_ROUTE`
- `AI_DEFAULT_PER_MINUTE`
- `AI_DEFAULT_PER_DAY`
- `AI_CACHE_TTL_SECONDS`

Games / canvas env vars:

- `OPENVIBE_GAMES_CANVAS_WIDTH`
- `OPENVIBE_GAMES_CANVAS_HEIGHT`
- `OPENVIBE_GAMES_CANVAS_TILE_COOLDOWN_SECONDS`
- `OPENVIBE_GAMES_CANVAS_PLACEMENTS_PER_MINUTE`

### Environment safety notes

- `OPENVIBE_LEGACY_COMPAT_MODE` is expected to remain `false` for normal
  native runtime mode.
- `OPENVIBE_PERSISTENCE_MODE` is `sqlite` locally by default.
- Copy `cp .env.example .env` before editing service envs.
- Local SQLite data is stored in `data/` under each service unless overridden.
- Keep raw API keys only in env/secret managers; do not store them in DB or
  checked-in docs.

## Running all services locally

A manual startup example:

```bash
cd /opt/openvibe/services/openvibe-events
cp .env.example .env
npm start
```

Then repeat for the services you need.

Optional shell snippet for background starts:

```bash
(cd services/openvibe-events && cp .env.example .env && npm start &) \
  && (cd services/openvibe-network && cp .env.example .env && npm start &) \
  && (cd services/openvibe-media && cp .env.example .env && npm start &)
```

Validation commands:

- `npm run check`
- `npm test`
- `npm run readiness`
- `node scripts/migrate-hobo/test/production-fetch.test.js`
- `node scripts/staging/test/browser-smoke.test.js`
- `node scripts/cutover/run-cutover-rehearsal.js --skip-staging`
- `node scripts/cutover/verify-cutover.js`

## Migration from legacy Hobo services

Legacy source repositories:

- `HoboReposToMigrateFrom/HoboStreamer.com`
- `HoboReposToMigrateFrom/HoboApp`
- `HoboReposToMigrateFrom/HoboApp/hobo-tools`
- `HoboReposToMigrateFrom/HoboApp/hobo-quest`

Migration model:

1. production export from legacy Hobo
2. canonical bundle generation
3. validation and reconciliation
4. staging load into current OpenVibe SQLite stores or holding tables
5. media backfill
6. Postgres canonical loader / validation
7. cutover rehearsal
8. final freeze and hard cut

Key commands:

- `node scripts/migrate-hobo/fetch-production-hobo.js --host <host> --confirm`
- `node scripts/migrate-hobo/export-hobostreamer.js`
- `node scripts/migrate-hobo/export-hobotools.js`
- `node scripts/migrate-hobo/export-hoboquest.js`
- `node scripts/migrate-hobo/import-openvibe.js`
- `node scripts/migrate-hobo/validate-migration.js`
- `node scripts/migrate-hobo/load-staging-openvibe.js --bundle <openvibe-target>`
- `node scripts/migrate-hobo/backfill-media.js`
- `node scripts/migrate-hobo/staging-cutover-rehearsal.js`
- `node scripts/migrate-hobo/migrate-postgres.js --database-url <url> --apply`
- `node scripts/migrate-hobo/load-postgres.js --bundle <openvibe-target> --database-url <url> --apply`
- `node scripts/migrate-hobo/validate-postgres.js --database-url <url>`
- `node scripts/cutover/run-cutover-rehearsal.js --browser-smoke`
- `node scripts/cutover/verify-cutover.js`

Safety and cutover notes:

- `fetch-production-hobo.js` defaults to dry-run and requires `--confirm` for
  remote copy operations.
- Legacy Hobo data is imported read-only and never deleted by these scripts.
- Remote temp cleanup is scoped to `/tmp/openvibe-migration-*`.
- Secrets are excluded from canonical import bundles.

## Legacy Hobo data mapping

The canonical data mapping is documented in
[`docs/openvibe/hobo-to-openvibe-data-map.md`](docs/openvibe/hobo-to-openvibe-data-map.md).

Migration domains include:

- identity / control plane
- themes / social graph
- live / stream ownership
- chat / community content
- media metadata and attachments
- billing-related records
- loyalty / progression history
- HoboQuest games and canvas state when present
- export-only / secret-bearing datasets deferred for later handling

Explicit rules:

- Hobo Bucks balances are excluded from canonical OpenVibe spendable
  balances.
- Hobo transactions are archived/reconciled only.
- Coins, nickels, watch time, and loyalty history are treated as progression,
  not currency.
- Stream keys, API tokens, OAuth secrets, camera credentials, and other
  secret-bearing values are redacted or excluded and must be rotated.

## Production persistence and cutover target

The production target is:

- PostgreSQL for canonical relational stores.
- Redis for coordination, queues, cache, and transient state.
- Object storage for media bytes, derivatives, and archival tiers.
- Async workers for replay, backfill, reconciliation, notifications, and audit.

Current repo posture:

- Service-local SQLite is the local bootstrap path.
- Staging loaders hydrate current SQLite service stores for rehearsal.
- The canonical Postgres loader is a separate readiness track.
- Runtime Postgres support remains partial per service.

Do not overclaim runtime Postgres readiness. The current implementation is a
hybrid local/staging path with a clear target architecture.

## Public product/domain roadmap

Native OpenVibe surfaces in this repo:

- `openvibe.network`
- `auth.openvibe.network`
- `api.openvibe.network`
- `admin.openvibe.network`
- `my.openvibe.network`
- `themes.openvibe.network`
- `openvibe.tools`
- `openvibe.live`
- `openre.stream`
- `openvibe.chat`
- `openvibe.community`
- `openvibe.media`
- `openvibe.billing`
- `ai.openvibe.network`
- `openvibe.games`

AI/content product seams available in the backend:

- `openvibe.wiki`
- `openvibe.blog`
- `openvibe.news`
- `openvibe.reviews`
- `openvibe.deals`
- `openvibe.coupons`
- `openvibe.trade`
- `openvibe.codes`

These are backend workflow seams and do not imply every public SSR host is
fully shipped yet. `openvibe.trade` must retain non-financial-advice
handling and review gating.

## Operator safety rules

- Production scripts must default to dry-run or read-only where available.
- Explicit `--confirm` is required for production fetch/copy operations.
- Temporary remote cleanup must stay within `/tmp/openvibe-migration-*`.
- Secrets are never imported into canonical OpenVibe datasets.
- Legacy Hobo databases remain archived/read-only after cutover.
- Cross-service writes should use OpenVibe APIs/events/capabilities.

## Documentation index

| Topic | Link |
|---|---|
| Architecture rules | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Phase status | [`PHASES.md`](PHASES.md) |
| Phase 8 native runtime | [`docs/openvibe/phase-8.md`](docs/openvibe/phase-8.md) |
| Phase 9 hardening | [`context/PHASE_9.md`](context/PHASE_9.md) |
| Persistence and cutover | [`docs/openvibe/persistence-cutover-plan.md`](docs/openvibe/persistence-cutover-plan.md) |
| Hobo data map | [`docs/openvibe/hobo-to-openvibe-data-map.md`](docs/openvibe/hobo-to-openvibe-data-map.md) |
| Migration scripts | [`scripts/migrate-hobo/README.md`](scripts/migrate-hobo/README.md) |
| Production SSH export | [`docs/openvibe/production-ssh-export.md`](docs/openvibe/production-ssh-export.md) |
| Staging environment | [`docs/openvibe/staging-environment.md`](docs/openvibe/staging-environment.md) |
| Postgres loader | [`docs/openvibe/postgres-loader.md`](docs/openvibe/postgres-loader.md) |
| Media strategy | [`docs/openvibe/media-storage-strategy.md`](docs/openvibe/media-storage-strategy.md) |
| Media backfill | [`docs/openvibe/media-backfill.md`](docs/openvibe/media-backfill.md) |
| Semantic validation | [`docs/openvibe/semantic-validation.md`](docs/openvibe/semantic-validation.md) |
| Cutover runbook | [`docs/openvibe/cutover-runbook.md`](docs/openvibe/cutover-runbook.md) |
| NGINX + Cloudflare deployment | [`docs/openvibe/nginx-cloudflare-deployment.md`](docs/openvibe/nginx-cloudflare-deployment.md) |
| Production readiness reporting | [`docs/openvibe/production-readiness-reporting.md`](docs/openvibe/production-readiness-reporting.md) |
| Loyalty migration | [`docs/openvibe/hobo-coins-loyalty-migration.md`](docs/openvibe/hobo-coins-loyalty-migration.md) |
| Admin/staff model | [`docs/openvibe/admin-staff-model.md`](docs/openvibe/admin-staff-model.md) |
| Platform hub | [`docs/openvibe/platform-hub.md`](docs/openvibe/platform-hub.md) |
| Live readiness | [`docs/openvibe/openvibe-live-product-readiness.md`](docs/openvibe/openvibe-live-product-readiness.md) |
| Chat readiness | [`docs/openvibe/openvibe-chat-product-readiness.md`](docs/openvibe/openvibe-chat-product-readiness.md) |
| Community readiness | [`docs/openvibe/openvibe-community-product-readiness.md`](docs/openvibe/openvibe-community-product-readiness.md) |
| AI service | [`docs/openvibe/ai-service.md`](docs/openvibe/ai-service.md) |
| SEO foundation | [`docs/openvibe/seo-foundation.md`](docs/openvibe/seo-foundation.md) |
| Search index seam | [`docs/openvibe/search-index-seam.md`](docs/openvibe/search-index-seam.md) |
| Content sources | [`docs/openvibe/content-source-registry.md`](docs/openvibe/content-source-registry.md) |

## Known limitations / not done yet

- Runtime Postgres is still partial or in progress for many services.
- AI/content workflow seams exist, but full public host product hosts may not
  yet be complete.
- Compatibility-off browser parity still needs broader Phase 9 coverage.
- Staging/cutover reporting and readiness gating remain Phase 9 work.
- Production deployment still requires actual PostgreSQL, Redis, object
  storage, worker processors, and secrets management.

## Contributing / implementation rules

- Preserve current OpenVibe APIs unless adding migration notes.
- Do not reintroduce legacy Hobo runtime dependencies.
- Keep service-to-service auth via internal key/service actor or JWT as
  currently designed.
- Keep mutating APIs policy-gated.
- Keep ledger/money mutation idempotent and auditable.
- Keep media bytes out of relational DBs.
- Keep AI provider keys as env refs only.
