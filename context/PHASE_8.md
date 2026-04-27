@workspace /fix Analyze the #codebase then implement, complete, and test everything required for OpenVibe Phase 8.

Do not stop at planning. Implement the code, scripts, schemas, loaders, migrations, staging import workflow, production export workflow, media backfill, PostgreSQL/staging persistence support, service readiness checks, native OpenVibe platform hub, admin/staff model, tools portal, live product readiness, chat product readiness, community product readiness, media platform integration, billing/loyalty integration, cutover validation, docs, tests, and final readiness artifacts necessary for OpenVibe to fully replace the legacy HoboStreamer/HoboApp runtime in staging.

This prompt is self-contained. Do not assume any other phase prompt exists.

---

# 0. Active workspace context

You are working in the active OpenVibe workspace.

Legacy migration/reference source trees exist under:

- `HoboReposToMigrateFrom/HoboStreamer.com`
- `HoboReposToMigrateFrom/HoboApp`

Those legacy source trees are migration inputs and reference material only.

They are not the target runtime architecture.

The target is a native OpenVibe platform made of services such as:

- `openvibe.network`
- `auth.openvibe.network`
- `api.openvibe.network`
- `admin.openvibe.network`
- `my.openvibe.network`
- `themes.openvibe.network`
- `events.openvibe.network`
- `openvibe.media`
- `openvibe.live`
- `openre.stream`
- `openvibe.chat`
- `openvibe.community`
- `openvibe.tools`
- `openvibe.games`
- `billing.openvibe.network`
- `ai.openvibe.network`

Phase 8 must turn the workspace into a working OpenVibe-native staging platform with legacy Hobo data imported, migrated, validated, and usable through OpenVibe services.

---

# 1. Phase 8 goal

Implement, complete, and test everything in Phase 8.

By the end of this work:

1. Production Hobo data can be safely exported from `hobo.tools`.
2. HoboStreamer and HoboApp/hobo-tools data can be transformed into canonical OpenVibe migration bundles.
3. The canonical bundle can be loaded into staging OpenVibe stores.
4. Canonical PostgreSQL staging load is available when configured.
5. Current service-local stores can be hydrated where needed for service testing.
6. Media metadata and media files can be backfilled into OpenVibe media storage.
7. OpenVibe services can query migrated data.
8. OpenVibe auth/network/themes/admin/my-account/events/media/live/chat/community surfaces are testable.
9. Hobo runtime compatibility is opt-in, not default.
10. `openvibe.network` is a real public platform hub.
11. `openvibe.tools` is a real searchable tool/service portal.
12. `admin.openvibe.network` has real admin/operator functionality.
13. `my.openvibe.network` is a real account hub.
14. `themes.openvibe.network` is a real theme catalog/management surface.
15. `openvibe.live` is a native streaming product, not a shell.
16. `openvibe.chat` is a native chat/DM/call/TTS/audio product, not an API shell.
17. `openvibe.community` is a native forum/paste/thread/community product, not a shell.
18. `openvibe.media` is the shared media object/storage/backfill platform.
19. Billing, subscriptions, rewards, tips metadata, and loyalty data are migrated or staged safely.
20. Hobo Bucks are not imported as canonical OpenVibe spendable balances.
21. Hobo Coins/Nickels are migrated only as non-cash loyalty/progression state.
22. A cutover rehearsal can run and produce a final machine-readable readiness report.
23. HoboStreamer/HoboApp are no longer required for normal OpenVibe staging runtime.
24. Legacy compatibility can be disabled without breaking OpenVibe-native staging flows.

This is an implementation prompt, not an architecture discussion prompt.

---

# 2. Non-negotiable architecture rules

OpenVibe must not depend on the legacy Hobo runtime by default.

Legacy Hobo compatibility may remain only as:

- migration source,
- archive/reference,
- rollback shim,
- explicit opt-in compatibility mode.

Default mode must be OpenVibe-native.

Use or add a flag like:

```env
OPENVIBE_LEGACY_COMPAT_MODE=false
```

Compatibility code should remain isolated, documented, gated, and removable later.

Do not delete compatibility code unless it is clearly dead and safe to remove. Prefer gating and documentation.

Do not remove the legacy folders under `HoboReposToMigrateFrom/`.

---

# 3. Production safety boundary for `hobo.tools`

Production Hobo data currently lives on SSH host:

```text
hobo.tools
```

You may implement and run scripts that use:

* `ssh`
* `scp`
* `rsync`
* `tar`
* `sqlite3`
* checksums
* temp files
* read-only discovery commands

Production-facing scripts must be safe.

Allowed production actions:

* inspect files/directories,
* create temp directories under `/tmp/openvibe-migration-*`,
* create SQLite `.backup` snapshots,
* create SQLite `.dump` files,
* create file/media manifests,
* redact env/config files,
* compute checksums,
* tar/gzip temp export artifacts,
* transfer artifacts back to staging.

Forbidden production actions unless explicitly approved later:

* delete production data,
* mutate production DBs,
* truncate tables,
* restart services,
* install packages,
* rotate secrets,
* rewrite production config,
* change DNS,
* change firewall rules,
* destructive cleanup outside the exact temp export directory.

Never print secrets.

Never commit production artifacts.

Add or verify `.gitignore` coverage for migration data/artifacts.

---

# 4. Known production host defaults

Use these as configurable defaults/candidates, not hardcoded-only paths.

Observed production host defaults:

* SSH alias: `hobo.tools`
* likely SSH user: `ubuntu`
* HoboStreamer root: `/opt/hobostreamer`
* HoboStreamer env: `/opt/hobostreamer/.env`
* HoboStreamer primary DB: `/opt/hobostreamer/data/hobostreamer.db`
* analytics DB: `/opt/hobostreamer/data/analytics.db`
* RobotStreamer/companion DB: `/opt/hobostreamer/data/rs-companion.db`
* media/data directories:

  * `/opt/hobostreamer/data/vods`
  * `/opt/hobostreamer/data/clips`
  * `/opt/hobostreamer/data/thumbnails`
  * `/opt/hobostreamer/data/emotes`
  * `/opt/hobostreamer/data/avatars`
  * `/opt/hobostreamer/data/media`
  * `/opt/hobostreamer/data/pastes`

Other candidate DBs:

* `/opt/hobo/hobo-tools/data/hobo-tools.db`
* `/opt/hobo/hobo-quest/data/hobo-quest.db`
* `/opt/hobo-img/data/analytics.db`
* `/opt/hobo/hobo-docs/data/analytics.db`
* `/opt/hobo/hobo-text/data/analytics.db`
* `/opt/hobo/hobo-audio/data/analytics.db`
* `/opt/hobo-maps/data/analytics.db`
* `/opt/hobo-food/data/analytics.db`
* `/opt/hobo-yt/data/analytics.db`

All paths must be overridable by CLI flags/env/config.

---

# 5. Inspect these files first

Before editing, inspect the workspace and report confirmatory findings.

Inspect:

#file:README.md
#file:PHASES.md
#file:PLAN.md
#file:context/PLAN.md
#file:docs/openvibe/persistence-cutover-plan.md
#file:docs/openvibe/hobo-to-openvibe-data-map.md
#file:docs/openvibe/legacy-billing-migration.md
#file:docs/openvibe/migration-map.md
#file:scripts/migrate-hobo/README.md
#file:scripts/migrate-hobo/export-hobostreamer.js
#file:scripts/migrate-hobo/export-hobotools.js
#file:scripts/migrate-hobo/import-openvibe.js
#file:scripts/migrate-hobo/validate-migration.js
#file:scripts/migrate-hobo/lib/common.js
#file:scripts/migrate-hobo/lib/datasets.js
#file:scripts/migrate-hobo/lib/exporter.js
#file:scripts/migrate-hobo/lib/importer.js
#file:scripts/migrate-hobo/lib/validator.js
#file:scripts/migrate-hobo/test/migration-foundation.test.js
#file:scripts/run-tests.js
#file:services/openvibe-network/server/db.js
#file:services/openvibe-events/server/db.js
#file:services/openvibe-media/server/db.js
#file:services/openvibe-media/server/storage.js
#file:services/openvibe-billing/server/db.js
#file:services/openre-stream/server/db.js
#file:services/openvibe-live/server/db.js
#file:services/openvibe-chat/server/db.js
#file:services/openvibe-community/server/db.js
#file:services/openvibe-ai/server/db.js
#file:HoboReposToMigrateFrom/HoboStreamer.com/server/db/schema.sql
#file:HoboReposToMigrateFrom/HoboStreamer.com/server/db/database.js
#file:HoboReposToMigrateFrom/HoboStreamer.com/server/monetization/hobo-coins.js
#file:HoboReposToMigrateFrom/HoboApp/hobo-tools/server/db/database.js

Also discover:

* all `.env.example` files,
* all service README files,
* all service `package.json` files,
* all current public/static UI entrypoints,
* all current service routes,
* all current health/readiness endpoints,
* all `compat/` directories,
* all Hobo compatibility/federation code,
* all existing admin routes,
* all existing theme/account/notification routes,
* all existing live/chat/community/media routes,
* all existing billing/loyalty/reward code,
* all existing stream/VOD/clip/restream code,
* all existing paste/comment/Discord relay code.

Search `#codebase` for:

* `hobo.tools`
* `hobostreamer.com`
* `HoboStreamer`
* `HoboApp`
* `hobostreamer`
* `hobotools`
* `HOBO_TOOLS`
* `HOBO_TOOLS_PUBLIC_KEY`
* `HOBO_TOOLS_INTERNAL_URL`
* `HOBOSTREAMER`
* `HoboQuest`
* `hobo-quest`
* `OPENVIBE_LEGACY_COMPAT_MODE`
* `openvibe-target`
* `migration_runs`
* `legacy_id`
* `readiness-phase8`
* `cutover-report`
* `postgres`
* `pg`
* `redis`
* `ioredis`
* `S3SeamProvider`
* `Backblaze`
* `B2`
* `BuyVM`
* `Hobo Bucks`
* `Hobo Coins`
* `Hobo Nickels`
* `coin_transactions`
* `coin_rewards`
* `coin_redemptions`
* `watch_time`
* `global_mod`
* `admin_panel`
* `capabilities`
* `registry`
* `pastes`
* `TTS`
* `voice`
* `DM`
* `discord`
* `vibe_coding_publish`

---

# 6. Confirmatory analysis requirement

Before modifying files, report:

1. Current migration exporter/importer/validator entrypoints.
2. Current canonical bundle shape.
3. Current excluded/deferred datasets.
4. Current service DB/persistence architecture.
5. Which services still use SQLite.
6. Whether PostgreSQL loader exists.
7. Whether service-local loader exists.
8. Whether Redis is runtime-wired or env-only.
9. Whether S3/B2 byte transfer exists or config seam only.
10. Which Hobo compatibility configs are default.
11. Which OpenVibe product surfaces are shells vs working.
12. Which admin/staff features exist.
13. Which registry/search/tool catalog features exist.
14. Which live/chat/community product features exist.
15. Which media/VOD/clip/upload features exist.
16. Which billing/loyalty/reward features exist.
17. Exact files you will add/edit.
18. Tests you will add/update.
19. Docs/env examples you will update.
20. Any conflicts between existing code and this prompt.

Then implement.

---

# 7. Phase 8 implementation work packages

Implement all work packages below.

---

## WP1 — Hobo dependency audit and OpenVibe-native default runtime

Create an audit script.

Suggested files:

* `scripts/migrate-hobo/audit-hobo-references.js`
* `scripts/audit-hobo-references.js`

Output artifacts:

* `data/migrations/audit/hobo-ref-list.json`
* `data/migrations/audit/hobo-ref-summary.md`

Classify references as:

* `migration-source`
* `legacy-compatibility`
* `runtime-default-dependency`
* `documentation`
* `test-fixture`
* `archive`
* `needs-remediation`

Audit terms:

* `hobo.tools`
* `hobostreamer.com`
* `HoboStreamer`
* `HoboApp`
* `hobostreamer`
* `hobotools`
* `HOBO_TOOLS`
* `HOBO_TOOLS_PUBLIC_KEY`
* `HOBO_TOOLS_INTERNAL_URL`
* `HOBOSTREAMER`
* `HoboQuest`
* `hobo-quest`

Then remediate defaults:

* default docs/env examples should not require live `hobo.tools`,
* Hobo federation must be opt-in,
* `OPENVIBE_LEGACY_COMPAT_MODE=false` must be default,
* OpenVibe-native mode must be clearly documented,
* remaining Hobo references must be migration/archive/compat only.

Do not remove legacy source folders under `HoboReposToMigrateFrom`.

Do not delete compatibility code yet. Gate it.

---

## WP2 — Safe production fetch/export automation from `hobo.tools`

Create:

* `scripts/migrate-hobo/lib/production-fetch.js`
* `scripts/migrate-hobo/fetch-production-hobo.js`
* `scripts/migrate-hobo/production-paths.example.json`

Required CLI flags:

* `--host hobo.tools`
* `--user <ssh-user>`
* `--remote-hobostreamer-root <path>`
* `--remote-hobotools-root <path>`
* `--remote-hobostreamer-db <path>`
* `--remote-hobotools-db <path>`
* `--remote-analytics-db <path>`
* `--remote-rs-companion-db <path>`
* `--out <local-output-dir>`
* `--dry-run`
* `--confirm`
* `--summary`
* `--skip-media`
* `--media-mode metadata-only|copy-hot`
* `--ssh-options "<opts>"`
* `--cleanup-remote-temp`
* `--strict`

Behavior:

* dry-run by default,
* discover candidate paths,
* validate remote paths where possible,
* create remote temp dir under `/tmp/openvibe-migration-*`,
* snapshot SQLite DBs using `sqlite3 ".backup"` where possible,
* fallback to read-only copy/dump if backup unavailable,
* create media manifests with sizes/paths,
* redact copied config/env files,
* compute sha256 checksums,
* transfer artifacts to staging output dir,
* produce `production-fetch-report.json`,
* never print secrets,
* never mutate production DBs,
* never write outside temp dir,
* use `rsync` for media copy when `copy-hot` is requested,
* support resume-friendly copy behavior.

Report fields:

* generated_at,
* host,
* user,
* dry_run,
* remote_temp_dir,
* discovered_candidates,
* selected_paths,
* db_snapshots,
* config_exports,
* media_manifests,
* copied_artifacts,
* sizes,
* checksums,
* redactions,
* skipped_items,
* warnings,
* commands_planned,
* commands_executed.

Tests must mock child_process/SSH. Do not require real production access.

---

## WP3 — Complete migration bundle coverage

Update existing migration bundle generation to cover all required source data.

Edit as needed:

* `scripts/migrate-hobo/lib/datasets.js`
* `scripts/migrate-hobo/lib/importer.js`
* `scripts/migrate-hobo/lib/validator.js`
* `scripts/migrate-hobo/README.md`
* `docs/openvibe/hobo-to-openvibe-data-map.md`
* `docs/openvibe/legacy-billing-migration.md`

Ensure the canonical `openvibe-target/` bundle covers at minimum:

### Identity/control

* hobo-tools users/accounts,
* HoboStreamer users merged into canonical identity,
* linked accounts,
* anon users,
* verification keys,
* user effects,
* username conflicts,
* user preferences,
* notifications,
* notification preferences,
* URL registry/control-plane records,
* OAuth clients with secrets excluded,
* themes,
* theme preferences.

### Live/streaming

* follows/viewers/analytics graph,
* channels,
* managed streams / stream definitions,
* stream sessions,
* stream analytics/viewer snapshots where available,
* channel moderators,
* moderation settings,
* restream destinations metadata,
* RobotStreamer metadata,
* camera profiles/presets metadata with credentials excluded,
* vibe-coding sessions/events,
* safe API token metadata and scopes, excluding raw secrets.

### Chat/community

* chat messages,
* chat moderation/bans,
* global rooms,
* stream rooms,
* DMs/conversation metadata where available,
* call/voice signaling metadata where safe,
* comments on VODs/clips/pastes/streams/posts,

### Community

* pastes,
* paste likes,
* paste comments.

### Media

* VOD metadata,
* clip metadata,
* thumbnail refs,
* avatars,
* emotes,
* paste screenshots,
* paste/community attachments,
* chat/media request assets,
* media request metadata/settings.

### Billing/entitlements/loyalty

* subscriptions as legacy entitlement/subscription records,
* donation goals as historical goals only if useful and not active balance truth,
* reward/redemption metadata,
* media request monetization metadata,
* Hobo Coins / Hobo Nickels loyalty balances,
* Hobo Coins/Nickels loyalty transactions/rewards/redemptions/watch-time.

Hobo Coins/Nickels rules:

* migrate only as non-cash loyalty/progression state,
* do not convert to OpenVibe credits,
* do not make spendable/cash-outable,
* keep separate from billing ledger.

Hobo Bucks rules:

* do not import Hobo Bucks balances into OpenVibe credits/balances,
* do not import Hobo Bucks transactions as canonical wallet truth,
* if retained, store as historical non-spendable archive/reconciliation only,
* audit must prove exclusion.

Explicitly exclude from active canonical systems:

* active sessions,
* OAuth codes,
* OAuth tokens,
* password reset tokens,
* push subscriptions,
* production secrets,
* API keys/secrets/tokens,
* secret-bearing site settings,
* raw private credentials.

Add:

* `docs/openvibe/hobo-coins-loyalty-migration.md`

---

## WP4 — Canonical PostgreSQL schema and loader

Add a real PostgreSQL staging/canonical loader.

Create:

* `scripts/migrate-hobo/postgres/schema/001_core.sql`
* `scripts/migrate-hobo/postgres/schema/010_identity_control.sql`
* `scripts/migrate-hobo/postgres/schema/020_social_live.sql`
* `scripts/migrate-hobo/postgres/schema/030_chat_community_media.sql`
* `scripts/migrate-hobo/postgres/schema/040_billing_loyalty.sql`
* `scripts/migrate-hobo/lib/postgres.js`
* `scripts/migrate-hobo/lib/postgres-loader.js`
* `scripts/migrate-hobo/migrate-postgres.js`
* `scripts/migrate-hobo/load-postgres.js`
* `scripts/migrate-hobo/validate-postgres.js`
* `scripts/migrate-hobo/lib/postgres-validator.js`

Add dependency:

* `pg`

Add Redis/S3 dependencies only if actually used by implemented runtime code.

Postgres schema must include:

Migration metadata:

* `migration_runs`
* `migration_legacy_id_map`
* `migration_audit`
* `migration_reconciliation`
* `migration_import_hold`

Core schemas/tables:

* identity users,
* linked accounts,
* anon users,
* verification keys,
* user effects,
* themes catalog,
* theme preferences,
* control URL registry,
* OAuth clients without secrets,
* notifications,
* notification preferences,
* follows,
* live channels,
* stream definitions,
* stream sessions,
* restream metadata,
* RobotStreamer metadata,
* channel moderators,
* stream analytics/viewer snapshots where possible,
* chat messages,
* chat rooms,
* DMs/conversation metadata where possible,
* chat moderation bans/actions,
* community pastes,
* paste likes,
* paste comments,
* community comments,
* threads/posts/spaces import-hold where target not yet complete,
* media objects,
* media derivatives,
* media lifecycle audit,
* billing subscriptions,
* legacy finance archive/reconciliation,
* loyalty accounts,
* loyalty transactions,
* loyalty rewards,
* loyalty redemptions,
* loyalty watch time.

Loader requirements:

* read `openvibe-target/**/*.ndjson`,
* use transactions,
* use idempotent upserts,
* preserve deterministic IDs,
* record run IDs,
* record legacy ID mappings,
* record audit/reconciliation rows,
* support batch loading,
* support resume/rerun,
* support `--only <dataset>`,
* support dry-run,
* produce `postgres-load-report.json`,
* refuse destructive behavior unless target is clearly local/dev/staging and explicit flags are provided.

CLI flags:

* `--bundle <dir>`
* `--database-url <url>`
* `--run-id <id>`
* `--dry-run`
* `--apply`
* `--validate-target`
* `--strict`
* `--batch-size <n>`
* `--resume`
* `--only <dataset>`
* `--emit-report`
* `--allow-production`
* `--allow-reset-staging`

Do not require Postgres for unit tests. Add mock-client tests. Optional real Postgres tests can be gated behind `OPENVIBE_TEST_DATABASE_URL`.

---

## WP5 — Staging service-local loader and hydration

Because current services may still use service-local SQLite, add a staging loader that hydrates current service stores from `openvibe-target/`.

Create:

* `scripts/migrate-hobo/lib/staging-loader.js`
* `scripts/migrate-hobo/load-staging-openvibe.js`

Requirements:

* reads `openvibe-target/**/*.ndjson`,
* maps datasets into current service DBs,
* uses service-local SQLite by default,
* can use Postgres mode where available,
* idempotent upserts,
* records `migration_runs`,
* records `migration_legacy_id_map`,
* creates import-hold tables for unsupported records,
* writes `openvibe-target/audit/staging-load-report.json`,
* skips Hobo Bucks canonical balance import,
* imports Hobo Coins/Nickels only as loyalty/progression data,
* skips secrets and ephemeral tokens,
* preserves raw source records in import-hold if no native schema exists.

CLI flags:

* `--bundle <dir>`
* `--mode sqlite|postgres`
* `--confirm-load`
* `--dry-run`
* `--run-id <id>`
* `--only-service <service>`
* `--only-dataset <dataset>`
* `--strict`
* `--out <dir>`

Hydrate enough data for:

* `openvibe-network`
* `openvibe-events`
* `openvibe-media`
* `openvibe-billing`
* `openre-stream`
* `openvibe-live`
* `openvibe-chat`
* `openvibe-community`
* `openvibe-ai` where relevant.

If a schema cannot fully represent data, preserve it in import-hold and report it.

---

## WP6 — Service persistence mode seams

Update service DB entrypoints:

#file:services/openvibe-network/server/db.js
#file:services/openvibe-events/server/db.js
#file:services/openvibe-media/server/db.js
#file:services/openvibe-billing/server/db.js
#file:services/openre-stream/server/db.js
#file:services/openvibe-live/server/db.js
#file:services/openvibe-chat/server/db.js
#file:services/openvibe-community/server/db.js
#file:services/openvibe-ai/server/db.js

Implement or improve:

* `OPENVIBE_PERSISTENCE_MODE=sqlite`
* `OPENVIBE_PERSISTENCE_MODE=postgres`
* `OPENVIBE_PERSISTENCE_MODE=staging`

SQLite can remain default for easy local bootstrapping, but OpenVibe staging must be able to use hydrated data.

No service should require live `hobo.tools` in default mode.

Compatibility must require:

```env
OPENVIBE_LEGACY_COMPAT_MODE=true
```

Do not do a destructive rewrite of all services. Add minimal adapters/readiness hooks needed for this phase.

---

## WP7 — Media storage, hot/cold strategy, and media backfill

Update:

#file:services/openvibe-media/server/storage.js

Support:

* hot local/block storage,
* configurable hot root path,
* cold provider `none|s3|b2`,
* S3-compatible config placeholders,
* Backblaze B2-compatible config names,
* storage key generation,
* sha256,
* size bytes,
* tier metadata,
* lifecycle status,
* migration status,
* last verified timestamp.

Create:

* `scripts/migrate-hobo/lib/media-backfill.js`
* `scripts/migrate-hobo/backfill-media.js`

Behavior:

* read `openvibe-target/media/objects.ndjson`,
* read media manifests from production fetch,
* map legacy refs to OpenVibe media IDs/storage keys,
* support metadata-only mode,
* support copy-hot mode,
* copy available files into `$OPENVIBE_MEDIA_HOT_ROOT`,
* compute checksums and sizes,
* write `media-backfill-report.json`,
* missing media diagnostics are non-fatal by default,
* `--strict` makes missing media fatal,
* idempotent/resumable.

CLI flags:

* `--bundle <dir>`
* `--source <production-fetch-dir>`
* `--hot-root <path>`
* `--mode metadata-only|copy-hot`
* `--dry-run`
* `--confirm`
* `--strict`
* `--out <dir>`

Docs must explain:

* hot storage as BuyVM/block-storage-style mounted disk,
* cold storage as Backblaze B2/S3-compatible,
* local mode with cold provider `none`,
* lifecycle plan.

---

## WP8 — Semantic validation and readiness reporting

Add semantic validation beyond structural validation.

Create/update:

* `scripts/migrate-hobo/validate-postgres.js`
* `scripts/migrate-hobo/lib/postgres-validator.js`
* `scripts/staging/check-staging-env.js`
* `scripts/staging/smoke-openvibe-services.js`
* `scripts/migrate-hobo/lib/readiness-report.js`

Validation must check:

### Identity

* every migrated user has canonical identity,
* linked accounts resolve,
* anon identities represented,
* username conflicts reported,
* active sessions/tokens excluded.

### Control plane

* URL registry loads,
* notifications resolve,
* theme preferences resolve users/themes,
* OAuth clients load without secrets,
* service registry records exist.

### Live

* channel owners resolve,
* stream definitions resolve,
* stream sessions resolve,
* restream metadata loads with secrets redacted,
* RobotStreamer metadata loads with tokens redacted,
* channel moderators resolve.

### Chat/community

* chat sender refs resolve or become anon/system identities,
* comments resolve owner/target where possible,
* pastes resolve owners,
* paste likes/comments resolve refs,
* DMs/conversation data loads or lands in import-hold,
* call/TTS metadata loads or lands in import-hold.

### Media

* VODs resolve stream/user/media refs where possible,
* clips resolve parent VOD/stream/user where possible,
* media objects have valid namespace/type/status,
* media backfill report exists,
* missing media diagnostics surfaced.

### Billing/loyalty

* subscriptions resolve subscriber/creator identities,
* Hobo Bucks excluded from spendable canonical balances,
* no canonical billing wallet seeded from Hobo Bucks,
* Hobo Coins/Nickels imported as loyalty/progression only,
* Hobo Bucks historical archive marked non-spendable if retained.

### Counts

* imported row counts match bundle counts after merge/skips,
* legacy ID mappings exist,
* skipped/excluded/import-hold counts reported.

Produce:

* `openvibe-target/audit/validation-summary.json`
* `openvibe-target/audit/readiness-report.json`
* `data/migrations/readiness-phase8.json`

Readiness must honestly classify gates as:

* green,
* yellow,
* red.

Do not fake readiness for placeholder shells.

---

## WP9 — Unified orchestrator

Create or complete:

* `scripts/migrate-hobo/staging-cutover-rehearsal.js`

It must coordinate:

1. Hobo reference audit,
2. staging env validation,
3. optional production fetch,
4. HoboStreamer export,
5. hobo-tools export,
6. canonical OpenVibe bundle import,
7. bundle validation,
8. staging service-local load,
9. optional Postgres schema/load,
10. media backfill,
11. semantic validation,
12. service smoke checks,
13. product smoke checks,
14. cutover readiness report generation.

CLI flags:

* `--dry-run`
* `--confirm`
* `--source <dir>`
* `--out <dir>`
* `--host hobo.tools`
* `--fetch-production`
* `--skip-fetch`
* `--skip-media`
* `--media-mode metadata-only|copy-hot`
* `--load-staging`
* `--load-postgres`
* `--database-url <url>`
* `--mode sqlite|postgres`
* `--strict`
* `--run-id <id>`
* `--emit-report`

Default artifact root:

* `./data/migrations/hobo-production-staging`

Required artifacts:

* `production-fetch-report.json`
* `hobostreamer/manifest.json`
* `hobotools/manifest.json`
* `openvibe-target/audit/import-report.json`
* `openvibe-target/audit/validation-summary.json`
* `openvibe-target/audit/staging-load-report.json`
* `openvibe-target/audit/postgres-load-report.json` when Postgres load runs
* `openvibe-target/audit/media-backfill-report.json`
* `openvibe-target/audit/readiness-report.json`
* `data/migrations/readiness-phase8.json`
* `data/migrations/audit/hobo-ref-list.json`
* `data/migrations/audit/migration-coverage.json`
* `data/migrations/cutover-report.json`

---

## WP10 — Registry and event foundation

Implement the platform registry and event foundation.

Implement/complete:

* `api.openvibe.network` registry endpoints,
* service/tool registry schema,
* search/filter endpoints,
* category metadata,
* featured/trending metadata,
* health/status metadata,
* machine-readable service manifest endpoint,
* event publish/list or publish/subscribe smoke capability.

Suggested endpoints:

* `GET /api/registry`
* `GET /api/registry/:service`
* `GET /api/registry/search?q=...`
* `GET /api/registry/categories`
* `GET /api/registry/featured`
* `GET /api/capabilities`
* `GET /api/contracts`
* `GET /api/health`

Registry records should include:

* service id,
* display name,
* domain,
* launch URL,
* description,
* icon,
* category tags,
* owner service,
* auth requirement,
* anonymous support,
* theme support,
* status,
* featured/trending flags,
* capabilities,
* docs URL.

Add seed data for all OpenVibe domains.

Do not hardcode tool lists only in UI. UI should consume registry API where possible.

---

## WP11 — Centralized staff model and admin functionality

Create either a dedicated service or integrated module:

* `services/openvibe-staff/`
* or `services/openvibe-network/server/staff*`
* plus shared library under an existing shared package if appropriate.

Implement:

* role rank model,
* capability map,
* `global_mod`,
* `admin`,
* staff roles table,
* inherited/migrated legacy role support,
* admin-only role update endpoint,
* audit logging for staff/admin actions.

Suggested API:

* `GET /api/staff/capabilities?user=<id>`
* `GET /api/staff/global-moderators`
* `PUT /api/staff/roles/:id`
* `GET /api/admin/users`
* `PUT /api/admin/users/:id/role`
* `PUT /api/admin/users/:id/ban`
* `GET /api/admin/audit`

Capability examples:

* `admin_panel`
* `manage_users`
* `manage_roles`
* `moderate_global`
* `manage_site_bans`
* `view_all_logs`
* `manage_settings`
* `broadcast_notifications`
* `manage_storage`
* `manage_registry`
* `manage_themes`
* `manage_compat`
* `manage_deploy`

Admin functionality must cover at minimum:

* site settings read/update,
* user management,
* role promote/demote,
* ban/unban,
* moderator list,
* audit log,
* health/stats,
* broadcast notification,
* email config read/update/test where existing patterns exist,
* storage/media overview,
* queue/status overview,
* compatibility mode status.

Every write action must audit:

* actor,
* action,
* target,
* details,
* timestamp,
* migration run ID where relevant.

---

## WP12 — Native `openvibe.network` platform hub

Build `openvibe.network` as a real public platform hub.

It must include:

* hero: “One account. Every OpenVibe service.”
* explanation of shared identity, themes, modules, media, events, and economy,
* CTAs: Create Free Account, Sign In, Browse Services,
* service directory grid,
* major domain cards:

  * openvibe.live
  * openre.stream
  * openvibe.chat
  * openvibe.community
  * openvibe.media
  * openvibe.tools
  * openvibe.games
  * openvibe.vip
  * openvibe.tips
  * openvibe.codes
  * openvibe.wiki
  * openvibe.blog
  * openvibe.news
  * openvibe.reviews
  * openvibe.deals
  * openvibe.coupons
  * openvibe.trade
  * openvibe.host
* metrics strip,
* featured service tiles,
* open-source/community/non-profit/no-tracking/no-ads/modular message,
* anonymous browsing story,
* account/theme sync story,
* footer with docs/GitHub/Discord/Terms/DMCA/legal links,
* live counts/status from registry/events where available.

Use existing frontend patterns. Avoid adding a new framework unless the repo already uses one.

---

## WP13 — Native `openvibe.tools` portal

Build `openvibe.tools` as a real service/tool discovery portal.

Required:

* searchable tool/service directory,
* Ctrl+K keyboard launcher,
* category filters/counts,
* featured/trending tools,
* direct launch buttons,
* anonymous browse support,
* authenticated favorites if account APIs exist,
* recently used tools if practical,
* service command center for major OpenVibe domains,
* no-ads/community values panel,
* registry-backed cards, not static-only cards,
* header links to Home, Themes, My Account, Sign In,
* admin/operator launch links when capability allows.

Tool card metadata:

* icon,
* title,
* description,
* domain/subdomain,
* category,
* tags,
* launch CTA,
* auth required/optional,
* theme support,
* health/status,
* featured/trending badge.

---

## WP14 — Native `my.openvibe.network`

Build a native account hub.

Minimum features:

* profile display,
* account settings shell,
* linked accounts view from migrated data,
* session/security section or documented placeholder,
* notification preferences,
* theme chooser integration,
* favorite/recent tools if supported,
* cross-service navigation,
* multi-account/account-switcher UX where existing auth supports it,
* anonymous session conversion/linking UX if practical.

---

## WP15 — Native `themes.openvibe.network`

Build a real theme catalog and preview/apply flow.

Minimum features:

* list built-in/migrated themes,
* preview theme cards,
* current user preference,
* apply theme network-wide or per-service where supported,
* CSS variable/token preview,
* import/export placeholder if not fully implemented,
* service variant notes,
* integration with `my.openvibe.network`.

Use migrated hobo-tools theme data.

---

## WP16 — Native `admin.openvibe.network`

Build native admin/operator surface.

Minimum tabs/sections:

* overview/health,
* users,
* roles/staff,
* settings,
* registry/services,
* events/queues,
* media/storage,
* migration/readiness,
* compatibility mode,
* audit logs,
* notifications/broadcast,
* moderation queues where data exists.

Admin UI must respect capability map.

Global moderators should see only allowed moderation/staff sections.

Admins see full controls.

Every write action must audit.

---

## WP17 — Native `openvibe.live` product readiness

Implement or complete OpenVibe Live as the replacement for HoboStreamer public streaming surfaces.

Required product areas:

### Home/discovery

* polished live homepage,
* hero and streaming narrative,
* featured live streams,
* recently online,
* live now counts,
* category/tag discovery,
* links to chat/community/media/tools/docs,
* sign in / go live CTAs.

### Channel/stream pages

* channel page,
* live stream page,
* player/embed area,
* metadata/title/description/category/tags,
* viewer count,
* follow/favorite actions where backend supports,
* chat embed via openvibe.chat,
* clips/VOD links,
* related community/pastes links.

### Broadcast onboarding

Support/describe:

* browser WebRTC,
* RTMP/OBS,
* JSMPEG/FFmpeg,
* WHIP,
* restream via openre.stream.

Implement UI/routes as far as current services support, with honest disabled/coming-soon states only where backend truly missing.

### Broadcaster dashboard

Include:

* stream creation/settings,
* stream key/ingest info where supported,
* restream targets/status,
* VOD/clip management,
* thumbnail/asset links,
* analytics entry points,
* moderation entry points,
* API token/vibe-coding publish links if implemented.

### Media integration

* VOD gallery,
* clip gallery,
* thumbnail fallbacks,
* media object references from `openvibe.media`,
* missing media diagnostics surfaced appropriately.

Legacy HoboStreamer should be fallback only.

---

## WP18 — Native `openvibe.chat` product readiness

Implement or complete OpenVibe Chat as the communication platform.

It must own:

* migrated chat,
* global chat,
* stream rooms,
* DMs,
* voice/cam call signaling UX,
* streamer-to-viewer call capability shell,
* TTS manager,
* soundboard/audio queue,
* 101soundboards/audio playback integration surface where practical,
* moderation.

Required surfaces:

* chat landing page,
* global rooms,
* stream rooms,
* DM inbox,
* direct conversation page,
* room list,
* message composer,
* emoji/emote/GIF support where practical,
* attachments via `openvibe.media`,
* TTS enqueue/control UI,
* audio queue manager,
* moderation actions:

  * delete,
  * purge,
  * ban,
  * timeout,
  * slow mode/sub-only settings where supported,
* logs/search/export where practical,
* voice/call room UI or readiness shell,
* presence/room counts where supported.

Chat must integrate with:

* auth,
* staff capabilities,
* events,
* media,
* live stream pages,
* tips/TTS hooks where available.

---

## WP19 — Native `openvibe.community` product readiness

Implement or complete OpenVibe Community.

It must own:

* forum/discussion/social hub,
* migrated pastes,
* paste/image sharing,
* spaces/threads/posts/comments,
* Discord relay integration/readiness,
* reusable comment/discussion primitives.

Required surfaces:

* community home,
* spaces listing,
* threads/posts listing,
* paste/image hub,
* paste creation/upload,
* paste detail page,
* image/media attachment preview,
* comments/replies,
* search/filter/sort,
* moderation actions,
* source labels for Discord-relayed content,
* Discord relay management shell or API if backend exists,
* stream/community cross-links.

Pastes must migrate here.

Comments attached to streams, clips, pastes, and posts should be represented here or through shared comment primitives.

Attachments must use `openvibe.media` IDs/storage references, not only legacy absolute paths.

---

## WP20 — `openvibe.media` product/platform completion

Beyond backfill, ensure media service is usable by product surfaces.

Implement/complete:

* media object list/query endpoints,
* upload init/complete flow if missing,
* metadata update path,
* hot storage retrieval/local file serving in staging,
* VOD/clip/thumbnail object support,
* attachment support,
* search/filter by namespace/type/owner/status,
* lifecycle metadata,
* missing media diagnostics,
* media admin/storage overview.

Derivative generation can be basic/stubbed with honest report if full FFmpeg pipeline is not feasible in this slice, but data model and worker seam must exist.

---

## WP21 — Billing, tips, VIP, rewards, and loyalty integration

Do not fully build Stripe/PayPal production checkout unless already present and safe.

Implement OpenVibe-native data/model seams and migrated state needed for readiness.

Required:

* billing ledger separation,
* legacy subscription import,
* legacy entitlement import,
* creator/subscriber refs,
* Hobo Bucks historical archive only,
* Hobo Bucks excluded from spendable balances,
* Hobo Coins/Nickels loyalty import,
* reward/redemption queue import,
* donation goals as historical/legacy metadata,
* media request monetization metadata/settings,
* admin visibility into imported billing/loyalty state,
* live dashboard entry points for rewards/redemptions/goals where supported.

If active payment processing is incomplete, mark as staging-disabled with clear readiness status.

---

## WP22 — API tokens and vibe-coding publish workflow

Implement or migrate native OpenVibe scaffolding for:

* safe token metadata import without raw secrets,
* API token management UI/API shell where current auth supports,
* scopes model,
* `vibe_coding_publish` scope/contract,
* event feed/readiness for publishing coding sessions/events,
* docs link to `openvibe.codes` even if full codes portal is later.

Do not import raw legacy token secrets.

---

## WP23 — Cutover rehearsal, rollback plan, and decommission readiness

Create:

* `scripts/cutover/run-cutover-rehearsal.js`
* `scripts/cutover/verify-cutover.js`
* `docs/openvibe/cutover-runbook.md`

Generate:

* `data/migrations/cutover-report.json`

Cutover rehearsal must check:

* Phase 8 migration artifacts,
* Hobo dependency audit,
* staging load,
* Postgres load if enabled,
* media backfill,
* registry readiness,
* admin readiness,
* staff readiness,
* auth readiness,
* tools portal readiness,
* live product readiness,
* chat product readiness,
* community product readiness,
* media product readiness,
* billing/loyalty readiness,
* Hobo compatibility default-off,
* rollback instructions.

Cutover report must include:

* pre-cutover readiness gates,
* smoke test results,
* DNS rollback notes template,
* previous DNS/TTL fields placeholder,
* compatibility fallback state,
* archive/decommission plan,
* remaining blockers.

Do not actually change DNS or delete production pages.

---

# 8. Testing requirements

Add/update tests for all implemented areas.

Required test files may include:

* `scripts/migrate-hobo/test/hobo-reference-audit.test.js`
* `scripts/migrate-hobo/test/ssh-export.test.js`
* `scripts/migrate-hobo/test/staging-loader.test.js`
* `scripts/migrate-hobo/test/postgres-loader.test.js`
* `scripts/migrate-hobo/test/postgres-validator.test.js`
* `scripts/migrate-hobo/test/media-backfill.test.js`
* `scripts/migrate-hobo/test/hobo-coins-loyalty.test.js`
* `scripts/staging/test/service-readiness.test.js`
* `scripts/cutover/test/cutover-rehearsal.test.js`

Add service tests where existing patterns support them for:

* registry,
* staff/admin,
* themes,
* my-account,
* tools,
* live,
* chat,
* community,
* media.

Tests must cover:

* no destructive production commands,
* SSH command construction and dry-run,
* manifest/checksum generation,
* Hobo reference audit classification,
* canonical bundle coverage,
* Hobo Bucks exclusion,
* Hobo Coins/Nickels loyalty import,
* staging loader idempotency,
* Postgres loader idempotency/mock upserts,
* legacy ID mapping,
* import-hold fallback,
* media hot root with cold provider none,
* missing media diagnostics,
* registry endpoint schema,
* event publish/list smoke,
* staff capability mapping,
* admin audit write,
* theme list/apply smoke,
* tools search/filter,
* live discovery smoke,
* chat room/message smoke,
* community paste/comment smoke,
* cutover/readiness report red/yellow/green logic.

Do not require real SSH in tests.

Do not require real Postgres unless `OPENVIBE_TEST_DATABASE_URL` is configured.

Run:

```bash
npm run check
npm test
```

If unavailable or failing for unrelated reasons, document exact failures and run the smallest equivalent checks.

---

# 9. Documentation requirements

Update/create:

* `README.md`
* `PHASES.md`
* `PLAN.md` or `context/PLAN.md`
* `docs/openvibe/persistence-cutover-plan.md`
* `docs/openvibe/hobo-to-openvibe-data-map.md`
* `docs/openvibe/legacy-billing-migration.md`
* `docs/openvibe/hobo-coins-loyalty-migration.md`
* `docs/openvibe/phase-8.md`
* `docs/openvibe/production-ssh-export.md`
* `docs/openvibe/postgres-loader.md`
* `docs/openvibe/staging-environment.md`
* `docs/openvibe/media-storage-strategy.md`
* `docs/openvibe/media-backfill.md`
* `docs/openvibe/semantic-validation.md`
* `docs/openvibe/runtime-independence.md`
* `docs/openvibe/platform-hub.md`
* `docs/openvibe/admin-staff-model.md`
* `docs/openvibe/openvibe-live-product-readiness.md`
* `docs/openvibe/openvibe-chat-product-readiness.md`
* `docs/openvibe/openvibe-community-product-readiness.md`
* `docs/openvibe/cutover-runbook.md`
* `scripts/migrate-hobo/README.md`

Docs must clearly say:

* Phase 8 is the complete migration and product-readiness milestone.
* Hobo compatibility is opt-in.
* Hobo repos are migration/archive sources.
* OpenVibe-native runtime is default.
* Hobo Bucks are excluded from spendable OpenVibe balances.
* Hobo Coins/Nickels are non-cash loyalty/progression only.
* Hot media storage is local/block storage such as BuyVM slabs.
* Cold storage is Backblaze B2/S3-compatible later.
* Local tests do not require real Backblaze/B2.
* Final production DNS cutover is not performed automatically by scripts.

---

# 10. Environment/config requirements

Update all relevant `.env.example` files.

Add/standardize:

```env
OPENVIBE_ENV=local
OPENVIBE_LEGACY_COMPAT_MODE=false
OPENVIBE_PERSISTENCE_MODE=sqlite
OPENVIBE_DATABASE_URL=
OPENVIBE_STAGING_DATABASE_URL=
OPENVIBE_REDIS_URL=
OPENVIBE_MEDIA_HOT_ROOT=./data/media-hot
OPENVIBE_MEDIA_COLD_PROVIDER=none
OPENVIBE_MEDIA_COLD_S3_ENDPOINT=
OPENVIBE_MEDIA_COLD_S3_BUCKET=
OPENVIBE_MEDIA_COLD_S3_REGION=
OPENVIBE_MEDIA_COLD_S3_ACCESS_KEY_ID=
OPENVIBE_MEDIA_COLD_S3_SECRET_ACCESS_KEY=
OPENVIBE_MEDIA_COLD_S3_FORCE_PATH_STYLE=true
OPENVIBE_ALLOW_STAGING_LOAD=false
OPENVIBE_STAGING_CONFIRM=false
```

Do not include real secrets.

Do not hardcode production credentials.

---

# 11. Required operator workflow

Implement docs/scripts so this workflow works or is accurately documented with current command names.

```bash
# 1. Audit remaining Hobo references
node scripts/migrate-hobo/audit-hobo-references.js \
  --out ./data/migrations/audit

# 2. Dry-run production discovery
node scripts/migrate-hobo/fetch-production-hobo.js \
  --host hobo.tools \
  --dry-run \
  --out ./data/migrations/hobo-production-staging

# 3. Fetch production DB snapshots and media manifests
node scripts/migrate-hobo/fetch-production-hobo.js \
  --host hobo.tools \
  --out ./data/migrations/hobo-production-staging \
  --media-mode metadata-only \
  --confirm

# 4. Export legacy DBs into migration source datasets
node scripts/migrate-hobo/export-hobostreamer.js \
  --out ./data/migrations/hobo-production-staging

node scripts/migrate-hobo/export-hobotools.js \
  --out ./data/migrations/hobo-production-staging

# 5. Build canonical OpenVibe bundle
node scripts/migrate-hobo/import-openvibe.js \
  --source ./data/migrations/hobo-production-staging \
  --out ./data/migrations/hobo-production-staging

# 6. Validate canonical bundle
node scripts/migrate-hobo/validate-migration.js \
  --bundle ./data/migrations/hobo-production-staging/openvibe-target

# 7. Load current staging service stores
node scripts/migrate-hobo/load-staging-openvibe.js \
  --bundle ./data/migrations/hobo-production-staging/openvibe-target \
  --mode sqlite \
  --confirm-load

# 8. Optional canonical Postgres load
node scripts/migrate-hobo/migrate-postgres.js \
  --database-url "$OPENVIBE_STAGING_DATABASE_URL" \
  --apply

node scripts/migrate-hobo/load-postgres.js \
  --bundle ./data/migrations/hobo-production-staging/openvibe-target \
  --database-url "$OPENVIBE_STAGING_DATABASE_URL" \
  --apply

# 9. Media backfill
OPENVIBE_MEDIA_HOT_ROOT=/mnt/openvibe-media-hot \
node scripts/migrate-hobo/backfill-media.js \
  --bundle ./data/migrations/hobo-production-staging/openvibe-target \
  --source ./data/migrations/hobo-production-staging \
  --mode metadata-only

# 10. Full Phase 8 rehearsal
node scripts/migrate-hobo/staging-cutover-rehearsal.js \
  --source ./data/migrations/hobo-production-staging \
  --out ./data/migrations/hobo-production-staging \
  --load-staging \
  --media-mode metadata-only \
  --confirm

# 11. Full cutover verification report
node scripts/cutover/run-cutover-rehearsal.js \
  --source ./data/migrations/hobo-production-staging \
  --out ./data/migrations \
  --confirm
```

If implemented flags differ, update docs to match actual code.

## 11.1 Implementation package order

Work in this order unless repo dependencies require a narrower first slice:

1. Hobo dependency audit and OpenVibe-native default mode.
2. Production fetch and staging rehearsal safety.
3. Staging service hydration.
4. Postgres readiness seam.
5. Media hot/cold storage and backfill.
6. Staging validation and smoke checks.
7. Repository gap matrix and migration coverage reports.
8. Registry API, platform hub, tools portal.
9. Staff model and admin parity.
10. My account and themes surfaces.
11. Live/chat/community/media product readiness.
12. Billing/rewards/token/vibe-coding parity.
13. Final cutover/decommission tooling.
14. Tests/docs/env examples.
15. Final verification and report summary.

Ensure all work has been 100% completed before your final response. Implement the earliest dependency layer first: audit, production fetch, canonical import preservation, staging loader, media backfill, migration coverage, readiness artifacts, env/docs, and tests. Then leave precise runnable commands and exact remaining work.

---

# 12. Required final artifacts

Generate or support generation of:

* `data/migrations/audit/hobo-ref-list.json`
* `data/migrations/audit/hobo-ref-summary.md`
* `data/migrations/audit/migration-coverage.json`
* `data/migrations/hobo-production-staging/production-fetch-report.json`
* `data/migrations/hobo-production-staging/hobostreamer/manifest.json`
* `data/migrations/hobo-production-staging/hobotools/manifest.json`
* `data/migrations/hobo-production-staging/openvibe-target/audit/import-report.json`
* `data/migrations/hobo-production-staging/openvibe-target/audit/validation-summary.json`
* `data/migrations/hobo-production-staging/openvibe-target/audit/staging-load-report.json`
* `data/migrations/hobo-production-staging/openvibe-target/audit/postgres-load-report.json`
* `data/migrations/hobo-production-staging/openvibe-target/audit/media-backfill-report.json`
* `data/migrations/hobo-production-staging/openvibe-target/audit/readiness-report.json`
* `data/migrations/readiness-phase8.json`
* `data/migrations/cutover-report.json`

Reports must include:

* counts by dataset,
* imported rows,
* skipped rows,
* excluded rows,
* unsupported/import-hold rows,
* missing refs,
* missing media,
* Hobo Bucks exclusion confirmation,
* Hobo Coins/Nickels loyalty confirmation,
* service DB load counts,
* Postgres load counts,
* service smoke results,
* product smoke results,
* red/yellow/green gates,
* remaining manual actions.

---

# 13. Acceptance criteria for Phase 8

Phase 8 is complete only when all categories below are satisfied or honestly marked with explicit yellow/red remediation.

## 13.1 Migration/data

* every critical Hobo dataset imported, excluded, or import-held,
* Hobo Bucks excluded from spendable canonical balances,
* Hobo Coins/Nickels migrated as non-cash loyalty/progression,
* legacy ID mapping generated,
* migration runs recorded,
* semantic validation implemented,
* service stores hydrated,
* optional Postgres loader implemented.

## 13.2 Production fetch

* safe SSH fetch exists,
* dry-run works,
* confirmed mode snapshots/copies artifacts safely,
* reports checksums/manifests,
* secrets redacted,
* no destructive production commands.

## 13.3 Media

* hot storage works locally,
* cold storage seam exists,
* B2/S3 placeholders documented,
* media backfill report exists,
* missing media diagnostics surfaced,
* media objects use OpenVibe IDs/storage keys.

## 13.4 Runtime independence

* Hobo compatibility default false,
* default docs do not require live Hobo,
* OpenVibe services boot/read migrated data where implemented,
* Hobo runtime dependencies audited/classified.

## 13.5 Platform hub

* `openvibe.network` is a real native hub,
* `openvibe.tools` is a real registry-backed search/launch portal,
* registry API exists,
* event minimal live update/smoke exists.

## 13.6 Account/theme/admin

* `my.openvibe.network` has native account/preferences surface,
* `themes.openvibe.network` has native theme catalog/apply/preview surface,
* `admin.openvibe.network` has native admin/operator controls,
* staff/capability model exists,
* admin write actions audit.

## 13.7 Product readiness

* `openvibe.live` has native live home/discovery/channel/stream/dashboard/media integration,
* `openvibe.chat` has native chat/DM/TTS/audio/call readiness/product surfaces,
* `openvibe.community` has native pastes/threads/comments/Discord relay readiness/product surfaces,
* `openvibe.media` supports usable media queries/uploads/backfill/storage metadata.

## 13.8 Cutover readiness

* cutover rehearsal script exists,
* cutover report exists,
* rollback/decommission plan documented,
* compatibility can be disabled in staging without breaking OpenVibe-native core flows,
* final production DNS cutover is documented but not executed.

---

# 14. Explicitly do not do these

Do not:

* import Hobo Bucks as spendable OpenVibe credits,
* log secrets,
* commit production artifacts,
* delete production files,
* mutate production databases,
* perform DNS cutover,
* remove legacy repos,
* delete compatibility layer before cutover report says safe,
* do a broad unrelated framework rewrite,
* rename public APIs without migration notes,
* fake readiness,
* silently drop unsupported records.

---

# 15. Final response format

When finished, respond with:

1. Confirmatory analysis summary.
2. Files discovered.
3. Files changed.
4. New scripts created.
5. New docs created/updated.
6. New env variables added.
7. Migration/data coverage implemented.
8. Production SSH export behavior and safety guarantees.
9. PostgreSQL loader behavior.
10. Staging/service-local loader behavior.
11. Media storage/backfill behavior.
12. Hobo Bucks exclusion behavior.
13. Hobo Coins/Nickels loyalty behavior.
14. Runtime independence / Hobo compatibility status.
15. Registry/events/platform hub implementation.
16. Staff/admin implementation.
17. `openvibe.network` / `openvibe.tools` implementation.
18. `my.openvibe.network` / `themes.openvibe.network` implementation.
19. `openvibe.live` implementation.
20. `openvibe.chat` implementation.
21. `openvibe.community` implementation.
22. `openvibe.media` implementation.
23. Billing/loyalty/rewards implementation.
24. Cutover rehearsal implementation.
25. Generated artifact paths.
26. Tests/checks run.
27. Exact commands to run Phase 8.
28. What is green.
29. What remains yellow/red.
30. Remaining edge cases.

Implement the work. Do not output only a plan.
