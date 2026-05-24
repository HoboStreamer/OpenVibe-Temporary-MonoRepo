# OpenVibe Migration Plan

## Status (May 1, 2026)
- PostgreSQL is installed and running on this server.
- `openvibe` role exists.
- `openvibe` and `openvibe_staging` databases exist.
- Redis is installed and running on `127.0.0.1:6379`.
- OpenVibe `.env` has been bootstrapped with `OPENVIBE_PERSISTENCE_MODE=postgres`, `OPENVIBE_DATABASE_URL`, `OPENVIBE_STAGING_DATABASE_URL`, and `OPENVIBE_REDIS_URL`.
- Current free disk is very limited: about `3.1GB` available on `/`.
- Legacy sources are present at `/opt/hobostreamer` (83GB) and `/opt/hobo` (860MB).
- A migration bundle already exists at `data/migrations/hobo-cutover/openvibe-target` (about `155MB`).
- No additional migration `load` or production cutover actions are started in this plan.

## Goal
Migrate durable Hobo legacy data into OpenVibe with a production-safe Postgres+Redis+object-storage target, minimize local disk usage, and keep legacy sources read-only until cutover.

## Constraints
- Only ~3.1GB free on the root filesystem.
- Legacy data volume far exceeds local space.
- Need to preserve old Hobo sources as archived migration input.
- Must not start full migration or cutover actions from this plan.

## High-Level Migration Architecture
1. PostgreSQL for canonical relational truth.
2. Redis for queue/workers/realtime coordination.
3. S3-compatible object storage (Backblaze B2) for media bytes.
4. OpenVibe native services as the eventual public runtime.
5. Legacy Hobo repos remain read-only archives.

## Immediate Preparation Tasks

### 1. Confirm Postgres production readiness
- Ensure `openvibe` and `openvibe_staging` are owned by `openvibe`.
- Verify `OPENVIBE_DATABASE_URL` and `OPENVIBE_STAGING_DATABASE_URL` in `/opt/openvibe/.env`.
- Keep database credentials in `/opt/openvibe/.env.local-secrets` and do not commit them.

### 2. Confirm Redis readiness
- Confirm `redis-server` is active and accepting connections.
- Confirm `OPENVIBE_REDIS_URL=redis://127.0.0.1:6379` is present in `.env`.

### 3. Configure Backblaze B2 object storage
- Obtain Backblaze B2 credentials:
  - bucket name
  - endpoint (e.g. `https://s3.us-west-000.backblazeb2.com`)
  - key ID
  - application key
- Set environment variables in `.env` or production env:
  - `OPENVIBE_MEDIA_COLD_PROVIDER=b2`
  - `OPENVIBE_MEDIA_B2_BUCKET`
  - `OPENVIBE_MEDIA_B2_ENDPOINT`
  - `OPENVIBE_MEDIA_B2_KEY_ID`
  - `OPENVIBE_MEDIA_B2_APPLICATION_KEY`
  - Optionally `OPENVIBE_MEDIA_B2_PUBLIC_BASE_URL`

### 4. Preserve openvibe-native environment defaults
- Keep `OPENVIBE_LEGACY_COMPAT_MODE=false` for native runtime.
- Keep `HOBO_TOOLS_URL`, `HOBO_TOOLS_INTERNAL_URL`, and `HOBO_TOOLS_PUBLIC_KEY` unset unless required for compatibility diagnostics.
- Keep `OPENVIBE_ALLOW_STAGING_LOAD=false` and `OPENVIBE_STAGING_CONFIRM=false` until ready to execute a staging load.

### 5. Nginx / service routing
- Use existing OpenVibe `deploy/nginx` examples as a starting point.
- Proxy service hostnames to local ports:
  - `auth.openvibe.network` → `127.0.0.1:4100`
  - `openvibe.network` / `my.openvibe.network` → `127.0.0.1:4100`
  - `media.openvibe.network` → `127.0.0.1:4500`
  - `live.openvibe.network` → `127.0.0.1:4600`
  - `openre.openvibe.network` → `127.0.0.1:4700`
  - `chat.openvibe.network` → `127.0.0.1:4800`
  - `community.openvibe.network` → `127.0.0.1:4900`
  - `billing.openvibe.network` → `127.0.0.1:5001`
- Do not cut over DNS or redirect legacy domains until after validation.

## Safe Media Migration Strategy
1. Do not copy the full `data/vods`, `data/clips`, or media directories locally until B2 is configured.
2. Use `scripts/migrate-hobo/backfill-media.js` only after object storage is configured and after the canonical bundle is validated.
3. Prefer `--dry-run` first to estimate total bytes and confirm missing legacy files.
4. Keep the local hot-root small and use B2 as the canonical cold tier.
5. Plan to offload large media files directly to B2 instead of retaining them long-term on local disk.

### Direct offload plan for media bytes
- Use `OPENVIBE_MEDIA_COLD_PROVIDER=b2` with `OPENVIBE_MEDIA_B2_*` values.
- Ensure the OpenVibe media service can sign uploads/downloads.
- After import, run `backfill-media.js` to copy legacy media into the hot root and/or B2.
- For production cleanup, keep only metadata locally and rely on B2 for disk-heavy objects.

## Account/Login Migration Plan
1. OpenVibe native auth lives in `services/openvibe-network`.
2. Legacy identity data is already part of the bundle in `openvibe-target/identity/users.ndjson`.
3. Account migration should preserve:
   - usernames
   - emails
   - display names
   - password hashes where available
   - ban state
   - legacy identity links
4. OpenVibe should use the canonical user namespace and map legacy `hobostreamer`/`hobotools` ids into OpenVibe identity rows.
5. Use `load-postgres.js` with the bundle once the environment is fully configured.
6. Do not delete Hobo sources until the final cutover is validated.

## Service Decomposition / Repository Split Planning
1. The current workspace is already arranged as a monorepo with independent packages and services.
2. The long-term target should be split into component repositories:
   - `openvibe-network`
   - `openvibe-media`
   - `openvibe-live`
   - `openre-stream`
   - `openvibe-chat`
   - `openvibe-community`
   - `openvibe-billing`
   - `openvibe-workers`
   - `openvibe-ai`
   - shared packages: `openvibe-sdk`, `openvibe-storage`, `openvibe-persistence`, `openvibe-runtime`, `openvibe-realtime`, `openvibe-observability`, `openvibe-redis`, `openvibe-icons`
3. Keep the migration tooling and docs in a dedicated repo or shared `scripts/migrate-hobo` package.
4. Extract service repos by preserving per-service `package.json`, `server/`, `public/`, and `deploy/` files.
5. Keep shared package contracts in their own repo to avoid cross-service coupling.
6. Future split should preserve the ability to run a local stack from per-service directories, with a lightweight top-level orchestration repo or common scripts.

## Validation and Readiness
1. Validate the bundle with `scripts/migrate-hobo/validate-migration.js` after export.
2. Verify service readiness with `npm run readiness` and `npm run readiness:schema-drift` in `/opt/openvibe`.
3. Confirm no Hobo Bucks canonical balances are imported.
4. Confirm the final canonical import bundle contains identity, chat, community, live, and media metadata.
5. Run `load-staging-openvibe.js --dry-run` before any apply.

## Next Steps (No migration started from this plan)
1. Configure Backblaze B2 and other production secrets.
2. Build or validate Nginx reverse proxy using OpenVibe hostnames.
3. Run `scripts/migrate-hobo/validate-migration.js --source data/migrations/hobo-cutover --bundle data/migrations/hobo-cutover/openvibe-target`.
4. Run `scripts/migrate-hobo/load-postgres.js --bundle data/migrations/hobo-cutover/openvibe-target --apply` when ready.
5. Run `scripts/migrate-hobo/backfill-media.js --bundle data/migrations/hobo-cutover/openvibe-target --hot-root /opt/openvibe/services/openvibe-media/data/storage/hot --legacy-root /opt/hobostreamer` after B2 is configured.
6. Only after validation, cut traffic from legacy `hobostreamer.com` / `hobo.tools` to OpenVibe surfaces.

## Notes
- Because local disk is limited, avoid copying large legacy media artifacts until B2 is configured.
- Preserve `hobo` and `hobostreamer` directories unchanged until full cutover audit is complete.
- This document is the planning artifact; do not perform a full migration until the plan is approved.
