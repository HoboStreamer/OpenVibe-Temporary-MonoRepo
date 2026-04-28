# OpenVibe — Top-level plan index

This file is the canonical entry point for OpenVibe planning. It links the
long-form plan, current phase status, architecture rules, and the live
Phase 8 cutover documentation.

| Topic | Where |
|---|---|
| Long-form architecture plan | [context/PLAN.md](context/PLAN.md) |
| Per-phase status (1–8) | [PHASES.md](PHASES.md) |
| Architecture rules every service must follow | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Hobo → OpenVibe data map | [docs/openvibe/hobo-to-openvibe-data-map.md](docs/openvibe/hobo-to-openvibe-data-map.md) |
| Persistence cutover plan | [docs/openvibe/persistence-cutover-plan.md](docs/openvibe/persistence-cutover-plan.md) |
| Cutover runbook | [docs/openvibe/cutover-runbook.md](docs/openvibe/cutover-runbook.md) |
| Production SSH export workflow | [docs/openvibe/production-ssh-export.md](docs/openvibe/production-ssh-export.md) |
| Postgres canonical loader | [docs/openvibe/postgres-loader.md](docs/openvibe/postgres-loader.md) |
| Staging environment | [docs/openvibe/staging-environment.md](docs/openvibe/staging-environment.md) |
| Media storage strategy | [docs/openvibe/media-storage-strategy.md](docs/openvibe/media-storage-strategy.md) |
| Media backfill | [docs/openvibe/media-backfill.md](docs/openvibe/media-backfill.md) |
| Semantic validation | [docs/openvibe/semantic-validation.md](docs/openvibe/semantic-validation.md) |
| Native runtime independence | [docs/openvibe/runtime-independence.md](docs/openvibe/runtime-independence.md) |
| Admin / staff model | [docs/openvibe/admin-staff-model.md](docs/openvibe/admin-staff-model.md) |

## Phase 8 honest stance

Phase 8 introduces native-by-default runtime, the canonical Hobo migration
contract (export → import → validate → load → backfill → cutover), and the
OpenVibe-native admin/my/themes/tools shells. The remaining work is the
hard-cut migration from transitional scaffolding to fully native runtime:

- SQLite is local-dev bootstrap only. Staging/prod should run with
  `OPENVIBE_PERSISTENCE_MODE=postgres` plus `OPENVIBE_DATABASE_URL`
  (and `OPENVIBE_REDIS_URL` where queue/fanout coordination is needed).
- Media cold storage (`OPENVIBE_MEDIA_COLD_PROVIDER`) is a configuration
  seam only until an operator points it at a real S3-compatible target via
  the `OPENVIBE_MEDIA_COLD_S3_*` aliases.
- Legacy Hobo trees are migration/archive inputs only. The runtime should not
  fall through to the legacy `hobo-tools` UI or require a live Hobo runtime in
  default mode.

See [PHASES.md](PHASES.md) for per-feature acceptance status.

## Quick operator commands

```bash
# Workspace install + syntax + unit tests
npm install
npm run check
npm test

# Migration pipeline (local dry-run)
node scripts/migrate-hobo/import-openvibe.js --source data/migrations/.../production-source --out data/migrations/.../openvibe-target
node scripts/migrate-hobo/validate-migration.js --bundle data/migrations/.../openvibe-target
node scripts/migrate-hobo/load-staging-openvibe.js --bundle data/migrations/.../openvibe-target --dry-run
node scripts/migrate-hobo/backfill-media.js --bundle data/migrations/.../openvibe-target --dry-run

# Cutover rehearsal (gated)
OPENVIBE_ALLOW_STAGING_LOAD=true OPENVIBE_STAGING_CONFIRM=true \
  node scripts/cutover/run-cutover-rehearsal.js
```
