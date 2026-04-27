# OpenVibe persistence + cutover plan

This document is the authoritative plan for the **production persistence target**
and the **hard cutover** from `HoboStreamer.com` + `HoboApp/hobo-tools` into
OpenVibe.

It supersedes older assumptions that long-term federation, service-local
SQLite, or indefinite mirror mode are the intended end state.

## Authoritative decisions

1. **PostgreSQL is the canonical relational store** for durable OpenVibe data.
2. **Redis is the coordination layer** for queues, realtime fanout, cache,
   dedupe windows, worker leases, and short-lived coordination state.
3. **Object storage is the canonical media byte store** for originals,
   derivatives, manifests, and archival tiers.
4. **Async workers are required** for migration replay, reconciliation,
   media processing, notification fanout, and retry-safe downstream effects.
5. The current service-local `better-sqlite3` files in this repo are
   **transitional bootstrap scaffolding for local development**, not the final
   production persistence architecture.
6. Hobo compatibility bridges may remain during transition, but they are
   **transitional aids only**. The end state is a **hard cutover** with legacy
   Hobo domains redirected to OpenVibe surfaces.
7. **Hobo Bucks balances are not migrated.** They are not treated as
   authoritative canonical balances in OpenVibe.

## Production target stack

### PostgreSQL — canonical truth

PostgreSQL owns the durable relational truth for:
- identity and account state
- linked accounts and reserved usernames
- themes, preferences, notifications, and URL registry/control-plane records
- social graph and relationship edges
- live channel and stream metadata
- chat/community durable content metadata
- media metadata and object ownership
- billing ledger, subscriptions, payout eligibility, and reconciliation state
- migration manifests, legacy ID maps, and audit/reconciliation artifacts

### Redis — coordination, not canonical money/data truth

Redis owns short-lived or replay-safe coordination concerns such as:
- queue backlogs and worker leases
- event fanout and subscription coordination
- cache and response hot-path materialization
- transient ingest/presence/realtime routing state
- rate-limit counters and dedupe windows
- migration worker checkpoints for resumable backfills

Redis is not the durable source of truth for account identity, billing ledger,
or media ownership.

### Object storage — canonical media byte store

Object storage owns:
- uploaded originals
- generated thumbnails/derivatives/manifests
- VODs, clips, screenshots, avatars, emotes, and related attachments
- archival tiers and lifecycle-managed restore flows

Media metadata remains relational; media bytes do not stay in service-local
SQLite or local filesystem storage in production.

### Async workers / queue assumptions

Workers are mandatory for:
- export replay and import batching
- idempotent canonical upserts
- media byte backfill into object storage
- thumbnail/transcode/metadata derivation
- notification fanout and digest generation
- billing reconciliation and post-cutover audits
- redirect/canonical-link verification after domain cutover

Every worker consumer must be idempotent. Every mutation path must be safe to
replay.

## What the current repo state means

The services currently checked into this monorepo still instantiate local
SQLite databases directly:

- `services/openvibe-network/server/db.js`
- `services/openvibe-events/server/db.js`
- `services/openvibe-media/server/db.js`
- `services/openvibe-billing/server/db.js`
- `services/openre-stream/server/db.js`
- `services/openvibe-live/server/db.js`
- `services/openvibe-chat/server/db.js`
- `services/openvibe-community/server/db.js`

Those files remain useful for local bring-up and transitional phase work, but
new migration planning must target the canonical Postgres/Redis/object-storage
shape instead of extending SQLite coupling as the end state.

## Hard cutover sequence

### 1. Read-only export from legacy Hobo sources

Run the migration exports against `HoboStreamer.com` and `hobo-tools` in
read-only mode.

Outputs must include:
- row counts
- excluded entity counts
- missing media references
- redacted secret-bearing fields
- deterministic manifests

### 2. Canonical import bundle generation

Build a deterministic OpenVibe bundle organized by domain:
- `identity/`
- `themes/`
- `control-plane/`
- `social/`
- `live/`
- `chat/`
- `community/`
- `media/`
- `billing/`
- `audit/`

This bundle is the stable seam for the later Postgres loader / worker phase.

### 3. Reconciliation

Validate at minimum:
- account merge counts
- linked-account edge counts
- theme/follow/notification counts
- live/channel/stream/content counts
- missing media references
- unresolved user references
- excluded Hobo Bucks artifacts

### 4. Final delta + freeze window

During the production cutover window:
- treat Hobo repos as migration sources only
- capture the final delta export
- replay into the canonical loader
- run reconciliation again
- freeze legacy writes before redirecting traffic

### 5. OpenVibe becomes the public surface

After the cutover audit is green:
- OpenVibe services become the public read/write surfaces
- old Hobo domains return redirects to the corresponding OpenVibe surfaces
- legacy Hobo databases remain archived and read-only for rollback/audit only

## Explicit exclusions

### Not imported into canonical OpenVibe balances

- `HoboStreamer.users.hobo_bucks_balance`
- `HoboStreamer.transactions`
- balance-derived `donation_goals.current_amount`

Legacy Hobo Bucks rows may still be exported for archive/reconciliation, but
OpenVibe does not treat them as canonical ledger truth or wallet carry-over.

### Not bulk-imported because they are ephemeral or secret-bearing

- OAuth codes/tokens
- password reset tokens
- active session tokens
- push subscription registrations
- host-specific site settings with secrets
- bot tokens, API keys, restream keys, RobotStreamer tokens, camera credentials

Those values must be rotated or re-entered explicitly.

## Transitional compatibility stance

Compatibility layers under `compat/` and the existing bridge docs remain useful
for staged migration work, but they are not the target architecture.

The target architecture is:
- migrate durable data out of the Hobo repos
- validate the canonical OpenVibe state
- cut traffic over to OpenVibe
- redirect legacy Hobo domains
- keep old Hobo databases as archived migration sources, not runtime
  dependencies

## Related artifacts

- `docs/openvibe/hobo-to-openvibe-data-map.md`
- `scripts/migrate-hobo/README.md`
- `scripts/migrate-hobo/export-hobostreamer.js`
- `scripts/migrate-hobo/export-hobotools.js`
- `scripts/migrate-hobo/import-openvibe.js`
- `scripts/migrate-hobo/validate-migration.js`
