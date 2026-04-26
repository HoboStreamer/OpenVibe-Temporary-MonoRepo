# openre-stream

`openre.stream` — the OpenVibe network's ingest and restream service. Owns:

- channel registration (slug → owner user)
- per-broadcast `streams` records with `created → started → ended` lifecycle
- `ingest_sessions` tracking for transport-level connect/disconnect
- restream destinations and per-destination `output_state` (twitch / youtube / kick / rtmp)
- mirror state into `openvibe.live` (`MIRRORED_TO_LIVE` event)
- legacy id mapping (HoboStreamer streams/vods → openre.stream ids)
- emission of every `stream.*` event onto `stream.events` topic of openvibe-events

Phase 4 of the OpenVibe migration (paired with [openvibe-live](../openvibe-live)).

## Run

```bash
cp services/openre-stream/.env.example services/openre-stream/.env
node services/openre-stream/server/index.js
```

## Smoke test

```bash
KEY='change-me-in-production'

# 1. register a channel
curl -sS -X POST http://127.0.0.1:4700/api/v1/channels \
  -H 'Content-Type: application/json' -H "X-Internal-Key: $KEY" -H 'X-OpenVibe-Service: openvibe-network' \
  -d '{"slug":"alice","owner_user_id":"42","display_name":"Alice"}'

# 2. create a stream → emits stream.created + returns ingest URLs
curl -sS -X POST http://127.0.0.1:4700/api/v1/streams \
  -H 'Content-Type: application/json' -H "X-Internal-Key: $KEY" -H 'X-OpenVibe-Service: openvibe-network' \
  -d '{"channel_slug":"alice","protocol":"rtmp","title":"hello"}'

# 3. start → emits stream.started + stream.mirrored_to_live
curl -sS -X POST http://127.0.0.1:4700/api/v1/streams/<STREAM_ID>/start \
  -H "X-Internal-Key: $KEY" -H 'X-OpenVibe-Service: openvibe-network'

# 4. end (optionally with a media_id from openvibe-media) → emits stream.ended (+ stream.vod.attached)
curl -sS -X POST http://127.0.0.1:4700/api/v1/streams/<STREAM_ID>/end \
  -H 'Content-Type: application/json' -H "X-Internal-Key: $KEY" -H 'X-OpenVibe-Service: openvibe-network' \
  -d '{"vod_media_id":"med_..."}'
```
