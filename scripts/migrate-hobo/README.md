# Hobo → OpenVibe migration scaffold

This folder contains the **cutover foundation** for moving durable data out of
`HoboStreamer.com`, `HoboApp/hobo-tools`, and `HoboApp/hobo-quest` into the canonical OpenVibe model,
then hydrating the current SQLite-backed OpenVibe staging services for a
repeatable hard-cutover rehearsal.

It is intentionally **non-destructive**:
- legacy Hobo databases are opened read-only
- exports are chunked and idempotent
- imports write a canonical OpenVibe **bundle** (NDJSON + manifests + audit)
  before a separate staging loader hydrates the current SQLite service stores
- validation produces reconciliation artifacts without deleting or rewriting
  legacy data
- production fetches use SSH plus read-only SQLite snapshots under isolated
  `/tmp/openvibe-migration-*` paths on the remote host, default to **dry-run**,
  and require `--confirm` before any remote snapshot/copy operation executes

## Why the importer writes a bundle instead of the current service DBs

The current OpenVibe runtime still boots from service-local SQLite files as
transitional developer scaffolding. The production target for cutover is:

- **PostgreSQL** for canonical relational data
- **Redis** for realtime coordination, queues, cache, and fanout state
- **object storage** for media bytes and derivatives
- **async workers** for import replay, media backfill, reconciliation, and
  retry-safe downstream writes

Because the canonical Postgres schema is not fully wired into every service
yet, `import-openvibe.js` materializes a deterministic `openvibe-target/`
bundle. For staging rehearsal, `load-staging-openvibe.js` then loads that
bundle into the current SQLite service stores (or service-specific holding
tables when a runtime model is not finished yet). That keeps the migration
slice honest about the end-state architecture while still making the current
staging surfaces testable with real migrated data.

## Included exports

### HoboStreamer

Durable data is exported from tables including:
- `users`, `linked_accounts`, `channels`, `managed_streams`, `streams`
- `chat_messages`, `comments`, `pastes`, `paste_likes`, `paste_comments`
- `vods`, `clips`, `themes`, `user_themes`, `emotes`
- `subscriptions`, `media_requests`, `media_request_settings`
- `coin_transactions`, `coin_rewards`, `coin_redemptions`, `watch_time`
- `restream_destinations`, `robotstreamer_integrations`, moderation/channel
  config tables, and analytics tables

### hobo-tools

Durable data is exported from tables including:
- `users`, `linked_accounts`, `user_preferences`, `themes`
- `url_registry`, `notifications`, `notification_preferences`
- `anon_users`, `user_effects`, `follows`, `verification_keys`
- sanitized `oauth_clients` metadata (client secret redacted)

### HoboQuest

Durable data is exported from tables including:
- `game_world_state`, `game_players`, `game_inventory`, `game_bank`
- `game_structures`, `game_farm_plots`, `game_recipes`, `game_effects`
- `game_battle_stats`, `game_dungeon_runs`, `game_leaderboard`
- `game_fish_collection`, `game_daily_quest_progress`, `game_daily_quest_claims`
- `game_achievements`, `user_cosmetics`, `user_equipped`, `user_tags`,
  `user_equipped_tag`, `tag_guardian_defeats`
- `canvas_settings`, `canvas_tiles`, `canvas_actions`, `canvas_snapshots`,
  `canvas_region_locks`, `canvas_bans`, `canvas_user_overrides`

## Exclusions

Explicit canonical import exclusions include:
- `HoboStreamer.users.hobo_bucks_balance`
- `HoboStreamer.transactions`
- balance-derived `donation_goals`
- secret-bearing keys/tokens and operational-only audit/runtime tables
- ephemeral auth/session artifacts such as OAuth codes, refresh tokens,
  password reset tokens, and active session registries

## Usage

Run from the monorepo root.

### Legacy source root resolution

The export, backfill, and staging-cutover scripts now share the same legacy
source resolver. Unless you pass an explicit `--legacy-root` / `--db`, the
resolver searches in this order:

1. explicit CLI overrides
  - `--legacy-root <dir>`
  - `--db <sqlite-file>`
2. shared root override
  - `--legacy-source-root <dir>`
  - `OPENVIBE_LEGACY_SOURCE_ROOT`
3. per-source env overrides
  - `OPENVIBE_HOBOSTREAMER_ROOT`, `OPENVIBE_HOBOSTREAMER_DB_PATH`
  - `OPENVIBE_HOBOTOOLS_ROOT`, `OPENVIBE_HOBOTOOLS_DB_PATH`
  - `OPENVIBE_HOBOQUEST_ROOT`, `OPENVIBE_HOBOQUEST_DB_PATH`
4. fetched migration artifacts under
  `data/migrations/<bundle>/production-source/<source>`
5. repo-local compatibility checkouts under `HoboReposToMigrateFrom`
6. parent-root layouts such as `/opt/openvibe/HoboStreamer.com` and
  `/opt/openvibe/HoboApp/hobo-tools`

That means a staging rehearsal can still resolve legacy inputs when the fetched
`production-source/*` tree is incomplete, as long as a compatible checkout is
available through one of the fallback locations above.

If your legacy sources are already mounted locally under `/opt/hobostreamer`
and `/opt/hobo`, the resolver will now detect them automatically from the
parent path of the repo. You can also force local-only resolution with:

```bash
OPENVIBE_LEGACY_SOURCE_ROOT=/opt/hobo \
  node scripts/migrate-hobo/export-hobotools.js
```

or for a full local staging rehearsal:

```bash
OPENVIBE_LEGACY_SOURCE_ROOT=/opt/hobo \
  node scripts/migrate-hobo/staging-cutover-rehearsal.js \
  --source ./data/migrations/hobo-production-staging \
  --out ./data/migrations/hobo-production-staging
```

### 1. Export HoboStreamer

Optional flags:
- `--db <path>` override the legacy SQLite path
- `--out <dir>` output root for export artifacts
- `--legacy-source-root <dir>` shared parent/root override used before repo and parent-root fallbacks
- `--legacy-root <dir>` root folder used to resolve local media paths
- `--batch-size <n>` export chunk size
- `--dry-run` count and inspect without writing files

Environment fallbacks:
- `OPENVIBE_LEGACY_SOURCE_ROOT`
- `OPENVIBE_HOBOSTREAMER_ROOT`
- `OPENVIBE_HOBOSTREAMER_DB_PATH`

### 2. Export hobo-tools

Same flags as above.

Source-specific environment fallbacks:
- `OPENVIBE_HOBOTOOLS_ROOT`
- `OPENVIBE_HOBOTOOLS_DB_PATH`

### 3. Export HoboQuest

Same flags as above. The default legacy root resolves to
`HoboReposToMigrateFrom/HoboApp/hobo-quest` and the default SQLite file is
`data/hobo-quest.db`.

Source-specific environment fallbacks:
- `OPENVIBE_HOBOQUEST_ROOT`
- `OPENVIBE_HOBOQUEST_DB_PATH`

### 4. Build the canonical OpenVibe bundle

Reads the `hobostreamer/`, `hobotools/`, and optional `hoboquest/` export
folders and writes
`openvibe-target/` with domain-organized NDJSON datasets plus
`audit/import-report.json`.

The importer also reads `hoboquest/` when present and emits canonical
`games/*` datasets covering native game progression, cosmetics, tags, and the
pixel canvas archive.

### 5. Load the current staging OpenVibe SQLite stores

`load-staging-openvibe.js` reads `openvibe-target/**/*.ndjson` and upserts the
current staging service databases:

- direct runtime tables where the service already has a compatible model
- native games/canvas tables inside `openvibe-games`
- `staging_import_records` holding tables when the runtime model is not ready

The loader is idempotent and writes `openvibe-target/audit/staging-load-report.json`.

### 6. Backfill hot media storage

`backfill-media.js` copies media bytes from the fetched local Hobo artifact root
into the configured hot-storage root and updates `media_objects` metadata. Files
missing from the local staging artifact mirror are diagnostics, not fatal errors.

### 7. Validate / reconcile

Reads the canonical bundle and writes `audit/validation-summary.json`.
Validation currently checks:
- duplicate IDs in key identity datasets
- user-reference integrity across major datasets
- presence of the required Hobo Bucks exclusions
- import-report structural consistency

### 8. Rehearse the full staging cutover

`staging-cutover-rehearsal.js` coordinates:

1. production fetch (optional)
2. Hobo NDJSON export
3. canonical bundle generation (including `games/*` when HoboQuest artifacts are available)
4. bundle validation
5. staging SQLite hydration
6. media hot-storage backfill
7. readiness checks + final report

The readiness runner writes `openvibe-target/audit/readiness-report.json`.

## Staging rehearsal commands

Run from the monorepo root.

### Dry-run remote discovery (default)

`node scripts/migrate-hobo/fetch-production-hobo.js --host hobo.tools`

or explicitly:

`node scripts/migrate-hobo/fetch-production-hobo.js --host hobo.tools --dry-run`

### Fetch production artifacts to the staging workspace

`node scripts/migrate-hobo/fetch-production-hobo.js --host hobo.tools --out ./data/migrations/hobo-production-staging --media-mode metadata-only --confirm`

If your SSH key is passphrase-protected, you can specify `--ssh-key` or let the script discover the key from your `~/.ssh/config`:

`node scripts/migrate-hobo/fetch-production-hobo.js --host hobo.tools --ssh-key ~/.ssh/id_ed25519 --out ./data/migrations/hobo-production-staging --media-mode metadata-only --confirm`

or simply:

`node scripts/migrate-hobo/fetch-production-hobo.js --host hobo.tools --out ./data/migrations/hobo-production-staging --media-mode metadata-only --confirm`

The script will automatically start `ssh-agent` if needed, load the configured key, and prompt for the passphrase once.

When HoboQuest is deployed outside the default paths, pass
`--remote-hoboquest-root` and `--remote-hoboquest-db` so the fetch stage can
copy the quest/canvas snapshot deterministically.

When you want deterministic production-path overrides, place them in JSON and pass
`--production-paths ./scripts/migrate-hobo/production-paths.example.json`. CLI flags
override the JSON file. The fetch report records discovered candidates, selected paths,
db snapshots, config redactions, media manifests, copied artifacts, sizes, checksums,
warnings, and planned/executed commands.

### Full staging rehearsal

`node scripts/migrate-hobo/staging-cutover-rehearsal.js --source ./data/migrations/hobo-production-staging --out ./data/migrations/hobo-production-staging --confirm-load`

Useful override flags:

- `--legacy-source-root <dir>` shared parent directory for fallback legacy
  checkouts when `production-source/*` is absent or incomplete
- `--hobostreamer-root <dir>`, `--hobotools-root <dir>`, `--hoboquest-root <dir>`
  explicit source checkout overrides
- `--hobostreamer-db <file>`, `--hobotools-db <file>`, `--hoboquest-db <file>`
  explicit SQLite overrides
- `--confirm-load` required alongside `OPENVIBE_ALLOW_STAGING_LOAD=true` and
  `OPENVIBE_STAGING_CONFIRM=true` to hydrate staging SQLite stores
- `--provider-name <local|b2|r2|s3>` choose where media backfill writes;
  staging rehearsal remains safest with `local`, while production canonical
  backfill should use `b2`

Example with a parent-root fallback layout:

`node scripts/migrate-hobo/staging-cutover-rehearsal.js --source ./data/migrations/hobo-production-staging --out ./data/migrations/hobo-production-staging --legacy-source-root /opt/openvibe`

### Load an already-built canonical bundle into the current staging DBs

`node scripts/migrate-hobo/load-staging-openvibe.js --bundle ./data/migrations/hobo-production-staging/openvibe-target`

### Backfill hot media storage only

`node scripts/migrate-hobo/backfill-media.js --source ./data/migrations/hobo-production-staging --bundle ./data/migrations/hobo-production-staging/openvibe-target --hot-root ./services/openvibe-media/data/storage/hot`

The migration CLIs auto-load the repo root `.env`, so provider credentials such
as `OPENVIBE_MEDIA_B2_*` and staging gates such as
`OPENVIBE_ALLOW_STAGING_LOAD` / `OPENVIBE_STAGING_CONFIRM` are available
without manually exporting them first. Backfill stays on local storage unless
you explicitly choose a canonical provider, for example:

`node scripts/migrate-hobo/backfill-media.js --source ./data/migrations/hobo-production-staging --bundle ./data/migrations/hobo-production-staging/openvibe-target --provider-name b2`

If the bundle was prepared without a colocated `production-source/hobostreamer`
tree, pass the shared fallback root explicitly:

`node scripts/migrate-hobo/backfill-media.js --source ./data/migrations/hobo-production-staging --bundle ./data/migrations/hobo-production-staging/openvibe-target --legacy-source-root /opt/openvibe --hot-root ./services/openvibe-media/data/storage/hot`

## Output layout

```text
<data-dir>/
├── production-fetch-report.json
├── production-source/
│   ├── hobostreamer/
│   │   └── data/
│   ├── hobotools/
│   │   └── data/
│   └── hoboquest/
│       └── data/
│   ├── hobo-img/
│   │   └── data/
│   ├── hobo-docs/
│   │   └── data/
│   ├── hobo-text/
│   │   └── data/
│   ├── hobo-audio/
│   │   └── data/
│   ├── hobo-maps/
│   │   └── data/
│   ├── hobo-food/
│   │   └── data/
│   └── hobo-yt/
│       └── data/
├── hobostreamer/
│   ├── manifest.json
│   ├── tables/*.ndjson
│   └── diagnostics/missing-media.ndjson
├── hobotools/
│   ├── manifest.json
│   └── tables/*.ndjson
├── hoboquest/
│   ├── manifest.json
│   └── tables/*.ndjson
└── openvibe-target/
    ├── identity/*.ndjson
    ├── themes/*.ndjson
    ├── control-plane/*.ndjson
    ├── social/*.ndjson
    ├── live/*.ndjson
    ├── chat/*.ndjson
    ├── community/*.ndjson
    ├── media/*.ndjson
    ├── games/*.ndjson
    ├── billing/*.ndjson
    ├── loyalty/*.ndjson
    └── audit/
        ├── import-report.json
        ├── validation-summary.json
        ├── staging-load-report.json
        ├── media-backfill-report.json
        └── readiness-report.json
```

## Safety notes

- Export artifacts may contain **password hashes** from legacy account tables.
  Treat the output directory as sensitive infrastructure data.
- The scripts never print hashes, tokens, or secrets to stdout.
- `fetch-production-hobo.js` is **dry-run by default**. Any snapshot/copy run
  requires `--confirm`; otherwise the command will refuse to mutate the staging
  output tree.
- Production fetch skips deployed `.env` files and other secret-bearing config
  by default; manifests record their presence without copying secrets into the
  staging workspace.
- `--cleanup-remote-temp` only removes the exact `/tmp/openvibe-migration-*`
  directory created by the current run.
- Fields such as RobotStreamer tokens, restream keys, camera credentials, and
  OAuth client secrets are redacted from the exported bundle.
- Missing media files are reported to diagnostics instead of causing deletes or
  destructive rewrites.
- `data/migrations/` is gitignored at the repo root so production-derived
  staging artifacts are not committed accidentally.
