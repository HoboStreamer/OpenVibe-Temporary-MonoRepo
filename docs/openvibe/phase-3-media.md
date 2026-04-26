# Phase 3 — Media platform extraction

This document describes the OpenVibe media service that lifts VOD / clip /
thumbnail / paste / attachment / TTS-audio storage out of the per-app silos
(HoboStreamer, hobo-tools, hobo-text, etc.) into a single namespaced media
catalog.

## Service

`services/openvibe-media` — port `4500`, `@openvibe/media`.

| Concern | Where |
|---|---|
| Config (env, defaults, quota table per namespace) | [services/openvibe-media/server/config.js](../../services/openvibe-media/server/config.js) |
| Schema (media_objects, derivatives, jobs, quotas, usage, lifecycle audit, legacy id map) | [services/openvibe-media/server/db.js](../../services/openvibe-media/server/db.js) |
| Storage providers (local, S3 seam) | [services/openvibe-media/server/storage.js](../../services/openvibe-media/server/storage.js) |
| Policy seam | [services/openvibe-media/server/policy.js](../../services/openvibe-media/server/policy.js) |
| Quotas (per-namespace defaults + overrides + recompute) | [services/openvibe-media/server/quotas.js](../../services/openvibe-media/server/quotas.js) |
| Model (CRUD + lifecycle: ready/archived/restored/deleted, soft delete, tier) | [services/openvibe-media/server/model.js](../../services/openvibe-media/server/model.js) |
| Async jobs (image_thumbnail, video_thumbnail, vod_metadata, clip_metadata) | [services/openvibe-media/server/processing.js](../../services/openvibe-media/server/processing.js) |
| Event publisher | [services/openvibe-media/server/events.js](../../services/openvibe-media/server/events.js) |
| HTTP routes (init, PUT bytes, complete, get, list, archive/restore, delete, quotas, jobs, /files/:id) | [services/openvibe-media/server/routes.js](../../services/openvibe-media/server/routes.js) |

## Namespaces

Defined in [packages/openvibe-contracts/src/media-namespaces.js](../../packages/openvibe-contracts/src/media-namespaces.js):

`live.vods`, `live.clips`, `live.thumbnails`, `live.stream_snapshots`,
`live.media_requests`, `community.pastes`, `community.attachments`,
`chat.attachments`, `chat.tts_audio`, `user.profile_images`, `tools.images`,
`games.assets`, `wiki.assets`, `blog.assets`.

Each has its own default quota row in `config.defaultQuotas` (max file size,
max files, allowed mime types, allowed types, user-writable flag, default
visibility / tier). Per-owner overrides are stored in `media_quotas`.

## Tiers + lifecycle

| Status | Tier | Trigger |
|---|---|---|
| `initialized` | `hot` | `POST /media/upload/init` |
| `uploaded`    | `hot` | `PUT /media/:id/upload` |
| `processing`  | `hot` | `POST /media/:id/upload/complete` (jobs enqueued) |
| `ready`       | `hot` then `warm` | last job completes (worker emits `media.ready`) |
| `archived`    | `cold` | `POST /media/:id/archive` |
| `deleted`     | `cold` | `DELETE /media/:id` (soft delete) |

## Events (topic `media.events`)

* `media.upload.initialized`
* `media.uploaded`
* `media.processing.started` / `completed` / `failed`
* `media.derivative.created`
* `media.ready`
* `media.archived` / `media.restored` / `media.deleted`

Emitted via `events.js` → `EventsClient` → `openvibe-events` `/api/v1/events`.

## Service-to-service auth

Every write requires `X-Internal-Key` + `X-OpenVibe-Service`. The middleware
populates `req.serviceActor` and `policy.assert` consumes the resulting
decision. End-user uploads are also accepted on namespaces flagged
`user_writable=true` when `actor.type='user'` matches the owner.

## HoboStreamer compat

Two opt-in helpers live in HoboStreamer at
`/opt/hobostreamer/server/openvibe-bridge/`:

* `media.js` — `mirrorUploadSafe({namespace, ownerType, ownerId, type,
  mimeType, filePath, legacyId, legacyKind})` mirrors a VOD / clip /
  thumbnail into openvibe-media. Returns `null` (and warns) on failure so the
  legacy local DB write is never blocked.
* `stream.js` — see [phase-4-live-restream.md](phase-4-live-restream.md).

When `OPENVIBE_MEDIA_URL` / `OPENRE_STREAM_URL` are unset, the bridges are
inert and HoboStreamer behaves exactly as before.

## Manual validation (curl)

```bash
H='-H X-Internal-Key:k -H X-OpenVibe-Service:openvibe-live'
INIT=$(curl -sS -X POST http://127.0.0.1:4500/api/v1/media/upload/init \
  -H 'Content-Type: application/json' $H \
  -d '{"namespace":"live.thumbnails","owner_type":"user","owner_id":"42",
       "type":"thumbnail","mime_type":"image/jpeg","size_bytes":12}')
MID=$(node -e "console.log(JSON.parse(process.argv[1]).media.id)" "$INIT")
curl -sS -X PUT  http://127.0.0.1:4500/api/v1/media/$MID/upload $H \
  -F "file=@/tmp/sample.jpg"
curl -sS -X POST http://127.0.0.1:4500/api/v1/media/$MID/upload/complete \
  -H 'Content-Type: application/json' $H -d '{}'
curl -sS http://127.0.0.1:4500/files/$MID -o /tmp/out.jpg
curl -sS "http://127.0.0.1:4400/api/v1/events?topic=media.events&limit=10" \
  -H 'X-Internal-Key:k' | jq '.items[].envelope.event_type'
```

This was executed end-to-end during Phase 3 validation. Expected event log:

```
media.uploaded
media.upload.initialized
media.processing.started
media.derivative.created
media.processing.completed
media.ready          # only when worker drains all jobs for the media id
```

## Tests

`services/openvibe-media/test/model-policy-quota.test.js` — covers create,
quota enforcement, policy decisions for upload/read/delete, soft-delete +
restore. Run with `node scripts/run-tests.js` from the repo root.
</content>
</invoke>