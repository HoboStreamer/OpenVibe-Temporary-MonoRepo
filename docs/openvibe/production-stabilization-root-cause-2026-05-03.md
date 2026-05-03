# OpenVibe production stabilization — root-cause note (2026-05-03)

This note captures the first-pass root-cause findings for the current
production stabilization tranche. It is intentionally short and evidence-led
so implementation can stay scoped to the real failures instead of expanding
Phase 16 sideways.

## Confirmed failures

### 1. Home page SSR is doing uncached cross-service fanout

`services/openvibe-live/server/feed-bridge.js` builds the home view model by
calling `mediaClient.listMedia(...)` twice (`live.vods` and `live.clips`) and
`communityClient.list*()` three times on every request. The current code has no
short-lived cache, no timeout wrapper, and asks media for up to 200 items per
request.

**Observed effect:** homepage/server render latency grows with downstream media
and community response time instead of being bounded locally.

### 2. VOD readiness in the live UI is derived from stale metadata, not actual playback viability

`services/openvibe-live/server/feed-bridge.js` currently treats
`record.status === 'ready'` as the truth for `playback_ready`.

That produces two different production failures:

- `media:hobostreamer-vod:959` is marked `ready`, but
  `https://openvibe.media/api/v1/media/media%3Ahobostreamer-vod%3A959/playback?redirect=true`
  returns **HTTP 413** because the stored object is about **2.6 GB**, above the
  public playback size guard.
- `media:hobostreamer-vod:891` is still marked `initialized`, but
  `https://openvibe.media/files/media%3Ahobostreamer-vod%3A891` resolves to a
  signed B2 object and is already fetchable by a browser media request.

**Observed effect:** the UI lies in both directions: some broken VODs are shown
as playable, and some playable VODs are shown as not ready.

### 3. Local asset-origin playback is missing correct video headers

For `media:hobostreamer-vod:939`, the public file route currently returns:

- `Content-Type: application/octet-stream`
- no byte-range handling (`Range` requests still get a full `200` response)

The route implementation in
`services/openvibe-media/server/routes.js` streams the whole file and sets the
content type directly from `media.mime_type`, which is blank for several
migrated HoboStreamer VODs.

**Observed effect:** browsers cannot reliably recognize or seek these VODs, and
the SSR page falls back to a poor native-player experience even when bytes are
present.

### 4. Public session exchange is failing because the network upstream is missing

`https://openvibe.network/api/v1/session/exchange` currently returns **HTTP
502** for both preflight and POST requests. On-host probing shows nothing is
listening on `127.0.0.1:4100`, even though the nginx/public routing expects the
network service there.

Separately, the workspace copy of `packages/openvibe-sdk/package.json` is empty,
which breaks local Node-based boots/tests that import `@openvibe/sdk`.

**Observed effect:** cross-origin session exchange from `openvibe.live` fails,
and local verification/restarts are brittle until the SDK manifest is restored.

### 5. Thumbnail placeholders are mostly a metadata/read-model issue, not a missing-file wave

Sampling recent public `live.vods` / `live.clips` rows shows that almost all of
them still reference thumbnail files that exist under
`/opt/hobostreamer/data/thumbnails`. The dominant failure mode is not missing
thumbnail bytes; it is rows with missing or incomplete thumbnail metadata.

**Observed effect:** some cards still fall back to the placeholder path even
though the migration retained most of the legacy thumbnail files.

## Implementation targets

1. Add short-lived caching/bounded fanout in `openvibe-live` for home SSR.
2. Stop using raw `status === 'ready'` as the sole playback truth signal.
3. Serve local media files with inferred MIME type and real byte-range support.
4. Move the VOD page player to a custom OpenVibe player shell using a viable
   file source instead of the size-gated playback URL alone.
5. Restore `packages/openvibe-sdk/package.json`, then bring
   `openvibe-network` back to a working local/public runtime.
6. Keep readiness honest: oversized or partially repaired playback should be
   reported as such rather than silently marked green.