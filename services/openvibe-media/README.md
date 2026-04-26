# openvibe-media

Shared OpenVibe media service. Owns:

- the media object model (`media_objects` + derivatives + jobs + quotas + usage + lifecycle audit + legacy map)
- the media namespace registry (via `@openvibe/contracts/media-namespaces`)
- the upload init / complete / get / list / delete / archive / restore HTTP API
- the local-fs storage provider (with an `s3` configuration seam)
- the async processing worker (image-thumbnail, video-thumbnail, vod metadata, clip metadata)
- per-namespace quotas with per-owner overrides
- emission of every `media.*` event onto the `media.events` topic of openvibe-events

Phase 3 of the OpenVibe migration.

## Run locally

```bash
cd /opt/openvibe
npm install                          # workspace install picks this service up
cp services/openvibe-media/.env.example services/openvibe-media/.env
node services/openvibe-media/server/index.js
```

The service expects [openvibe-events](../openvibe-events) to be reachable at
`OPENVIBE_EVENTS_URL` (default `http://127.0.0.1:4400`). When events is offline
the service still works — publish failures are logged but do not break uploads.

## Smoke test

```bash
# 1. init an upload (service actor)
curl -sS -X POST http://127.0.0.1:4500/api/v1/media/upload/init \
  -H 'Content-Type: application/json' \
  -H 'X-Internal-Key: change-me-in-production' \
  -H 'X-OpenVibe-Service: openvibe-live' \
  -d '{"namespace":"live.thumbnails","owner_type":"user","owner_id":"42","type":"thumbnail","mime_type":"image/jpeg"}'

# 2. PUT bytes
curl -sS -X PUT "http://127.0.0.1:4500/api/v1/media/<MEDIA_ID>/upload" \
  -H 'X-Internal-Key: change-me-in-production' \
  -H 'X-OpenVibe-Service: openvibe-live' \
  -F "file=@./some-thumbnail.jpg"

# 3. complete (triggers processing job + emits media.uploaded)
curl -sS -X POST "http://127.0.0.1:4500/api/v1/media/<MEDIA_ID>/upload/complete" \
  -H 'Content-Type: application/json' \
  -H 'X-Internal-Key: change-me-in-production' \
  -H 'X-OpenVibe-Service: openvibe-live' \
  -d '{}'

# 4. read back
curl -sS "http://127.0.0.1:4500/api/v1/media/<MEDIA_ID>"

# 5. fetch the file (visibility-checked)
curl -sS "http://127.0.0.1:4500/files/<MEDIA_ID>" -o /tmp/out.jpg

# 6. list jobs (admin or service actor)
curl -sS "http://127.0.0.1:4500/api/v1/admin/jobs" \
  -H 'X-Internal-Key: change-me-in-production' \
  -H 'X-OpenVibe-Service: openvibe-live'
```

## Storage providers

`STORAGE_PROVIDER=local` (default) writes under `STORAGE_ROOT` (default
`./data/storage`) and serves bytes via `/files/:id` with visibility checks.

`STORAGE_PROVIDER=s3` is a configuration-only seam today: it records
`storage_provider='s3'` and resolves URLs through `S3_PUBLIC_BASE_URL` when
present, but actual byte transfer still uses the local filesystem. This lets
the migration plan call into the right surface without forcing an S3 SDK
dependency on developer machines.

## Compatibility with HoboStreamer

The HoboStreamer compat shim in
[`HoboReposToMigrateFrom/HoboStreamer.com/server/openvibe-bridge/media.js`](../../HoboReposToMigrateFrom/HoboStreamer.com/server/openvibe-bridge/media.js)
forwards new VOD/clip/thumbnail writes to this service when
`OPENVIBE_MEDIA_URL` is set, and falls back to the legacy local DB+files when
it isn't. Existing routes are unchanged.

A non-destructive backfill script
([`scripts/backfill-hobostreamer-media.js`](./scripts/backfill-hobostreamer-media.js))
walks the legacy `vods` / `clips` / `thumbnails` rows and registers them as
media objects without deleting originals.
