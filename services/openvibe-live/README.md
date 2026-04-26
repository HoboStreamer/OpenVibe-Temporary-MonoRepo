# openvibe-live

`openvibe.live` — the OpenVibe network's SSR product surface for live channels
and streams. Pages are rendered server-side so search engines and unfurlers
see real `<title>`, `<meta>`, OG tags, canonical URLs, and a meaningful first
paint of channel + stream state.

It maintains a read-model derived from `stream.events` (mirrored from
[openre-stream](../openre-stream)) and exposes:

- `GET /` — channel directory
- `GET /c/:slug` — channel page (live banner + recent streams)
- `GET /c/:slug/s/:streamId` — stream page (embed + metadata)
- `GET /api/v1/channels`, `/api/v1/streams` — JSON for the same data
- `POST /api/v1/channels`, `/api/v1/streams` — service-only upsert
- `POST /api/v1/events/stream` — service-only push from openvibe-events

## Run

```bash
cp services/openvibe-live/.env.example services/openvibe-live/.env
node services/openvibe-live/server/index.js
```

## SSR validation

```bash
curl -s http://127.0.0.1:4600/c/alice | head -n 30
# → must show <title>...</title>, <meta name="description">, <link rel="canonical">,
#   <meta property="og:title">, <meta property="og:url">, twitter:card meta tags.
```

## Mirror flow

1. `openre-stream` emits `stream.started` and `stream.mirrored_to_live` on the
   `stream.events` topic of `openvibe-events`.
2. `openvibe-events` push-delivers to `openvibe-live`'s
   `POST /api/v1/events/stream` callback (the URL set in subscription config).
3. `openvibe-live` upserts the corresponding `live_streams` row and the SSR
   page reflects the new state on the next request.
