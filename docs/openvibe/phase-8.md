# Phase 8 — OpenVibe runtime independence + Hobo migration

Status: hard-cut implementation in progress.

Follow-on hardening/parity work is now tracked in
[context/PHASE_9.md](../../context/PHASE_9.md) so this Phase 8 index can stay
focused on the migration/runtime-independence work packages themselves.

This document is the index for every Phase 8 work package. It points at the
scripts, services, and per-package docs that move OpenVibe from transitional
Phase 8 scaffolding to a fully native runtime with legacy Hobo repos retained
only as migration and archival sources.

That hard-cut now includes the native `openvibe-games` service for migrated
MMORPG progression, cosmetics, daily quests, and collaborative canvas support.

## Defaults

* `OPENVIBE_ENV=local`
* `OPENVIBE_LEGACY_COMPAT_MODE=false`
* `OPENVIBE_PERSISTENCE_MODE=sqlite`
* `OPENVIBE_MEDIA_PROVIDER_POLICY=b2-default-r2-on-demand`
* `OPENVIBE_MEDIA_CANONICAL_PROVIDER=b2`
* `OPENVIBE_MEDIA_HOT_PROVIDER=r2` (disabled for normal writes until promoted)
* `OPENVIBE_ALLOW_STAGING_LOAD=false`

OpenVibe is OpenVibe-native by default. Legacy Hobo services are migration
inputs only and should stay out of the runtime path unless an operator is
performing a narrowly scoped compatibility diagnostic.

## Work packages

| WP   | Topic                                          | Pointer |
|------|------------------------------------------------|---------|
| WP1  | Hobo reference audit                           | `scripts/migrate-hobo/audit-hobo-references.js` → `data/migrations/audit/` |
| WP2  | Native production runtime stance               | This file + `[runtime-independence](runtime-independence.md)` |
| WP3  | Production export over SSH (read-only)         | `[production-ssh-export](production-ssh-export.md)`, `scripts/migrate-hobo/fetch-production-hobo.js` |
| WP4  | Postgres canonical loader                      | `scripts/migrate-hobo/postgres/`, `[postgres-loader](postgres-loader.md)` |
| WP5  | Staging environment + cold media               | `[staging-environment](staging-environment.md)`, `[media-storage-strategy](media-storage-strategy.md)` |
| WP6  | Persistence-mode seam                          | `packages/openvibe-sdk/persistence-mode.js` |
| WP7  | Media backfill                                 | `[media-backfill](media-backfill.md)`, `scripts/migrate-hobo/backfill-media.js` |
| WP8  | Semantic validation                            | `[semantic-validation](semantic-validation.md)` |
| WP9  | Cutover rehearsal                              | `[cutover-runbook](cutover-runbook.md)`, `scripts/cutover/run-cutover-rehearsal.js` |
| WP10 | Hobo Bucks / Coins / Nickels treatment         | `[hobo-coins-loyalty-migration](hobo-coins-loyalty-migration.md)` |
| WP11 | Centralized staff/admin model                  | `[admin-staff-model](admin-staff-model.md)`, `services/openvibe-network/server/api/staff.js` |
| WP12 | Native openvibe.network hub                    | `[platform-hub](platform-hub.md)`, `services/openvibe-network/public/index.html` |
| WP13 | Native openvibe.tools portal                   | `[platform-hub](platform-hub.md)`, `services/openvibe-network/public/tools.html` |
| WP14 | Admin UI                                       | `services/openvibe-network/public/admin.html` |
| WP15 | My-account UI                                  | `services/openvibe-network/public/my.html` |
| WP16 | Themes UI                                      | `services/openvibe-network/public/themes.html` |
| WP17 | OpenVibe Live UI                               | `[openvibe-live-product-readiness](openvibe-live-product-readiness.md)` |
| WP18 | OpenVibe Chat UI                               | `[openvibe-chat-product-readiness](openvibe-chat-product-readiness.md)` |
| WP19 | OpenVibe Community UI                          | `[openvibe-community-product-readiness](openvibe-community-product-readiness.md)` |
| WP20 | OpenVibe Media UI                              | `services/openvibe-media/public/index.html` |
| WP21 | Legacy runtime removal / compat diagnostics    | `OPENVIBE_LEGACY_COMPAT_MODE` (migration-only diagnostics) |
| WP22 | Phase 8 docs                                   | This document |
| WP23 | Cutover report                                 | `data/migrations/cutover-report.json` |

## How to verify

```bash
npm run check
npm test
node scripts/cutover/run-cutover-rehearsal.js --skip-staging
node scripts/cutover/verify-cutover.js
```

Then start the platform locally:

```bash
node services/openvibe-network/server/index.js &
node services/openvibe-live/server/index.js     &
node services/openvibe-chat/server/index.js     &
node services/openvibe-community/server/index.js &
node services/openvibe-media/server/index.js    &
```

Open `http://localhost:4100/` (the OpenVibe Network hub) — the service
directory and Ctrl/⌘ K launcher should populate from the registry.
