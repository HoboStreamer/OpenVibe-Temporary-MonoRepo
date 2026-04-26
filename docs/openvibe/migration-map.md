# HoboStreamer → OpenVibe migration map

This document records the table-by-table mapping from the legacy HoboStreamer
schema (under `/opt/hobostreamer/data/`) to the new OpenVibe services
introduced in Phase 3 + Phase 4. The legacy tables are *not* dropped — the
`legacy_id_map` rows let both worlds coexist while traffic gradually shifts.

## Phase 3 — media

| HoboStreamer table / dir | OpenVibe target | Namespace | Notes |
|---|---|---|---|
| `data/vods/` + `vods.db` | `media_objects` | `live.vods` | One media row per VOD; legacy `vod_id` recorded in `media_legacy_map` (source=`hobostreamer`, kind=`vod`). |
| `data/clips/` + `clips.db` | `media_objects` | `live.clips` | Same pattern; type=`clip`. |
| `data/thumbnails/` | `media_objects` | `live.thumbnails` | type=`thumbnail`; `image_thumbnail` job records the source as a `thumbnail` derivative. |
| `data/media/` (stream snapshots) | `media_objects` | `live.stream_snapshots` | |
| `data/pastes/` | `media_objects` | `community.pastes` | type=`paste`. |
| `data/avatars/` | `media_objects` | `user.profile_images` | type=`profile_image`. |
| `data/emotes/` | `media_objects` | `chat.attachments` | type=`emote`. |

The bridge in
[/opt/hobostreamer/server/openvibe-bridge/media.js](/opt/hobostreamer/server/openvibe-bridge/media.js)
handles the mirror flow when `OPENVIBE_MEDIA_URL` is set.

## Phase 4 — streams

| HoboStreamer surface | OpenVibe target | Notes |
|---|---|---|
| `streaming/` channel registry | `openre-stream.channels` + `openvibe-live.live_channels` | `slug` is the user-visible identifier. |
| `streaming/` live session state | `openre-stream.streams` + `openvibe-live.live_streams` | Authority lives in openre-stream; openvibe-live mirrors via stream events. |
| RTMP/WHIP/JSMpeg endpoints | `openre-stream` ingest URL registry (`config.ingest`) | URLs returned in the `POST /streams` response. |
| Restream targets (`integrations/`) | `openre-stream.restream_destinations` + `output_state` | Per-destination output state and last error. |
| `data/vods/<id>` ↔ stream | `streams.vod_media_id` | Set via `stream.vod.attached` event when a stream ends. |

## Event mapping

| Legacy hook | New event |
|---|---|
| `streaming/onStart` | `stream.started` (also emits `stream.mirrored_to_live`) |
| `streaming/onEnd`   | `stream.ended` (and `stream.vod.attached` when VOD attached) |
| `vod/onUpload`      | `media.uploaded` → `media.processing.completed` → `media.ready` |
| `clips/onCreate`    | `media.upload.initialized` → … → `media.ready` |
| `thumbnails/onSet`  | `media.uploaded` → `media.derivative.created` (image_thumbnail) → `media.ready` |

## Legacy ID lookup

Every mirrored entity records a `legacy_id_map` row keyed by
`(source, kind, legacy_id)` → `new_id`. Lookup endpoints:

* `GET /api/v1/legacy/:source/:kind/:id` on **openvibe-media** (returns the
  `media_id`).
* `GET /api/v1/legacy/:source/:kind/:id` on **openre-stream** (returns the
  `stream_id` or `channel_id`).

This lets HoboStreamer's existing routes resolve a legacy ID and forward
clients to the new SSR URL on `openvibe.live` without breaking bookmarks.

## Cutover plan (post-Phase 4)

1. Run HoboStreamer with `OPENVIBE_MEDIA_URL` + `OPENRE_STREAM_URL` set;
   mirror writes are best-effort and the legacy DB stays authoritative.
2. Backfill historic rows with a one-off script that calls
   `bridge/media.mirrorUpload` and `bridge/stream.upsertChannel +
   createStream + endStream` per legacy row, recording legacy IDs as it goes.
3. Switch read traffic to `openvibe.live` SSR URLs, leaving the legacy
   HoboStreamer pages as 301 redirects via the legacy lookup endpoints.
4. (Future phase) Stop writing to the legacy tables once the mirror has been
   green for the agreed retention window.
</content>
</invoke>