# Hobo → OpenVibe migration scaffold

This folder contains the **cutover foundation** for moving durable data out of
`HoboStreamer.com` and `HoboApp/hobo-tools` into the canonical OpenVibe model.

It is intentionally **non-destructive**:
- legacy Hobo databases are opened read-only
- exports are chunked and idempotent
- imports write a canonical OpenVibe **bundle** (NDJSON + manifests + audit)
  instead of mutating the current SQLite service databases directly
- validation produces reconciliation artifacts without deleting or rewriting
  legacy data

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
bundle. That bundle is the stable seam for the later Postgres loader / worker
phase and keeps this slice honest about the end-state architecture.

## Included exports

### HoboStreamer

Durable data is exported from tables including:
- `users`, `linked_accounts`, `channels`, `managed_streams`, `streams`
- `chat_messages`, `comments`, `pastes`, `paste_likes`, `paste_comments`
- `vods`, `clips`, `themes`, `user_themes`, `emotes`
- `subscriptions`, `media_requests`, `media_request_settings`
- `restream_destinations`, `robotstreamer_integrations`, moderation/channel
  config tables, and analytics tables

### hobo-tools

Durable data is exported from tables including:
- `users`, `linked_accounts`, `user_preferences`, `themes`
- `url_registry`, `notifications`, `notification_preferences`
- `anon_users`, `user_effects`, `follows`, `verification_keys`
- sanitized `oauth_clients` metadata (client secret redacted)

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

### 1. Export HoboStreamer

Optional flags:
- `--db <path>` override the legacy SQLite path
- `--out <dir>` output root for export artifacts
- `--legacy-root <dir>` root folder used to resolve local media paths
- `--batch-size <n>` export chunk size
- `--dry-run` count and inspect without writing files

### 2. Export hobo-tools

Same flags as above.

### 3. Build the canonical OpenVibe bundle

Reads the `hobostreamer/` and `hobotools/` export folders and writes
`openvibe-target/` with domain-organized NDJSON datasets plus
`audit/import-report.json`.

### 4. Validate / reconcile

Reads the canonical bundle and writes `audit/validation-summary.json`.
Validation currently checks:
- duplicate IDs in key identity datasets
- user-reference integrity across major datasets
- presence of the required Hobo Bucks exclusions
- import-report structural consistency

## Output layout

```text
<data-dir>/
├── hobostreamer/
│   ├── manifest.json
│   ├── tables/*.ndjson
│   └── diagnostics/missing-media.ndjson
├── hobotools/
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
    ├── billing/*.ndjson
    └── audit/
        ├── import-report.json
        └── validation-summary.json
```

## Safety notes

- Export artifacts may contain **password hashes** from legacy account tables.
  Treat the output directory as sensitive infrastructure data.
- The scripts never print hashes, tokens, or secrets to stdout.
- Fields such as RobotStreamer tokens, restream keys, camera credentials, and
  OAuth client secrets are redacted from the exported bundle.
- Missing media files are reported to diagnostics instead of causing deletes or
  destructive rewrites.
