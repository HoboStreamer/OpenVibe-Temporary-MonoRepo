Analyze the #codebase then complete OpenVibe Phase 3 and Phase 4 end-to-end inside the current workspace.

Treat the current workspace as the active OpenVibe migration workspace. Do not fetch external repository URLs. Do not assume old Hobo repos are authoritative long-term destinations. The legacy Hobo repos are migration/reference sources under `HoboReposToMigrateFrom/`; new OpenVibe code should be created or evolved in the current workspace’s OpenVibe structure, following whatever Phase 1 and Phase 2 already established.

Phase definitions for this task:

- Phase 3 = `openvibe.media` shared media platform.
  - Extract and centralize reusable media, VOD, clip, thumbnail, upload, processing, storage-tier, metadata, quota, and media-event foundations.
  - Migrate/bridge existing HoboStreamer media/VOD/clip behavior into this shared service without breaking current routes.
  - Do not leave media as a streaming-only subsystem.

- Phase 4 = `openvibe.live` + `openre.stream`.
  - Split the live streaming product surface from ingest/restream infrastructure.
  - Move stream/channel/viewer-facing OpenVibe product behavior toward `openvibe.live`.
  - Move ingest/restream/routing concerns toward `openre.stream`.
  - Add OpenVibe-branded SSR/indexable stream/channel pages.
  - Preserve compatibility with current HoboStreamer behavior during migration.

Start with confirmatory analysis. Before editing, inspect and summarize the actual current structure produced by Phase 1 and Phase 2.

First inspect these workspace files/directories if present:

- #file:README.md
- #file:PLAN.md
- #file:package.json
- #file:docs
- #file:packages
- #file:services
- #file:apps
- #file:openvibe-network
- #file:openvibe-events
- #file:openvibe-media
- #file:openvibe-live
- #file:openre-stream
- #file:HoboReposToMigrateFrom/HoboStreamer.com/README.md
- #file:HoboReposToMigrateFrom/HoboStreamer.com/docs/broadcasting.md
- #file:HoboReposToMigrateFrom/HoboStreamer.com/server/index.js
- #file:HoboReposToMigrateFrom/HoboStreamer.com/server/config.js
- #file:HoboReposToMigrateFrom/HoboStreamer.com/server/db/schema.sql
- #file:HoboReposToMigrateFrom/HoboApp/README.md
- #file:HoboReposToMigrateFrom/HoboApp/hobo-tools/README.md
- #file:HoboReposToMigrateFrom/HoboApp/hobo-tools/server/index.js
- #file:HoboReposToMigrateFrom/HoboApp/hobo-tools/server/config.js
- #file:HoboReposToMigrateFrom/HoboApp/hobo-tools/server/db/database.js

Then search #codebase for the actual Phase 1/2 implementations and inspect the real files before changing anything:
- event service / event backbone
- user modules / namespace permission APIs
- service registry
- capability registry
- contract registry
- policy engine
- OpenVibe auth/control-plane compatibility layers
- OpenVibe SDK/contracts packages
- OpenVibe admin/my/themes surfaces
- HoboStreamer compatibility config/auth adapters

Do not proceed until you identify the real current locations of those Phase 1/2 modules.

## Required confirmatory analysis output before edits

Briefly report:

1. Where Phase 1 event infrastructure currently lives.
2. Where user modules, service registry, capabilities, contracts, and policy enforcement currently live.
3. Where OpenVibe control-plane/auth/admin/my/themes surfaces currently live.
4. Which existing HoboStreamer files own:
   - VODs
   - clips
   - thumbnails
   - uploads/media requests
   - streaming lifecycle
   - RTMP/WebRTC/WHIP/JSMPEG/broadcast startup
   - restreaming
   - channel/stream page rendering
   - chat/call websocket wiring, only as it affects streaming pages
5. Which current files should remain compatibility adapters only.
6. The exact implementation plan and files to edit/create.

Then implement the code. Do not stop at planning.

---

# Phase 3 implementation requirements: openvibe.media

Implement or complete the shared `openvibe.media` platform in the current workspace.

## 3.1 Media service ownership

Create or complete a dedicated OpenVibe media module/service in the current workspace.

Use the existing Phase 1/2 patterns for:
- DB access
- route registration
- events
- service registry
- policy enforcement
- SDK/contracts
- logging/diagnostics

Do not invent an unrelated framework.

If an `openvibe-media` service already exists, evolve it. If not, create the cleanest service/package/app location that matches the workspace’s current OpenVibe structure.

## 3.2 Media object model

Implement a persisted media object model with safe migrations.

Each media object should support at minimum:

- `id`
- `owner_type`
  - `user`
  - `service`
  - `mod`
  - `system`
- `owner_id`
- `namespace`
- `type`
  - `image`
  - `video`
  - `audio`
  - `file`
  - `vod`
  - `clip`
  - `thumbnail`
  - `attachment`
- `status`
  - `initialized`
  - `uploading`
  - `uploaded`
  - `processing`
  - `ready`
  - `failed`
  - `archived`
  - `deleted`
- `visibility`
  - `public`
  - `private`
  - `restricted`
  - `unlisted`
- `storage_tier`
  - `hot`
  - `warm`
  - `cold`
- `storage_provider`
- `storage_key`
- `public_url`
- `cdn_url`
- `size_bytes`
- `mime_type`
- `sha256` or content hash when practical
- `metadata_json`
- `created_at`
- `updated_at`
- `deleted_at`

Also support derivative/relationship records for:
- thumbnails
- transcoded variants
- waveform/preview assets
- HLS/DASH output later
- clip -> source VOD relationship

## 3.3 Namespaces

Implement or register media namespaces through the Phase 1/2 registry/contract/policy system.

Initial namespaces:

- `live.vods`
- `live.clips`
- `live.thumbnails`
- `live.stream_snapshots`
- `live.media_requests`
- `community.pastes`
- `community.attachments`
- `chat.attachments`
- `chat.tts_audio`
- `user.profile_images`
- `tools.images`
- `games.assets`
- `wiki.assets`
- `blog.assets`
- `mod.*.assets`

Enforce:
- only owner service/mod/system can write to its namespace unless policy allows otherwise
- public reads are filtered through visibility policy
- private/restricted reads require server-side authorization
- clients must not be trusted for namespace ownership

## 3.4 Upload flow

Implement a migration-safe upload flow:

1. `POST /media/upload/init`
   - validates actor/auth
   - validates namespace write permission
   - validates quota
   - creates initialized media object
   - returns upload instructions

2. Direct/local upload handling
   - If no external object storage is configured, support local dev storage using existing project patterns.
   - If S3-compatible env vars exist, support signed URL or clean future seam.
   - Do not require production S3 to run locally.

3. `POST /media/upload/complete`
   - verifies upload status
   - records size/mime/hash when possible
   - moves object to `uploaded` or `processing`
   - creates processing job where applicable
   - emits `media.uploaded`

4. `GET /media/:id`
   - returns filtered metadata
   - enforces visibility/permissions

5. `GET /media`
   - supports namespace/owner/type/status filters
   - enforces permission filtering

6. `DELETE /media/:id` or soft-delete endpoint
   - soft deletes only
   - emits `media.deleted`
   - does not remove physical files unless cleanup job/policy says so

## 3.5 Processing pipeline

Implement an async processing queue/job model using existing event/job patterns.

If Phase 1 event queue is usable, integrate with it. If not, add a local media processing job table/worker abstraction with a clear future path.

Processing jobs should support:

- image thumbnail generation seam
- video thumbnail seam
- VOD metadata extraction seam
- clip metadata seam
- failure status and retry count
- dead/failed job visibility
- diagnostics/logging

Do not overbuild FFmpeg-heavy transcoding if the current workspace does not have the runtime/dependencies fully wired, but create the correct callable seam and migrate existing HoboStreamer FFmpeg/thumbnail behavior where practical.

## 3.6 Quotas and storage governance

Implement media quota foundations.

Support quota records or policy config for:
- owner_type
- owner_id
- namespace
- max_storage_bytes
- max_upload_bytes
- max_file_count
- allowed_mime_prefixes
- allowed_types

Track usage:
- total bytes
- file count
- hot/warm/cold bytes if practical
- updated_at

Enforce quota at upload init and reconcile on upload complete.

Internal platform services like `openvibe-live` may have high/unlimited quotas, but still track usage.

## 3.7 Hot/cold storage model

Implement metadata-level hot/warm/cold support now.

Do not require actual cold object storage provider integration unless already configured.

Add:
- storage tier field
- lifecycle policy structure/config
- admin or internal endpoint for tier changes if practical
- event emission for `media.archived`, `media.restored`, or similar if implemented

## 3.8 Events integration

Publish media events through the Phase 1 event backbone.

Required event types:

- `media.upload.initialized`
- `media.uploaded`
- `media.processing.started`
- `media.processing.completed`
- `media.processing.failed`
- `media.ready`
- `media.deleted`
- `media.archived`
- `media.restored`

Every event must include:
- event_id / trace_id if the event system supports it
- media_id
- namespace
- owner_type
- owner_id
- source service
- version

## 3.9 SDK/contracts integration

Update OpenVibe SDK/contracts packages with:
- media types
- media namespace constants
- upload init/complete helpers
- media metadata types
- media event contracts
- quota types

Use existing package patterns from Phase 1/2.

## 3.10 Legacy HoboStreamer media compatibility

Inspect HoboStreamer VOD/clip/thumbnail/media routes and migrate them to call the OpenVibe media service through an adapter.

Do not delete legacy routes yet.

Instead:
- preserve current public route behavior
- add compatibility wrappers/adapters
- route new writes through `openvibe.media`
- keep fallback reads from old HoboStreamer DB/storage where needed
- document any data that still needs later backfill

Add migration notes for:
- existing VOD rows
- existing clip rows
- existing thumbnail files
- existing media request files
- existing uploaded assets

If safe, add an idempotent backfill script that imports old HoboStreamer media rows into media objects without deleting originals.

---

# Phase 4 implementation requirements: openvibe.live + openre.stream

Implement or complete the split between the live product surface and restream/ingest service.

## 4.1 openvibe.live product surface

Create/evolve `openvibe-live` as the product-facing streaming site.

It should own:
- stream/channel pages
- live viewer pages
- creator-facing live controls that are not pure ingest infrastructure
- SSR/indexable stream/channel pages
- OpenVibe-branded live URLs
- integration widgets for chat/tips/media where applicable

It should not own long-term:
- generic media storage
- generic billing/tips ledger
- generic DMs/calls/TTS queue
- generic restream routing

Those should be external/shared services.

## 4.2 openre.stream ingest/restream service

Create/evolve `openre-stream` as a separate service/module.

It should own:
- ingest endpoint definitions
- RTMP/WHIP/WebRTC ingest routing seams
- restream destination config
- output routing state
- stream mirroring into openvibe.live
- restream lifecycle events
- compatibility adapters for old HoboStreamer restream behavior

It should not own:
- stream page rendering
- generic chat
- generic tips
- generic VOD storage

## 4.3 Stream lifecycle model

Implement a shared stream lifecycle model or adapter using Phase 1 contracts/events.

Required stream events:

- `stream.created`
- `stream.started`
- `stream.ingest.connected`
- `stream.ingest.disconnected`
- `stream.output.started`
- `stream.output.failed`
- `stream.output.stopped`
- `stream.mirrored_to_live`
- `stream.ended`
- `stream.vod.recording.requested`
- `stream.vod.attached`

Each event should include:
- stream_id
- channel_id or creator_id
- source service
- ingest service where relevant
- trace_id if available
- version

## 4.4 Stream/channel data

Inspect the existing HoboStreamer stream/channel/managed_streams schema and route usage.

Add OpenVibe-side stream/channel storage or adapters that:
- preserve old HoboStreamer data
- introduce OpenVibe IDs where needed
- maintain mapping between legacy IDs and OpenVibe IDs
- support future extraction into a standalone `openvibe-live` repo
- avoid destructive schema changes

If HoboStreamer currently stores canonical stream/channel data, do not hard delete or rename it. Add a compatibility mapping/backfill path.

## 4.5 SSR/indexable pages

Implement SSR or server-rendered HTML for OpenVibe live pages.

Minimum pages:
- channel/creator page
- live stream page
- offline stream/channel page
- embed-friendly metadata endpoint or page if current architecture supports it

Requirements:
- initial HTML contains real title/description/channel/stream status
- metadata includes title, description, Open Graph tags, canonical URL
- no empty JS-only shell for important pages
- hydration/client-side scripts may enhance after initial response
- stale SSR state must be corrected by client/realtime status after load

Add canonical handling for:
- old HoboStreamer URLs
- new OpenVibe live URLs
- future redirects

## 4.6 OpenVibe URL/config integration

Wire Phase 4 into the Phase 2 control plane.

Add config/registry keys for:
- openvibe.live public URL
- openvibe.live internal URL
- openre.stream public URL
- openre.stream internal URL
- openvibe.media URL
- events URL
- auth/control plane URL

Preserve legacy HoboStreamer config fallbacks.

## 4.7 Restream mirroring to OpenVibe

Implement the initial mirror flow:

1. user config or service config indicates whether a restream should mirror to OpenVibe Live
2. `openre.stream` emits `stream.started` / ingest events
3. `openvibe.live` creates or updates a live page/state
4. `stream.mirrored_to_live` event is emitted
5. end/disconnect updates state
6. VOD recording request or media attach event is emitted when applicable

Support default-off or config-controlled behavior; do not force all users into mirroring without a config flag.

## 4.8 Media integration

When stream/VOD/clip behavior touches files:
- use `openvibe.media`
- attach media IDs, not raw local paths, to new OpenVibe records
- keep legacy fallback reads where needed
- emit media-related events through the event bus

Do not duplicate media object logic inside `openvibe.live` or `openre.stream`.

## 4.9 Minimal compatibility changes to legacy HoboStreamer

Legacy HoboStreamer code under `HoboReposToMigrateFrom/HoboStreamer.com` should become a source/reference and compatibility adapter.

Do only the minimum legacy edits needed to:
- preserve existing boot
- forward or bridge new OpenVibe media/stream/restream calls
- keep old routes functional
- document migration state

Do not start full Phase 5 chat/community/TTS/DM migration in this task unless a code path is directly required by live page boot or stream fanout.

## 4.10 Admin/diagnostics

Add admin or internal inspection endpoints/UI hooks if consistent with Phase 1/2 patterns:

For media:
- media object lookup
- failed processing jobs
- storage usage/quota
- namespace usage

For live/restream:
- active stream states
- active ingest states
- restream destinations
- mirror status
- recent stream lifecycle events

Keep this lightweight but usable.

---

# Documentation requirements

Update or create docs explaining:

- Phase 3 media architecture
- Phase 4 live/restream architecture
- how legacy HoboStreamer VOD/clip/restream code maps into OpenVibe
- how to run `openvibe.media` locally
- how to run `openvibe.live` locally
- how to run `openre.stream` locally
- required env vars and fallback behavior
- how to validate upload, VOD, clip, stream lifecycle, restream mirror, and SSR pages
- what remains deferred to later phases

Suggested docs if the workspace has a docs folder:
- `docs/openvibe/phase-3-media.md`
- `docs/openvibe/phase-4-live-restream.md`
- `docs/openvibe/migration-map.md`

If docs already exist from Phase 1/2, extend those instead of duplicating.

---

# Tests and checks

Add practical regression coverage.

At minimum:
- media model/API unit or route tests where existing test harness supports it
- permission enforcement tests for media namespace writes
- quota enforcement test
- event emission test or smoke validation
- stream lifecycle event contract test
- live/restream config fallback test
- SSR output smoke test verifying title/meta/content exists in initial HTML

If no test harness exists, add the lightest practical smoke scripts and document manual validation clearly.

Run basic checks:
- package install/build/test commands that are already present
- syntax checks for changed JS/TS
- route boot smoke check if practical

Do not claim tests were run unless you actually run them.

---

# Migration safety rules

- Do not delete data.
- Do not destructively rename tables.
- Do not break old HoboStreamer routes.
- Do not remove Hobo compatibility aliases.
- Do not hardcode production domains where config/registry should be used.
- Do not implement media storage as streaming-only.
- Do not implement restreaming inside the OpenVibe live UI service.
- Do not bypass Phase 1 event/capability/registry/policy primitives.
- Do not store raw file paths in new shared user modules when a media ID should be used.
- Do not trust client-side namespace, quota, permission, or ownership claims.
- Do not perform Phase 5 chat/community/TTS/DM migration here except for minimal compatibility integration.

---

# Optional production inspection block

If local code or migration docs reveal that real production database/media state is required for a safe backfill plan, include this optional section in your final response only; do not run it yourself.

OPTIONAL — requires explicit developer permission to run against production

Production SSH target is configured as `hobo.tools`.

Default mode is inspect-only. Suggested non-destructive commands only:
- inspect service directories
- inspect database schema
- count legacy VOD/clip/media rows
- list media storage directories
- inspect config/env names without printing secrets

Before any remote command:
- summarize the exact command
- require explicit developer confirmation
- remind developer to redact secrets/tokens/IPs before pasting logs back

Do not suggest destructive production commands.

---

# Final response format

When finished, provide:

1. Confirmatory analysis summary.
2. Files changed.
3. What changed in each file/group.
4. Schema/migration changes.
5. Env/config changes.
6. Tests/checks run.
7. Manual validation steps.
8. Legacy compatibility notes.
9. Deferred work for later phases.
10. Explicit statement of how the implementation satisfies Phase 3 and Phase 4.

Implement the code. Do not output only a plan.