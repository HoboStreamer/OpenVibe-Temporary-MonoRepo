# Phase 4 — openvibe.live (product) + openre.stream (infra)

Phase 4 splits the streaming surface that lived inside HoboStreamer into two
services with different concerns:

| Service | Domain | Concerns |
|---|---|---|
| `services/openvibe-live` (port 4600) | `openvibe.live` | SSR-indexable channel & stream pages, live read-model, public OG/Twitter card metadata. |
| `services/openre-stream` (port 4700) | `openre.stream` | Stream lifecycle authority, ingest URL registry, restream destinations, mirror state. |

The split lets the public product domain stay light and SEO-friendly while
the infra domain owns the RTMP / WHIP / JSMpeg control plane.

## openre-stream

| Concern | Where |
|---|---|
| Schema (channels, streams, ingest_sessions, restream_destinations, output_state, mirror_state, legacy_id_map) | [services/openre-stream/server/db.js](../../services/openre-stream/server/db.js) |
| Policy seam | [services/openre-stream/server/policy.js](../../services/openre-stream/server/policy.js) |
| Model | [services/openre-stream/server/model.js](../../services/openre-stream/server/model.js) |
| Event publisher (wraps `buildStreamEventPayload(stream, extra)` and merges channel context into `extra`) | [services/openre-stream/server/events.js](../../services/openre-stream/server/events.js) |
| HTTP routes | [services/openre-stream/server/routes.js](../../services/openre-stream/server/routes.js) |

Routes (all writes guarded by `policy.assert`):

* `POST /api/v1/channels`, `GET /api/v1/channels[/:slug]`
* `POST /api/v1/streams` → returns ingest URLs (RTMP/WHIP/JSMpeg) and emits
  `stream.created`.
* `POST /api/v1/streams/:id/start` → emits `stream.started` *and*
  `stream.mirrored_to_live` (records `mirror_state.live_url =
  ${OPENVIBE_LIVE_URL}/c/${slug}`).
* `POST /api/v1/streams/:id/end` → emits `stream.ended`; when body has
  `vod_media_id` also emits `stream.vod.attached`.
* `POST /api/v1/streams/:id/attach-vod`
* `POST /api/v1/ingest/{connected,disconnected}`
* `POST /api/v1/destinations`, `GET /api/v1/destinations`,
  `POST /api/v1/streams/:id/output`
* `GET  /api/v1/legacy/:source/:kind/:id`

## openvibe-live

| Concern | Where |
|---|---|
| Schema (live_channels, live_streams, mirror_state read-model, legacy_id_map) | [services/openvibe-live/server/db.js](../../services/openvibe-live/server/db.js) |
| Read model upserts (COALESCE-based, never destroys data) | [services/openvibe-live/server/model.js](../../services/openvibe-live/server/model.js) |
| SSR (escapes HTML, emits `<title>`, `<meta name=description>`, `<link rel=canonical>`, full og: + twitter: cards) | [services/openvibe-live/server/ssr.js](../../services/openvibe-live/server/ssr.js) |
| Stream-event ingestion (translates `STREAM_EVENT_TYPES.*` envelopes into read-model upserts) | [services/openvibe-live/server/ingestion.js](../../services/openvibe-live/server/ingestion.js) |
| HTTP routes (`/`, `/c/:slug`, `/c/:slug/s/:streamId`, JSON `/api/v1/channels`, `/api/v1/streams`, `/api/v1/events/stream`) | [services/openvibe-live/server/index.js](../../services/openvibe-live/server/index.js) |

`og:type` flips to `video.other` on a channel page when the most-recent
stream is `started`, and the SSR page emits a `LIVE NOW` badge plus an
`<iframe>` at 16/9 for the embed URL. Offline channels render an SEO-clean
shell with `og:type=website` and a "currently offline" description.

## Mirror flow

```
HoboStreamer (or any future ingester)
        │
        │  POST /api/v1/streams      ← openre-stream
        ▼
[stream.created]   ──► openvibe-events (topic stream.events)
        │
        │  POST /api/v1/streams/:id/start
        ▼
[stream.started] + [stream.mirrored_to_live]
        │                                 │
        │                                 └─► openvibe-live read model
        │                                     (channel page goes LIVE)
        │
        ▼
[stream.ended]  + (optional) [stream.vod.attached]
        │
        └─► openvibe-live read model + media.vod_media_id reference
```

`openvibe-live` accepts events two ways:

1. **Push** — `openvibe-events` POSTs to
   `${OPENVIBE_LIVE_URL}/api/v1/events/stream` for every published
   `stream.events` envelope (subscriber config). The endpoint accepts a
   single envelope or `{events:[...]}`.
2. **Direct write** — service-authenticated `POST /api/v1/channels` /
   `/api/v1/streams` for non-event-driven backfill (or HoboStreamer compat).

## HoboStreamer compat

`/opt/hobostreamer/server/openvibe-bridge/stream.js` exports
`upsertChannelSafe`, `createStreamSafe`, `startStreamSafe`,
`endStreamSafe`, `attachVodSafe`. All return `null` and warn on failure;
they are inert when `OPENRE_STREAM_URL` is unset.

## Manual validation (curl)

```bash
H='-H X-Internal-Key:k -H X-OpenVibe-Service:openvibe-live'
curl -sS -X POST http://127.0.0.1:4700/api/v1/channels \
  -H 'Content-Type: application/json' $H \
  -d '{"slug":"alice","owner_user_id":"42","display_name":"Alice"}'
S=$(curl -sS -X POST http://127.0.0.1:4700/api/v1/streams \
  -H 'Content-Type: application/json' $H \
  -d '{"channel_slug":"alice","protocol":"rtmp","title":"speedrun"}')
SID=$(node -e "console.log(JSON.parse(process.argv[1]).stream.id)" "$S")
curl -sS -X POST http://127.0.0.1:4700/api/v1/streams/$SID/start  $H
curl -sS -X POST http://127.0.0.1:4700/api/v1/streams/$SID/end    \
  -H 'Content-Type: application/json' $H \
  -d '{"vod_media_id":"med_..."}'
curl -sS "http://127.0.0.1:4400/api/v1/events?topic=stream.events&limit=10" \
  -H 'X-Internal-Key:k' | jq '.items[].envelope.event_type'
curl -sS http://127.0.0.1:4600/c/alice | grep -E 'og:type|LIVE NOW'
```

Expected event sequence:

```
stream.created
stream.started
stream.mirrored_to_live
stream.ended
stream.vod.attached
```

## Tests

* `services/openre-stream/test/lifecycle.test.js`
* `services/openvibe-live/test/ssr.test.js` — asserts SSR markup invariants
  (`<title>`, `<meta name=description>`, `<link rel=canonical>`, `og:title`,
  `og:url`, `twitter:card`).
</content>
</invoke>