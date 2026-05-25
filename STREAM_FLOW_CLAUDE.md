# STREAM_FLOW_CLAUDE.md — Streaming System Reference

_Last updated: 2026-05-25 — full re-audit pass; 4 additional code bugs found and fixed_

---

## Services and ports

| Service | Port | Role |
|---|---:|---|
| `openvibe-live` | 4600 | Public-facing SSR: home, channels, stream pages, go-live page, VODs, clips |
| `openre-stream` | 4700 | Ingest/restream control: channels, stream keys, WHIP/RTMP/WHEP, SFU, recording |
| `openvibe-chat` | 4800 | Chat rooms bound to streams |

`openvibe-live` is the browser-facing product. `openre-stream` is the infrastructure layer that `openvibe-live` proxies through for all stream lifecycle ops.

---

## Databases

### openvibe-live — `live_channels`, `live_streams`, `live_stream_integrations`

**`live_channels`** — mirror of channel records, keyed by `slug`
```
id, slug (UNIQUE), display_name, owner_user_id, description, avatar_url,
metadata_json, created_at, updated_at
```

**`live_streams`** — mirror of stream records for SSR rendering
```
id, channel_slug, channel_id, status (created/started/ended),
title, category, thumbnail_url, embed_url, vod_media_id,
started_at, ended_at, metadata_json, created_at, updated_at
```
- Indexes: `channel_slug`, `status`
- `status = 'started'` AND `started_at > now - 8h` = currently live (enforced in `listLiveNow()`)
- `metadata_json` carries: `viewer_count`, `peak_viewers`, `clip_media_ids`, `clip_count`, `is_live`, `protocol`, `owner_user_id`, `source`

**`live_stream_integrations`** — Phase 16 product wiring (chat-room, tips, vip, audio-overlay, ai-assist)
```
id, owner_kind (channel|stream), owner_ref, channel_slug, target_kind,
target_url, status (delivered|queued_local|unavailable|failed), detail, metadata_json
```

**`mirror_state`** (live) — per-stream mirror timestamp
```
stream_id (PK), channel_slug, mirrored_at, details_json
```

---

### openre-stream — source of truth for all stream lifecycle

**`channels`** — registered streamer channels
```
id, slug (UNIQUE), owner_user_id, display_name, metadata_json
```
Stream key is stored inside `metadata_json.stream_key`.

**`streams`** — per-broadcast records
```
id, channel_id (FK→channels), stream_key, protocol (rtmp/whip),
status (created/started/ended/aborted), title, category,
started_at, ended_at, vod_media_id, metadata_json
```

**`ingest_sessions`** — transport-level ingest connection log
```
id (autoincrement), stream_id (FK), protocol, connected_at, disconnected_at, client_addr, details_json
```

**`restream_destinations`** — outbound restream targets per user
```
id, owner_user_id, kind (twitch|youtube|kick|rtmp), label, target_url, target_key, enabled
```

**`output_state`** — current per-destination output state for active stream
```
stream_id + destination_id (UNIQUE), state (pending/started/failed/stopped), last_error
```

**`recordings`** — HLS recording state per stream
```
id, stream_id (UNIQUE FK), channel_slug, status (recording/completed),
dvr_playlist_url, source_manifest_url, started_at, ended_at, metadata_json
```

**`recording_segments`** — HLS segment index per recording
```
id, recording_id (FK), segment_index, start_ms, duration_ms,
media_id, storage_key, playlist_url
```

**`clip_projects`** — clip creation jobs
```
id, stream_id (FK), owner_user_id, title, status (draft/...), start_ms, end_ms, media_id
```

**`mirror_state`** (openre) — per-stream openvibe.live mirror URL
```
stream_id (PK FK), mirrored_at, live_url, channel_slug, details_json
```

---

## openvibe-live API routes

All under `/api/v1/`. Auth-required routes use `requireOpenVibeAuth`. Service-internal routes use `serviceActorMiddleware` (INTERNAL_API_KEY header).

### Public read-only
| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/home` | Feed bridge home view model |
| GET | `/api/v1/channels` | List channels (limit) |
| GET | `/api/v1/channels/:slug` | Channel detail + stats + media |
| GET | `/api/v1/featured-channels` | Top 12 featured channels |
| GET | `/api/v1/categories` | Top 24 categories by stream count |
| GET | `/api/v1/streams` | List streams; `?status=live` returns live only |
| GET | `/api/v1/streams/recently-ended` | Recent ended streams |
| GET | `/api/v1/streams/:id` | Single stream |
| GET | `/api/v1/streams/:id/timeline` | Stream timeline (markers, VOD, clips) |
| GET | `/api/v1/streams/:id/integrations` | Phase 16 integration URLs descriptor |
| GET | `/api/v1/channels/:slug/integrations` | Phase 16 channel integrations |
| GET | `/api/v1/vods` | List VODs |
| GET | `/api/v1/clips` | List clips |
| GET | `/api/v1/updates` | GitHub release notes (cached 30min) |

### Auth-required go-live endpoints
| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/go-live/dashboard` | Stream manager state (channels + destinations + streams + URLs) |
| POST | `/api/v1/go-live/channels` | Create channel on openre-stream + sync to live |
| PATCH | `/api/v1/go-live/channels/:slug` | Update channel settings |
| POST | `/api/v1/go-live/channels/:slug/regenerate-key` | Regenerate stream key |
| POST | `/api/v1/go-live/destinations` | Create restream destination |
| DELETE | `/api/v1/go-live/destinations/:id` | Delete destination |
| POST | `/api/v1/go-live/streams` | Create stream on openre-stream + sync |
| POST | `/api/v1/go-live/streams/:id/start` | Start stream + record mirror |
| POST | `/api/v1/go-live/streams/:id/end` | End stream |

### Service-internal (INTERNAL_API_KEY)
| Method | Path | Description |
|---|---|---|
| POST | `/api/v1/channels` | Direct channel upsert (service actor only) |
| POST | `/api/v1/streams` | Direct stream upsert (service actor only) |
| POST | `/api/v1/events/stream` | Stream event push from openvibe-events |
| POST | `/api/v1/streams/:id/integrations/ensure` | Ensure a Phase 16 integration |
| POST | `/api/v1/channels/:slug/integrations/ensure` | Same, channel-scoped |

### Phase 16 integrations summary
| Method | Path |
|---|---|
| GET | `/api/v1/integrations/product/status` |

### Thumbnail/asset routes
- `GET /api/thumbnails/:fileName` — serves from `data/thumbnails/`, falls back to SVG placeholder
- `GET /api/community-assets/:fileName` — bridges community paste images

---

## openre-stream API routes

All under `/api/v1/`. Protected by `serviceActorMiddleware` (same INTERNAL_API_KEY gate).

### Channels
| Method | Path | Notes |
|---|---|---|
| POST | `/channels` | Create/upsert channel |
| GET | `/channels` | List channels (`?owner_user_id=`) |
| GET | `/channels/:slug` | Get channel |
| PATCH | `/channels/:slug` | Update channel fields |
| POST | `/channels/:slug/regenerate-key` | New stream key |

Channel list response includes computed `stream_key`, `rtmp_url`, `whip_url`.

### Streams
| Method | Path | Notes |
|---|---|---|
| POST | `/streams` | Create stream — response includes `ingest.rtmp`, `ingest.whip`, `ingest.jsmpeg` URLs |
| POST | `/streams/:id/start` | Start stream; auto-records mirror to openvibe.live |
| POST | `/streams/:id/end` | End stream; optional `vod_media_id` in body |
| POST | `/streams/:id/attach-vod` | Attach VOD after end |
| GET | `/streams` | List streams (`?channel_id=`, `?status=`) |
| GET | `/streams/:id` | Stream + mirror state |
| GET | `/streams/:id/outputs` | Destination output states |
| POST | `/streams/:id/output` | Set output state for a destination |
| POST | `/streams/:id/recordings` | Upsert recording record |
| POST | `/streams/:id/segments` | Upsert HLS segment |
| GET | `/streams/:id/timeline` | Stream + recording + segments + clips |
| GET | `/streams/:id/clips` | List clips for stream |
| POST | `/clips` | Create clip project |

### Restream destinations
| Method | Path |
|---|---|
| POST | `/destinations` |
| PUT | `/destinations/:id` |
| DELETE | `/destinations/:id` |
| GET | `/destinations` |

### Ingest webhooks (called by ingest edge)
| Method | Path | Notes |
|---|---|---|
| POST | `/ingest/connected` | Records ingest session; auto-starts HLS recording if `channel.metadata.recording_enabled` |
| POST | `/ingest/disconnected` | Records disconnect; stops recording, emits event |

### Recording management
| Method | Path |
|---|---|
| GET | `/recordings/active` | List active in-memory recordings |

### Session + legacy
| Method | Path |
|---|---|
| GET | `/session` | Auth session state |
| GET | `/legacy/:source/:kind/:legacyId` | Map legacy ID to new ID |

---

## WHIP/WHEP endpoints (direct on openre-stream, no `/api/v1` prefix)

### WHIP (ingest — streamer → SFU)
| Method | Path | Notes |
|---|---|---|
| POST | `/whip/:channelSlug` | SDP offer; auth via `?key=` or `Authorization: Bearer <stream_key>` |
| PATCH | `/whip/:channelSlug/:resourceId` | Trickle ICE (accepted, no-op) |
| DELETE | `/whip/:channelSlug/:resourceId` | Terminate session |
| OPTIONS | `/whip/:channelSlug` | CORS preflight (for OBS) |

### WHEP (viewer egress — SFU → viewer)
| Method | Path | Notes |
|---|---|---|
| POST | `/whep/:channelSlug` | SDP offer from viewer; returns SDP answer with consumer params |
| DELETE | `/whep/:channelSlug/:resourceId` | End viewer session |
| OPTIONS | `/whep/:channelSlug` | CORS preflight |

### Viewer count
| Method | Path |
|---|---|
| GET | `/viewer-count/:channelSlug` | Returns `{ viewer_count }` from SFU room |

### Broadcast WebSocket
`ws://openre.stream/ws/broadcast` — alternative viewer signaling path (see section below).

---

## Go-live widget (openvibe.network topbar)

`golive-widget.js` is loaded on `openvibe.network` pages via a dedicated cross-origin script tag:
```html
<!-- served from openvibe-live with Access-Control-Allow-Origin: * -->
<script src="{live_base}/assets/golive-widget.js"></script>
```

The widget injects a broadcast button into the network topbar — inserted before `#ov-theme-btn-wrap`, or into `.ov-nav-end`. If the nav is rendered dynamically by openvibe.js, a `MutationObserver` waits for the anchor element before injecting.

**Widget UI state machine**:
- **Idle**: broadcast icon button; click opens panel with Camera / Share screen / Manage stream options
- **Live**: icon pulses red; panel shows red "Live" row + End button; Camera/Screen options hidden
- `beforeunload` warning added while live to prevent accidental page leave

**Widget broadcast flow**:
```
1. User clicks Camera or Share screen
2. getOrCreateChannel():
   → GET {live}/api/v1/go-live/dashboard  (Bearer from sessionStorage 'openvibe.bridge.token')
   → if no channels: POST {live}/api/v1/go-live/channels
   → returns { slug, streamKey, restreamUrl, iceServers }

3. getUserMedia / getDisplayMedia
   (screen+mic: AudioContext merges screen audio + mic into combined stream)

4. POST {live}/api/v1/go-live/streams  { channel_slug, protocol:'whip', title, recording_enabled:true }
   → creates a stream session so the broadcast appears in discovery feed
   → stores activeStreamId

5. startWhip(stream, restreamUrl, slug, streamKey, iceServers):
   → new RTCPeerConnection({ iceServers: iceServers || [stun:stun.l.google.com:19302] })
   → addTrack() all tracks
   → createOffer → setLocalDescription → wait ICE gather (3s max fallback)
   → POST {restreamUrl}/whip/{slug}  Authorization: Bearer {streamKey}
   → setRemoteDescription(answer)

6. On success:
   → setLiveUI(true) — button pulses red
   → "Manage stream" link → {live}/@{slug}  (channel page)
   → track.ended listener → auto-end if user stops screen share from browser UI

7. User clicks End:
   → pc.close(), tracks.stop()
   → POST {live}/api/v1/go-live/streams/{activeStreamId}/end  (ends stream session)
   → setLiveUI(false)
   → "Manage stream" link → {live}/go-live
```

**Auth**: uses `sessionStorage['openvibe.bridge.token']` (the bridge JWT set by openvibe.js after login). Passed as `Authorization: Bearer` on the dashboard API call. The WHIP connection itself uses the stream key as the Bearer token — no user JWT involved.

**Session lifecycle**: The widget now creates a full stream session (step 4) and ends it (step 7), so widget broadcasts appear in the discovery feed and stream history like any other broadcast. ICE servers are sourced from the dashboard response, not hardcoded — TURN is available if `TURN_URL`/`TURN_USERNAME`/`TURN_CREDENTIAL` are set in openvibe-live env.

---

## Go-live page (`/go-live` on openvibe-live)

Rendered by `ssr-golive.js → renderGoLivePage({ baseUrl, session })`.

**Unauthenticated state**: Shows a marketing hero with three method cards (Browser, OBS/WHIP, RTMP) and two CTAs — "Sign in to get started" and "Stream on openre.stream". No stream manager HTML rendered; `stream-manager.js` is NOT loaded.

**Authenticated state**: Full stream manager UI rendered. `stream-manager.js?v=20260524-3` loaded at bottom of body.

**Stream manager layout** (2-column grid, 260px sidebar + flex main):
- **Left sidebar**: `[data-sm-slots]` channel list + `[data-sm-dest-list]` destination list + `+` button to create channel
- **Right panel**: 4 sub-tabs per channel slot:
  - **Stream tab** — title, category, NSFW toggle, method picker (Browser / WHIP / RTMP / CLI), inline endpoint panel, inline browser broadcast panel, Create stream / Go Live / End stream buttons
  - **Settings tab** — display name, description, visibility, recording_enabled, chat_enabled, NSFW, preferred method, stream key (show/hide/copy/regenerate)
  - **Live tab** — WHEP preview video + live timer + viewer count + End stream / Watch page; right panel: live chat with send form
  - **History tab** — recent streams list with Force End button for stuck streams
  - **Restream tab** — destination list + Add destination form with presets (Kick, Twitch, YouTube, RobotStreamer, Custom)

**Method cards**: Browser, WHIP (default active), RTMP, CLI/FFmpeg. Selecting a card updates `state.activeProtocol` and the hidden `[name="protocol"]` input.

**Inline browser broadcast panel** (`#sm-inline-broadcast`, shown only when Browser method active):
- Source picker: Camera / Screen / Screen+Cam (PiP)
- Device selectors: camera, microphone
- Quality: resolution (360p–1080p) + FPS (24/30/60)
- `<video id="sm-bcast-preview">` preview before going live
- Start Broadcast → Go Live flow (requires stream to be created first)
- Live controls: Cam On/Off, Mic On/Off, End Broadcast

**Inline endpoint panel** (`#sm-inline-endpoint`, shown for WHIP/RTMP/CLI):
- WHIP: shows WHIP URL + stream key + copy buttons
- RTMP: shows RTMP URL + stream key
- CLI: shows FFmpeg commands for various sources

---

## openre-client.js (live → openre proxy)

`createOpenReClient({ config })` wraps all live→openre HTTP calls. Base URL = `config.stream.url`. All requests include `X-OpenVibe-Service: openvibe-live` header. User JWT forwarded as `Authorization: Bearer {token}`.

| Method | What it calls on openre |
|---|---|
| `listChannels` | `GET /api/v1/channels?owner_user_id=&limit=` |
| `createChannel` | `POST /api/v1/channels` |
| `listDestinations` | `GET /api/v1/destinations?owner_user_id=` |
| `createDestination` | `POST /api/v1/destinations` |
| `listStreams` | `GET /api/v1/streams?channel_id=&status=&limit=` |
| `createStream` | `POST /api/v1/streams` |
| `startStream` | `POST /api/v1/streams/:id/start` |
| `endStream` | `POST /api/v1/streams/:id/end` |
| `updateChannel` | `PATCH /api/v1/channels/:slug` |
| `regenerateStreamKey` | `POST /api/v1/channels/:slug/regenerate-key` |
| `deleteDestination` | `DELETE /api/v1/destinations/:id` |
| `updateDestination` | `PUT /api/v1/destinations/:id` |

---

## openre.stream dashboard (`/dashboard` on openre-stream)

Separate product dashboard at `openre.stream/dashboard`. Auth-gated (redirects to `renderDashboardAuthGate` if no `req.user`).

SSR in `openre-stream/server/ssr.js` embeds `window.__DASH_DATA__ = { channels, destinations, streams, ingestConfig, user }` into the page. `dashboard.js` reads this and renders the two-panel UI client-side.

**Dashboard features** (via `dashboard.js`):
- Same two-panel layout as go-live (channel slots sidebar + right editor)
- Channel management: create, edit display name/description, copy stream key, regenerate key
- Stream creation + start/end lifecycle
- Ingest endpoint display: RTMP URL + stream key, WHIP URL + stream key
- Restream destinations: add/edit/delete with Kick/Twitch/YouTube/RobotStreamer presets
- Output state tracking per destination (pending/started/failed/stopped)
- Browser broadcast via WHIP (same RTCPeerConnection/WHIP flow as go-live page)
- Stream history panel

**Key difference from go-live page**: openre.stream dashboard talks directly to its own `/api/v1/` routes (same-origin, `credentials: 'same-origin'`). The go-live page on openvibe.live talks to `/api/v1/go-live/*` which proxies to openre via `openre-client.js`.

---

## Go-live broadcast flow (browser WHIP)

```
1. User opens openvibe.live/go-live
   → ssr-golive.js renders the page (SSR, no auth required for shell)
   → page loads /js/stream-manager.js
   → stream-manager.js calls GET /api/v1/go-live/dashboard (requireUserAuth)
   → response: { channels, destinations, streams, restream_url, account_url, chat_url }

2. User clicks "New channel" (if none exists)
   → stream-manager.js auto-creates via POST /api/v1/go-live/channels
   → live proxies to openre POST /channels → returns { channel }
   → live calls syncLiveChannel() → upserts into live_channels

3. User clicks "Create stream" → stream-manager.js sends POST /api/v1/go-live/streams
   → body: { channel_slug, title, category, protocol: 'whip' }
   → live proxies to openre POST /streams
   → openre creates streams record, publishes STREAM_EVENT_TYPES.CREATED
   → response includes ingest.whip URL
   → live calls syncLiveStream() → upserts into live_streams (status=created)

4. User clicks "Start broadcast" (WHIP path)
   → stream-manager.js calls getUserMedia/getDisplayMedia
   → new RTCPeerConnection({ iceServers: state.iceServers })  ← TURN included if configured
   → addTrack() for each media track
   → createOffer() → setLocalDescription() → wait for ICE gather
   → POST {openre}/whip/{channelSlug}?key={streamKey}  with SDP offer body
   → openre whip.js handleOffer():
       * validates stream key against channel.metadata.stream_key
       * finds stream with status='started' OR 'created' (widget pre-creates with 'created')
       * if not found: auto-creates new stream
       * if not already started: model.startStream(), fires stream.started to openvibe-live
       * creates mediasoup WebRTC transport (sfu.createTransport)
       * connects transport with DTLS from offer
       * creates producers for each media section (sfu.produce)
       * room ID = 'channel-{channelSlug}'
       * returns 201 SDP answer + Location header
   → stream-manager.js setRemoteDescription(answer) → ICE → media flows

5. User clicks "Start stream" button in stream-manager
   → POST /api/v1/go-live/streams/:id/start
   → live proxies to openre POST /streams/:id/start
   → openre: model.startStream(id), publishes STARTED + MIRRORED_TO_LIVE events via event bus
   → live: syncLiveStream() updates status=started in live_streams
   → live: model.recordMirror() for channel → live_url
   Note: if WHIP connected first (step 4), stream is already started. This call is idempotent.

6. Stream is live
   → live tab in stream-manager shows WHEP preview (calls startWhepPreview with state.iceServers)
   → chat polling starts every 4 seconds via state.chatUrl

7. User clicks "End stream"
   → POST /api/v1/go-live/streams/:id/end
   → stream-manager also sends DELETE {whipLocation} to terminate WHIP session
   → openre whip.js cleanupSession(): model.endStream(), fires stream.ended to openvibe-live, sfu.closeRoom()
   → sfu room-closed event → broadcast-ws sends { type: 'stream-ended' } to all viewers
   → live: syncLiveStream() status=ended
```

---

## Go-live broadcast flow (OBS / RTMP)

```
1-3. Same as above (dashboard load, channel creation, stream creation)

4. User copies rtmp_url + stream_key from stream-manager UI
   → Pastes into OBS → Settings → Stream → Custom
   → OBS connects to rtmp://ingest.openre.stream/live/{channelSlug}?key={streamKey}

5. openre-stream rtmp-server.js receives RTMP connection
   → validates stream key against channel.metadata.stream_key
   → finds or auto-creates stream, calls model.startStream() if not started
   → calls model.recordIngestConnected() to persist session in ingest_sessions
   → fires stream.started directly to openvibe-live POST /api/v1/events/stream

6. Stream is visible in feed immediately — no separate "Start stream" click needed for RTMP

7. On OBS disconnect: rtmp-server.js calls model.recordIngestDisconnected(), model.endStream()
   → fires stream.ended directly to openvibe-live POST /api/v1/events/stream
```

---

## SFU internals (mediasoup)

**Config** (`openre-stream/server/config.js`):
- `listenIp`: `0.0.0.0`
- `announcedIp`: `MEDIASOUP_ANNOUNCED_IP` env var, default `40.160.240.222`
- Port range: `12000–12300` (UDP, must be open on VPS firewall)
- Codecs: `audio/opus` (48kHz stereo), `video/VP8`, `video/H264` (profile 42e01f)

**Room structure** (in-memory, keyed by `channel-{channelSlug}`):
```
room = {
  router,          // mediasoup Router — holds RTP capabilities and codec config
  producers: Map,  // producerId → { producer, peerId, transportId }
  consumers: Map,  // consumerId → { consumer, peerId }
  transports: Map, // '{peerId}-{transportId}' → transport
}
```

**Lifecycle**:
- Room created on first `createTransport` call (lazy, via `getOrCreateRoom`)
- WHIP session: one transport + 1–2 producers (video + audio)
- WHEP session: one transport + 1 consumer per active producer
- `sfu.getProducers(roomId)` — returns non-closed producers; empty = no live stream
- `sfu.getViewerCount(roomId)` — unique peerId count in consumers map
- Worker death → auto-restart after 2s, all rooms cleared
- Room close: closes all transports + router, emits `room-closed`

**Key invariant**: Room ID must be `channel-{channelSlug}` everywhere — WHIP, WHEP, broadcast-ws all use this key. If they diverge, producers are invisible to consumers.

---

## WHEP viewer flow

```
Viewer opens openvibe.live/@{slug}/s/{streamId}
→ SSR renders renderStreamPage:
    - if stream.status === 'started': renders <video id="sp-live-video"> + inline WHEP JS
    - if stream.status !== 'started': renders thumbnail + play-button overlay
→ SSR injects: RESTREAM_URL, CHANNEL_SLUG, ICE_SERVERS (from buildIceServers()), IS_LIVE
→ Inline JS (ssr.js extraScripts) calls initViewer():
    - new RTCPeerConnection({ iceServers: ICE_SERVERS })   ← config-driven; includes TURN if set
    - addTransceiver('video', {direction:'recvonly'})
    - addTransceiver('audio', {direction:'recvonly'})
    - ontrack → video.srcObject = e.streams[0]
    - createOffer() → setLocalDescription() → wait ICE gather (5s max)
    - POST {restreamUrl}/whep/{channelSlug} with SDP offer
→ openre whip.js handleWhepOffer():
    - sfu.getProducers(roomId) — fails 404 if no producers
    - createTransport for viewer peerId
    - connect transport with DTLS from viewer offer
    - for each producer: sfu.consume() using viewer's extractRtpCapabilities
    - builds SDP answer (sendonly, consumer RTP params)
    - returns 201 + SDP answer + Location header
→ viewer setRemoteDescription(answer) → ICE → media flows from SFU
→ on failure: auto-retries after 5 seconds (beforeunload sends DELETE to WHEP resource URL)
→ viewer count polling: every 10s GET {restreamUrl}/viewer-count/{slug} → updates #sp-viewer-count
```

**Stream owner on stream page**:
When `channel.owner_user_id === viewerUserId` (checked in `renderStreamRoute`):
- Server auto-enrolls user as `role: 'owner'` in the stream's chat room via `chatModel.upsertParticipant`
- SSR injects `var IS_OWNER = true` into page JS
- Mod buttons (Del, 5m, 30m, 1h, Ban) appear on hover over each chat message

---

## Broadcast WebSocket viewer path (alternative to WHEP)

`ws://openre.stream/ws/broadcast` — WebSocket-based signaling for viewers.

This is an alternative viewer path. The watch page uses WHEP (direct HTTP). The broadcast-ws path is available for clients that prefer WebSocket signaling.

**Message flow**:
```
client → { type: 'join', channelSlug }
server → { type: 'router-capabilities', rtpCapabilities }
server → { type: 'producers-available', producers: [{id, kind}] }  (if any active)
client → { type: 'create-transport' }
server → { type: 'transport-created', id, iceParameters, iceCandidates, dtlsParameters }
client → { type: 'connect-transport', transportId, dtlsParameters }
server → { type: 'transport-connected', transportId }
client → { type: 'consume', transportId, producerId, rtpCapabilities }
server → { type: 'consumed', id, producerId, kind, rtpParameters }
```

**Push events from server**:
- `{ type: 'producers-available' }` — new producer appeared (SFU `producer-added` event)
- `{ type: 'stream-ended' }` — room closed (SFU `room-closed` event)

---

## Channel/stream sync: openre-stream → openvibe-live

Two paths keep live_channels and live_streams in sync:

**Path 1 — Direct proxy response** (normal go-live flow):
After every openre API call from live (`createChannel`, `createStream`, `startStream`, `endStream`), live calls `syncLiveChannel()` and/or `syncLiveStream()` on the response, immediately upsetting the local DB.

**Path 2 — Event push** (openre → live, async):
When openre publishes stream events (CREATED, STARTED, ENDED, MIRRORED_TO_LIVE, VOD_ATTACHED), the openvibe-events bus pushes them to live via `POST /api/v1/events/stream` (service-actor authenticated). `applyStreamEvent()` in `ingestion.js` handles each event type and calls the same model upsert functions.

**`sweepHungStreams()`** — runs at `buildApp()` time in openvibe-live. Sets any `status='started'` streams to `ended`. Prevents ghost-live entries surviving a server restart.

---

## Chat integration on stream pages

**Watch page** (`ssr.js` `renderStreamPage`):
- `CHAT_BASE` = `LIVE_NETWORK_URLS.chat` (resolved from SDK url-defaults at SSR time)
- `STREAM_ID` = the stream's numeric/text id
- Chat polls `GET {CHAT_BASE}/api/chat/stream/{STREAM_ID}/history?limit=60` every 3 seconds
- Chat sends `POST {CHAT_BASE}/api/chat/stream/{STREAM_ID}/send` with `{ body, room_title, metadata: { sender_name } }`
- Response format: `{ items: Message[] }`

**Live tab** (stream-manager.js):
- `state.chatUrl` populated from `dashboard.chat_url` (`config.chat.url` on live service)
- Polls `GET {chatUrl}/api/chat/stream/{streamId}/history?limit=40` every 4 seconds
- Sends `POST {chatUrl}/api/chat/stream/{streamId}/send` with `{ body: text }`
- Response format: `{ message, room }` on send; `{ items }` on history

**Chat moderation** (stream owner only — IS_OWNER=true):
- Stream owner auto-enrolled as `role: 'owner'` in chat room on stream page load (server-side, `renderStreamRoute`)
- Mod controls on hover: Del, 5m, 30m, 1h timeout, Ban
- Delete: `DELETE {CHAT_BASE}/api/chat/messages/{messageId}`
- Timeout: `POST {CHAT_BASE}/api/chat/stream/{streamId}/bans` with `{ sender_type, sender_id, duration_minutes }`
- Ban: same endpoint, no `duration_minutes` = permanent
- Ban check enforced in chat policy `decideSend` before every message is accepted

---

## Recording system

Auto-start: when `POST /ingest/connected` fires and `channel.metadata.recording_enabled` is truthy, `recorder.startRecording()` is called immediately. It creates an HLS pipeline (`ffmpeg` or similar) writing segments to `data/vods/{channelSlug}/{streamId}/`.

VOD URL: `{publicBaseUrl}/vods/{channelSlug}/{streamId}/index.m3u8` served by `express.static` from the `vods` directory.

Segments tracked in `recording_segments` with `segment_index`, `start_ms`, `duration_ms`, `storage_key`.

On `POST /ingest/disconnected`: `recorder.stopRecording()` finalizes the recording, updates `recordings.status = 'completed'`, publishes `INGEST_DISCONNECTED` event with `recording_playlist`.

---

## Phase 16 integrations

Phase 16 wires downstream products to a stream or channel. The integrations table tracks:

| `target_kind` | What it does |
|---|---|
| `chat-room` | Stream binding in openvibe-chat |
| `tips` | Tip overlay URL from billing |
| `vip` | VIP plan subscription for channel |
| `audio-overlay` | TTS audio queue overlay |
| `ai-assist` | AI assistance product status |

`GET /api/v1/streams/:id/integrations` returns computed URLs (no DB lookup needed) plus the `ensured` list from the DB. `POST .../ensure` probes and materializes the integration record.

---

## Infrastructure requirements

| Requirement | Why |
|---|---|
| UDP ports 12000–12300 open | mediasoup WebRTC ICE candidates — both WHIP and WHEP fail without these |
| `MEDIASOUP_ANNOUNCED_IP` env var | Must be the VPS's public IP — browsers negotiate ICE to this address |
| mediasoup native binary compiled | `npm rebuild mediasoup` in `services/openre-stream` — must match runtime Node ABI |
| RTMP port 1935 open | OBS RTMP ingest |
| `INTERNAL_API_KEY` set | Service-to-service calls (live → openre, events → live); default is `change-me-in-production` |
| `OPENVIBE_EVENTS_URL` | Event push from openre to live; defaults to `http://127.0.0.1:4400` |

---

## Deployment setup script

**`scripts/setup-streaming`** handles all env var configuration and validates the result.

```bash
# Interactive setup — prompts for values, writes .env files, then validates
bash scripts/setup-streaming

# Validate only — check current config without changing anything
bash scripts/setup-streaming validate
```

**Setup steps (in order)**:
1. Generates a secure random `INTERNAL_API_KEY` and writes it to all service `.env` files
2. Auto-detects VPS public IP → sets `MEDIASOUP_ANNOUNCED_IP` in openre-stream
3. Sets `OPENVIBE_LIVE_URL` in openre-stream (needed for RTMP→live push)
4. Optionally sets `TURN_URL`/`TURN_USERNAME`/`TURN_CREDENTIAL` in openvibe-live
5. Auto-detects ffmpeg path → sets `FFMPEG_BIN` in openre-stream if not at default
6. Prints firewall commands for UDP 12000–12300 (cannot open ports itself)

**Validate checks**:
- `MEDIASOUP_ANNOUNCED_IP` set and not placeholder
- `INTERNAL_API_KEY` set, not default, and **matches** across openvibe-live and openre-stream
- `OPENVIBE_LIVE_URL` set in openre-stream
- `OPENRE_STREAM_URL` set in openvibe-live
- TURN vars present (warns if absent, doesn't fail)
- ffmpeg binary reachable
- node-media-server installed
- HTTP health checks against both services if running

**What the script cannot do** (manual steps still required):
- Open UDP 12000–12300 on the VPS firewall
- Compile mediasoup native binary (`npm rebuild mediasoup` in services/openre-stream)
- Install ffmpeg system package if missing

---

## Key config env vars

**openre-stream**:
- `MEDIASOUP_ANNOUNCED_IP` — public IP for WebRTC ICE _(set by setup script)_
- `MEDIASOUP_MIN_PORT` / `MEDIASOUP_MAX_PORT` — ICE port range (default 12000–12300)
- `INGEST_RTMP_URL` — RTMP ingest URL shown to streamers (default `rtmp://ingest.openre.stream/live`)
- `INGEST_WHIP_URL` — WHIP ingest URL (default `https://openre.stream/whip`)
- `RTMP_PORT` — RTMP server port (default 1935)
- `OPENVIBE_LIVE_URL` — URL of openvibe-live for direct `stream.started`/`stream.ended` RTMP push _(set by setup script)_
- `INTERNAL_API_KEY` — must match all services _(set by setup script)_
- `FFMPEG_BIN` — path to ffmpeg binary if not at `/usr/bin/ffmpeg` _(set by setup script)_

**openvibe-live**:
- `OPENVIBE_CHAT_URL` — chat service URL for stream page chat polling
- `OPENRE_STREAM_URL` — openre-stream base URL for proxied go-live calls
- `INTERNAL_API_KEY` — must match all services _(set by setup script)_
- `TURN_URL` / `TURN_USERNAME` / `TURN_CREDENTIAL` — TURN server for NAT traversal; forwarded to browser via dashboard `ice_servers` field and SSR injection on watch page _(set by setup script)_

---

## Model cache (openvibe-live)

`model.js` caches `allChannels()` and `allStreams()` with a 30-second TTL. Any write operation (`upsertChannel`, `upsertStream`) clears the relevant cache immediately. `listLiveNow()`, `getCurrentLiveStream()`, and other read queries use the cache when warm.

---

## Known gaps / not yet wired

- **embed_url**: Never populated for native WHIP streams. Only meaningful if a CDN/HLS embed URL is ever generated by openre. The watch page falls back to native WHEP player when `embed_url` is absent and the stream is live.

---

## Flow-breakers (things confirmed to stop streaming end-to-end)

> **Run `bash scripts/setup-streaming` first.** It handles items 1, 3, 5, 7, and 8 automatically. Items 2 and 4 require manual VPS steps. Items 6, 9, 10, and 11 are already fixed in code.

### Hard breaks — stream will not work at all

**1. `MEDIASOUP_ANNOUNCED_IP` wrong or missing** — _fixed by setup script_
- Default in `config.js` is a hardcoded IP (`40.160.240.222`) — must be the actual VPS public IP
- Symptom: WHIP returns 200, stream-manager shows "Live", but viewer's `<video>` never plays. No ICE connection established.
- Fix: `bash scripts/setup-streaming` (step 2 auto-detects and sets it)

**2. UDP ports 12000–12300 closed on VPS firewall** — _manual VPS step_
- mediasoup emits ICE candidates on these ports. If the firewall blocks them, WebRTC can't traverse.
- Symptom: identical to wrong announced IP — WHIP succeeds at HTTP level, video never flows
- Fix (run on VPS):
  ```bash
  ufw allow 12000:12300/udp
  # or: iptables -A INPUT -p udp --dport 12000:12300 -j ACCEPT
  ```
  The setup script will print this reminder but cannot run it for you.

**3. `INTERNAL_API_KEY` mismatch between services** — _fixed by setup script_
- Default is `change-me-in-production`. If services have different values, all service-to-service calls return 401.
- Symptom: go-live page fails to load channels/streams, stream events from openre to live are rejected
- Fix: `bash scripts/setup-streaming` (step 1 generates a key and writes it to all `.env` files)

**4. mediasoup native binary not compiled** — _manual VPS step_
- `npm install` downloads a prebuilt binary but it must match the runtime Node.js ABI. On a new VPS it may need to be rebuilt.
- Symptom: openre-stream crashes at startup with a native module error; WHIP/WHEP completely unavailable
- Fix: `cd services/openre-stream && npm rebuild mediasoup`

### Partial breaks — stream works but something is wrong

**5. TURN not configured** — _fixed by setup script_
- openvibe-live forwards `TURN_URL`/`TURN_USERNAME`/`TURN_CREDENTIAL` to the browser via dashboard `ice_servers` and SSR injection on the watch page
- Symptom if unset: works on home networks, fails for viewers on mobile data or behind corporate firewalls (strict NAT). WHEP times out.
- Fix: `bash scripts/setup-streaming` (step 4 prompts for TURN credentials and writes to openvibe-live `.env`)

**6. openre-stream crash mid-stream (RTMP)** — _fixed in code_
- ~~`activeStreams` Map is in-memory~~ — RTMP server now persists sessions to `ingest_sessions` and `restoreActiveStreams()` rebuilds the Map from DB at startup
- openre-stream runs `model.sweepHungStreams()` at startup to end any streams with no active ingest session
- No env var needed; this works automatically.

**7. `ffmpeg` not at `/usr/bin/ffmpeg`** — _fixed by setup script_
- `recorder.js` uses `FFMPEG_BIN` env var, falling back to `/usr/bin/ffmpeg`
- Symptom: recording silently fails, no HLS files written, VOD never created
- Fix: `bash scripts/setup-streaming` (step 5 auto-detects ffmpeg path and sets `FFMPEG_BIN`)
- If ffmpeg is not installed at all: `apt install ffmpeg` then re-run the script

**8. `OPENVIBE_LIVE_URL` not set in openre-stream** — _fixed by setup script_
- RTMP server directly POSTs `stream.started`/`stream.ended` to openvibe-live via this URL. Without it, RTMP streams never appear in the feed.
- Fix: `bash scripts/setup-streaming` (step 3 sets `OPENVIBE_LIVE_URL` in openre-stream `.env`)

**9. WHIP auth always 403** — _fixed in code_
- `whip.js` was checking `channel.stream_key` which is always `undefined` — channel stream key lives in `channel.metadata.stream_key`
- Symptom: every WHIP connection (OBS, browser broadcast, widget) returns 403 immediately
- Fix: `whip.js` now reads `channel.metadata.stream_key`

**10. WHIP streams never appear in feed** — _fixed in code_
- `whip.js` fired no events to openvibe-live when a stream started or ended. Also only looked for `status='started'` streams — missing streams created via the go-live page (`status='created'`)
- Symptom: WHIP broadcast works at the WebRTC level but stream never shows as live in openvibe-live; ends and disappears with no history
- Fix: `whip.js` now finds 'created' streams and promotes them; fires `stream.started`/`stream.ended` directly to openvibe-live's `/api/v1/events/stream`

**11. RTMP live push silently failing** — _fixed in code_
- `rtmp-server.js` was POSTing to `/internal/stream-event` (non-existent route) with header `X-OpenVibe-Internal-Key` (wrong header name). openvibe-live's actual route is `/api/v1/events/stream` and expects `x-internal-key`.
- Symptom: RTMP streams appeared to start/end fine in openre but never synced to openvibe-live
- Fix: `rtmp-server.js` now uses the correct path and header (same fix applied to `whip.js`)

**12. stream-manager browser broadcast ignores TURN** — _fixed in code_
- `stream-manager.js` WHIP broadcast used `state.turnConfig` (never set anywhere) instead of `state.iceServers` (populated from dashboard). Streamer behind NAT would get ICE failure when broadcasting from the go-live page browser tab.
- Symptom: browser broadcast from go-live page fails for streamers behind strict NAT; OBS WHIP/RTMP still work
- Fix: WHIP broadcast now uses `state.iceServers` (same as WHEP preview already did)

---

## RTMP server deep dive (rtmp-server.js)

`RTMPServer` wraps `node-media-server`. Loaded in `openre-stream/server/index.js` only if the package is installed — soft-disabled otherwise.

**Stream path format**: OBS must use path `/live/<channel-slug>` with the stream key as the `?key=` query param. Example: `rtmp://ingest.openre.stream/live/myslug?key=abc123`

**Auth on prePublish:**
1. Path must start with `/live/`
2. Slug extracted, validated against regex `[a-zA-Z0-9_.-]{1,128}`
3. Channel looked up by slug in DB
4. Key matching order:
   - Channel-level `metadata.stream_key`
   - Any `started` or `created` stream's `stream_key` field or stream `id`
   - If no key provided at all: accepts if any started/created stream exists (trusts slug alone)
5. If no matching stream found: **auto-creates** one via `model.createStream()`
6. Rejects duplicate publisher (same slug, different sessionId)
7. Calls `model.startStream()` if not already started
8. Calls `model.recordIngestConnected()` to persist session in `ingest_sessions` table
9. Emits `publish` event, calls `pushLiveEvent()` to directly POST `stream.started` to openvibe-live, publishes `INGEST_CONNECTED` via event bus

**On donePublish:**
1. Calls `model.recordIngestDisconnected()` to mark session ended in DB
2. Calls `model.endStream()`
3. Emits `unpublish` event
4. Calls `pushLiveEvent()` to directly POST `stream.ended` to openvibe-live
5. Publishes `INGEST_DISCONNECTED` via event bus

**On startup — `restoreActiveStreams()`**: queries `ingest_sessions` for rows with `disconnected_at IS NULL` and `stream.status='started'`, rebuilds `activeStreams` Map from DB. Prevents duplicate-publisher false-rejections after a crash.

**Startup sweep**: `model.sweepHungStreams()` is called in `start()` before the RTMP server starts — ends any streams that have `status='started'` with no active ingest session in the DB.

**HTTP port**: RTMP port + 8000 (default 9935). Serves a local mediaroot directory.

---

## Event bus (events.js)

```
buildEventBus(config) → { client, publishStreamEvent }
```

Uses `@openvibe/sdk EventsClient` to publish to `TOPICS.STREAM`. Every stream lifecycle event goes through here.

**Published events** (from `@openvibe/contracts/stream-events STREAM_EVENT_TYPES`):
- `INGEST_CONNECTED` — RTMP `prePublish` and WHIP `handleOffer` success
- `INGEST_DISCONNECTED` — RTMP `donePublish` and WHIP session ended (routes.js)
- Other lifecycle events (CREATED, STARTED, ENDED) published from `routes.js` directly

**Payload shape** via `buildStreamEventPayload(stream, extra)`:
```json
{
  "event_type": "...",
  "source": "openre-stream",
  "actor_type": "service",
  "actor_id": "openre-stream",
  "payload": {
    "stream_id": "...",
    "channel_id": "...",
    "channel_slug": "...",
    "creator_id": "..."
  }
}
```

**Where openvibe-live receives it**: Either via openvibe-events subscription (poll-based) or via direct internal POST to `/internal/stream-event` on openvibe-live (if `OPENVIBE_LIVE_URL` is set in openre config).

---

## Ingestion layer (ingestion.js in openvibe-live)

`applyStreamEvent(envelope)` translates a stream event envelope into a live DB upsert.

**Supported event types and their DB effect:**

| Event type | DB change |
|---|---|
| `CREATED` | `upsertStream({ status: 'created' })` |
| `STARTED` | `upsertStream({ status: 'started', started_at })` |
| `MIRRORED_TO_LIVE` | `model.recordMirror(...)`, status stays/becomes `'started'` |
| `ENDED` | `upsertStream({ status: 'ended', ended_at })` |
| `VOD_ATTACHED` | `upsertStream({ vod_media_id })` |

**Channel auto-upsert**: If `payload.channel_slug` is present, `model.upsertChannel()` is called first to ensure the channel row exists in openvibe-live's DB.

**Fields mapped from payload to stream patch:**
- `stream_id`, `channel_slug`, `channel_id`, `title`, `category`, `thumbnail_url`, `embed_url`

**Called from two places:**
1. `POST /internal/stream-event` in `openvibe-live/server/index.js` — direct push from openre-stream
2. openvibe-events subscription handler (if event subscription is configured)

---

## Auth policy (policy.js in openre-stream)

Simple role-based policy seam. No complex rules.

**Actors identified from request:**
- `req.serviceActor` (set by service middleware) → `{ type: 'service', id: serviceId }`
- `req.user` (JWT middleware) → `{ type: 'user', id: req.user.sub }`
- Otherwise → `{ type: 'anonymous', id: null }`

**Write policy** (`decideChannelWrite`):
- Admin (`req.user.role === 'admin'`): allowed
- Service actor: allowed
- User whose ID matches `channel.owner_user_id`: allowed
- Everyone else: 403

**Read policy**: Always allowed (public read for all channels/streams).

**`assert(decision, ctx)`** throws `StreamPolicyDeniedError` (HTTP 403, code `ESTREAMPOLICY`) if not allowed.

---

## Stream page SSR (ssr.js in openvibe-live)

`ssr.js` is the largest file (4450+ lines). Key rendering functions:

### renderStreamPage

Called for `/@{slug}/s/{streamId}` routes.

**Rendering logic:**
- Fetches stream from live DB
- Determines `isLive = stream.status === 'started'`
- OG tags set to `video.other` (live) or `video.movie` (VOD)
- **If live**: renders an `<iframe>` or WHEP `<video>` for the player. Viewer sees the SFU WebRTC stream.
- **Chat panel**: Inline JS (embedded in page HTML) polls `CHAT_BASE + /api/chat/stream/{streamId}/history` every 3 seconds. CHAT_BASE is the `openvibe-chat` URL injected by SSR.
- **Owner buttons** (shown only when `IS_OWNER` is true):
  - Mod buttons on chat messages (delete, timeout, ban) via `POST /api/chat/stream/{streamId}/bans`
  - **End Stream** button: `POST /api/v1/go-live/streams/{streamId}/end` directly to openvibe-live
- Chat send: `POST {CHAT_BASE}/api/chat/stream/{streamId}/send`

### renderMediaDetailPage

Called for `/vod/{id}` and `/clip/{id}` routes. Uses `renderCustomMediaPlayer` for playback-ready items, `renderMediaThumb` for pending ones.

**Custom media player**: Pure HTML5 `<video>` with custom overlay, progress bar, volume, fullscreen. No third-party player.

### renderChannelCard

Used in channels list and discovery pages. Derives live status from `channel.currentStream`, category from last stream, duration from ended_at - started_at diff.

**sanitizeStreamTitle**: Filters default hobostreamer titles like `"STREAM 1042 1777693187691"` and `"username's Stream"` — returns null for those to avoid cluttering discovery.

### Client-side scripts embedded in stream page

- `CHAT_BASE`, `STREAM_ID`, `ROOM_TITLE`, `IS_OWNER`, `myName` — injected as JSON literals in the page script block
- Poll interval: 3000ms for stream chat, 4000ms for global chat
- Global chat toggle: shows/hides messages from the global room alongside stream room messages
- `window.OvInitContent(container)` — sets up IntersectionObserver for reveal animations, counter animations, hero stage cycling, rotating words, filter inputs, and video players

---

## Feed bridge (feed-bridge.js in openvibe-live)

Bridges openvibe-live with external media (openvibe-media service) and community (openvibe-community service).

### Key abstractions

**`createFeedBridge(options)`** — returns an object with:

| Method | What it does |
|---|---|
| `buildHomeViewModel()` | Assembles everything for the home page (channels, featured, trending, VODs, clips, community, stats). Cached 60s. |
| `buildChannelMedia(channelSlug)` | Fetches VODs and clips for a channel from openvibe-media. |
| `getCanonicalMedia(kind, id)` | Fetches a single VOD or clip from openvibe-media by ID. Tries legacy `media:hobostreamer-{kind}:{id}` format first. |
| `listCanonicalVods(query)` / `listCanonicalClips(query)` | List VODs/clips from openvibe-media cache. |
| `buildCommunityViewModel()` | Fetches recent threads, pastes, Discord relays from openvibe-community. Cached 60s. |

### Media normalization (`normalizeMediaRecord`)

Enriches raw media records from openvibe-media with channel context by:
1. Extracting `stream_session_id` from metadata
2. Looking up the stream in live DB
3. Finding the channel from stream's `channel_slug` or `owner_user_id`

**`derivePlaybackState`**: Determines if a media record is playable. Requires: media ID + storage_key or public_url + resolvable MIME type. Sets `playback_mode` to `'file-direct'` for files under size guard, `'file-direct-oversize'` for larger ones.

**`rewriteThumbnailUrl`**: Rewrites thumbnail URLs to go through `/api/thumbnails/{id}` proxy.

### Home view model composition

`buildHomeViewModel()` combines:
- `model.listChannels({ limit: 50 })` — all channels
- `model.listFeaturedChannels({ limit: 8 })` — curated featured
- `model.listTrendingStreams({ limit: 6 })` — trending by viewer count
- `model.listLiveNow({ limit: 12 })` — currently live
- `model.listRecentlyEnded({ limit: 500 })` — last 500 ended streams for "recently online" section (groups up to 4 per channel)
- `listCanonicalMedia` for VODs and clips from openvibe-media
- `buildCommunityViewModel()` — threads, pastes, relays
- `model.listTopCategories({ limit: 10 })`
- `model.getHomeStats()`

**Caches**: `canonicalMediaCache` (per kind), `communityCache`, `homeViewModelCache` — all 60s TTL via `createAsyncTimedCache`. Remote calls have 4s timeout (`withTimeout`) so a slow media/community service doesn't block page renders.

---

## Stream-manager.js — live tab, WHEP preview, chat, viewer count

### Live tab activation (`activateLiveTab`)

When a stream goes live (`is_live = true`):
1. `activateStab('live')` switches to the Live tab
2. Creates `<video>` element in `#sm-live-preview-inner`
3. Calls `startWhepPreview(video, whepBase, slug)` — WHEP from `state.restreamUrl + /whep/{slug}`
4. Sets `#sm-live-watch-link` href and `#sm-live-chat-popout` href

### WHEP preview in stream-manager (`startWhepPreview`)

```
RTCPeerConnection({ iceServers: state.iceServers || [{ urls: 'stun:stun.l.google.com:19302' }] })
addTransceiver('video', { direction: 'recvonly' })
addTransceiver('audio', { direction: 'recvonly' })
createOffer() → setLocalDescription → wait for ICE complete (max 5s)
POST {whepBase}/whep/{slug} with SDP offer
setRemoteDescription(SDP answer)
```

On connection failure: auto-retry after 3s. On stream end (`stopChatPoll`): closes PC, sends `DELETE` to WHEP resource URL (clean teardown).

`state.iceServers` is populated from `data.ice_servers` on `loadDashboard` — TURN is included if `TURN_URL`/`TURN_USERNAME`/`TURN_CREDENTIAL` are set in openvibe-live env.

### Chat polling in stream-manager

- `pollChat(streamId)` calls `{chatUrl}/api/chat/stream/{streamId}/history?limit=40` every 4s
- `appendChatMessages()` appends new messages to `#sm-chat-messages` DOM, keeps scroll-to-bottom
- Chat send: `POST {chatUrl}/api/chat/stream/{streamId}/send` with `{ body: text }`

### Viewer count polling

- `pollViewerCount(slug)` calls `{restreamUrl}/viewer-count/{slug}` every 8s
- Updates `#sm-live-viewers-display` with count

**Watch page also polls**: the stream page SSR now injects viewer count polling every 10s (updates `#sp-viewer-count`). The stream-manager polls separately every 8s updating `#sm-live-viewers-display`.

### Endpoint panel (renderEndpoint)

Renders below the method selection cards. Protocol-specific:

| Protocol | What's shown |
|---|---|
| `rtmp` | RTMP Server URL + Stream Key + OBS instructions |
| `whip` | WHIP Endpoint + Stream Key + "no active session" warning if no stream created yet + OBS 30+ instructions |
| `cli` | Full FFmpeg/GStreamer command library for RTMP and WHIP (webcam, screen, file loop, RTSP, Raspberry Pi) |
| `browser` | Panel hidden — inline broadcast widget shown instead |

Key fields derived from: `stream.rtmp_url`, `stream.whip_url`, `channel.stream_key`, falling back to `state.restreamUrl + /live` or `state.restreamUrl + /whip/{slug}`.

### loadDashboard

On init, calls `GET /api/v1/go-live/dashboard` to populate `state`:
```js
state = { channels, destinations, streams, restreamUrl, accountUrl, chatUrl, iceServers }
```
`iceServers` is the array from `buildIceServers()` in openvibe-live — includes STUN always, TURN if configured. Falls back to `[{ urls: 'stun:stun.l.google.com:19302' }]` if absent.

Then `openChannel(channels[0].slug)` to auto-select first channel.

---

## openre.stream dashboard (dashboard.js) — full analysis

The dashboard at `/dashboard` on openre-stream is a separate product from the go-live page. It talks directly to same-origin openre-stream API (`/api/v1/...`).

**Key difference from go-live page:**
- Dashboard calls `/api/v1/channels/...` and `/api/v1/destinations/...` directly on openre-stream
- Go-live page calls `/api/v1/go-live/...` on openvibe-live which proxies to openre

### Dashboard API calls

| Action | Method | Endpoint |
|---|---|---|
| Channel settings save | PATCH | `/api/v1/channels/{slug}` |
| Stream key regenerate | POST | `/api/v1/channels/{slug}/regenerate-key` |
| Add destination | POST | `/api/v1/destinations` |
| Delete destination | DELETE | `/api/v1/destinations/{id}` |

### Dashboard tabs

5 tabs: **Ingest**, **Settings**, **Destinations**, **Streams**, **Broadcast**

**Ingest tab**: Shows RTMP URL, stream key (masked, with show/copy/regen), WHIP endpoint. All from `ch.rtmp_url`, `ch.whip_url`, `ch.stream_key`.

**Settings tab**: `display_name`, `description`, stream key visible input. PATCH saves to `/api/v1/channels/{slug}`.

**Destinations tab**: Lists destinations (kind, label, target_url). Add form: kind, label, target_url, target_key, enabled. POST to `/api/v1/destinations`.

**Streams tab**: Recent streams for selected channel with status badge and "View →" link to `liveUrl/@{channel_slug}`.

**Broadcast tab**: Browser WHIP broadcast — same `bcast` closure as go-live page. WHIP URL: `/whip/{slug}?key={stream_key}` (same-origin on openre-stream, no proxy). Source picker: camera, screen, screen+cam. Device selectors. Quality picker. Timer. Mute/unmute video/audio.

---

## Stream-manager broadcast flow (full detail from stream-manager.js)

The `bcast` closure in stream-manager.js handles browser WHIP from the go-live page. Here is the complete broadcast flow:

### Acquire media

```
source = 'camera':
  getUserMedia({ video: { width, height, fps, deviceId }, audio: { echoCancellation, noiseSuppression, deviceId } })
  → localStream, preview.srcObject = localStream

source = 'screen':
  getDisplayMedia({ video: { frameRate: 30 }, audio: true })
  → screenStream, preview.srcObject = screenStream

source = 'screen+cam':
  getDisplayMedia() + getUserMedia() in parallel
  VideoTrack from screen, AudioTrack from camera
  Combined into one MediaStream via canvas or addTrack
  PiP overlay shows camera in corner
```

### Start broadcast (go live)

```
1. pc = new RTCPeerConnection({ iceServers: [stun.l.google.com:19302] })
2. Add all tracks from localStream/screenStream
3. createOffer() → setLocalDescription
4. Wait for ICE complete (max 5s timeout)
5. POST {whipUrl} with localDescription.sdp
   whipUrl = /api/v1/go-live/streams/{...}/whip/{slug}?key={streamKey}   ← via proxy on openvibe-live
   OR /whip/{slug}?key={key}   ← direct on openre-stream dashboard
6. resp.headers.get('Location') → whipResourceUrl (for teardown DELETE)
7. setRemoteDescription(SDP answer)
8. Start timer, enable mute/unmute controls
```

### End broadcast

```
1. pc.close()
2. DELETE {whipResourceUrl} if set
3. stopStreams() — stop all tracks
4. Clear timer
```

### Stream form flow (create stream → go live)

When user clicks "Create session":
1. `POST /api/v1/go-live/streams` with `{ channel_slug, title, description, category, protocol, nsfw, recording_enabled: true }`
2. Server returns `stream` with `id`, `stream_key`, `rtmp_url`, `whip_url`
3. Client stores `state.activeStreamId = stream.id`
4. `renderEndpoint(stream, channel)` — shows ingest credentials
5. `renderHistory(channelSlug)` — updates history list

When user clicks "Go Live" (after stream created, before started):
- Calls `POST /api/v1/go-live/streams/{id}/start` (same endpoint format, proxied to openre `/streams/{id}/start`)

When user clicks "End stream":
- `POST /api/v1/go-live/streams/{id}/end`
- Clears `state.activeStreamId`, hides Live tab, stops chat/WHEP/timer
