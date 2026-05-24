# Streaming — Full Flow Analysis

_Last updated: 2026-05-24_

---

## Architecture overview

Two services handle streaming. Everything user-facing lives on **openvibe.live**; the low-level WebRTC/RTMP infrastructure lives on **openre.stream**.

```
openvibe.live  (port 4600)   — go-live page, stream watch pages, viewer
openre.stream  (port 4700)   — WHIP ingest, mediasoup SFU, WHEP viewer, RTMP, restream destinations
openvibe-chat  (port 4200)   — chat rooms
```

---

## Browser broadcast flow (go-live → live)

### Step 1 — Create a stream session
`POST /api/v1/go-live/streams` on openvibe-live  
→ openvibe-live proxies to `POST /api/v1/streams` on openre-stream  
→ Returns `{ stream, channel }` — stream status is `created`  
→ openvibe-live syncs the record into its own SQLite via `syncLiveStream`

### Step 2 — Start WHIP (browser broadcast)
User selects "Browser" method on the go-live page. `stream-manager.js` `startBroadcast()`:
1. `getUserMedia` / `getDisplayMedia` for camera or screen
2. `new RTCPeerConnection` with STUN
3. `addTrack` all media tracks
4. `createOffer` → `setLocalDescription` → wait for ICE gathering
5. `POST {openre-stream}/whip/{slug}?key={streamKey}` with the SDP offer body (`Content-Type: application/sdp`)
6. openre-stream `handleOffer` (`whip.js`):
   - Validates stream key against channel record
   - Gets or creates a `live_streams` record on openre-stream's DB (auto-start)
   - Creates mediasoup WebRTC transport
   - Connects transport with DTLS from offer
   - Creates mediasoup **producers** (video + audio)
   - Returns `201` with SDP answer + `Location` header for the session resource
7. Browser `setRemoteDescription` with the answer → ICE/DTLS → media flows to SFU

### Step 3 — Signal "started" to openvibe-live
`stream-manager.js` calls `POST /api/v1/go-live/streams/{id}/start`  
→ openvibe-live proxies to `POST /api/v1/streams/{id}/start` on openre-stream  
→ Returns stream with `status: started`, `is_live: true`  
→ openvibe-live updates its DB record so the stream appears in home feed and channel page

### Step 4 — Live tab activates
`updateStreamButtons(liveStream)` shows the Live tab and calls `activateLiveTab(stream)`:
- Creates a `<video>` element in `#sm-live-preview-inner` (muted, so no echo)
- Calls `startWhepPreview(video, restreamUrl, slug)` — async WHEP viewer (see Viewer section)
- Starts `pollChat` loop every 4 seconds
- Shows watch/popout links

### Step 5 — End stream
User clicks "End stream" → `POST /api/v1/go-live/streams/{id}/end`  
→ openvibe-live marks stream ended  
→ WHIP `DELETE {Location}` is sent by `stopBroadcast()`  
→ openre-stream `cleanupSession` closes the mediasoup producers and room  
→ SFU emits `room-closed` → connected WHEP viewers receive `stream-ended` signal (broadcast-ws)

### Boot-time cleanup
On server restart, `sweepHungStreams()` runs in openvibe-live's `buildApp()` and sets any `status='started'` streams to `ended`. Prevents stuck "live" entries from a crashed session.

---

## OBS/RTMP broadcast flow

Same Steps 1 and 3 apply. Instead of WHIP from the browser:
- User copies RTMP URL and stream key from the inline endpoint panel
- Pastes into OBS → Settings → Stream → Custom
- OBS pushes RTMP to openre-stream's RTMP server (port 1935)
- openre-stream's `rtmp-server.js` receives the stream and creates/starts a `live_streams` record
- openvibe-live picks up the started event via event subscription

### OBS WHIP (OBS 30+)
Same as browser WHIP above except OBS sends the offer. The go-live page inline endpoint panel shows the WHIP URL and stream key for OBS configuration.

---

## Viewer flow (WHEP)

Any time a viewer lands on `/@slug/s/:streamId` while the stream is live:

1. SSR renders `renderStreamPage` with a `<video id="sp-live-video">` instead of the play-button thumbnail
2. Page JS (`extraScripts` in `ssr.js`) runs `initViewer()`:
   - `new RTCPeerConnection`
   - `addTransceiver('video', recvonly)` + `addTransceiver('audio', recvonly)`
   - `ontrack` → sets `video.srcObject`
   - `createOffer` → `setLocalDescription` → wait for ICE gathering (5s max fallback)
   - `POST {restreamUrl}/whep/{slug}` with SDP offer
3. openre-stream `handleWhepOffer` (`whip.js`):
   - Checks that the SFU room for this channel has active producers (stream must be live)
   - Creates a mediasoup **consumer** transport
   - Connects transport with DTLS from viewer offer
   - Calls `sfu.consume()` for each producer (video + audio) using viewer's RTP capabilities
   - Builds `sendonly` SDP answer with consumer's RTP parameters (codec, PT, SSRC)
   - Returns `201` with SDP answer + `Location` header
4. Viewer `setRemoteDescription` → ICE/DTLS → media flows from SFU to viewer
5. On connection failure, viewer auto-retries after 3 seconds

### WHEP SDP answer details
The answer uses the mediasoup consumer's `rtpParameters`:
- `a=sendonly` (server sends to viewer)
- Payload type from `consumer.rtpParameters.codecs[0].payloadType`
- `a=ssrc` lines from `consumer.rtpParameters.encodings[0].ssrc`
- ICE/DTLS credentials from the consumer transport
- DTLS role `active` (openre-stream initiates handshake)

---

## Live tab preview (go-live page)

When a stream is live, the Live tab in the stream manager shows:
- Left: `<video>` element connected via WHEP (same as viewer, but muted — no echo)
- Right: inline live chat, backed by `pollChat` → openvibe-chat `/api/chat/stream/:id/history`
- Bottom bar: timer, viewer count, End stream / Watch page buttons

The WHEP preview is a real viewer connection to the SFU. The streamer sees exactly what viewers see, with the normal WebRTC latency (~0.5–2s).

---

## Chat flow (live tab + watch page)

### Watch page (`renderStreamPage`)
- `CHAT_BASE` = `LIVE_NETWORK_URLS.chat` (resolved at SSR time from env)
- Polls `GET CHAT_BASE/api/chat/stream/:streamId/history?limit=60` every 3s
- Sends `POST CHAT_BASE/api/chat/stream/:streamId/send` with `{ body, room_title, metadata: { sender_name } }`
- Response format: `{ items: Message[] }`

### Live tab (stream-manager.js)
- `state.chatUrl` = `data.chat_url` from dashboard API (resolved from config)
- Polls `GET chatUrl/api/chat/stream/:streamId/history?limit=40` every 4s, mode `cors`
- Sends `POST chatUrl/api/chat/stream/:streamId/send` with `{ body: text }`, mode `cors`
- Response format: `{ message, room }` from send; `{ items }` from history

---

## openre.stream page

openre.stream is a **restream destination manager** only. It handles:
- OBS ingest credentials (RTMP URL + stream key)
- Restream destinations (YouTube, Twitch, Kick, custom RTMP)
- Recent stream history

Browser streaming was removed from openre.stream. The "Browser streaming" panel on that page now links to openvibe.live/go-live.

---

## Known infrastructure requirements

| Requirement | Why |
|---|---|
| mediasoup native binary compiled | `npm rebuild mediasoup` in openre-stream. CI builds it automatically. Not done locally. |
| UDP ports 12000–12300 open | mediasoup WebRTC ICE candidates. Required for WHIP and WHEP to connect. |
| `MEDIASOUP_ANNOUNCED_IP` set | Public IP that remote browsers can reach for ICE. Defaults to `40.160.240.222`. |
| TURN server (optional) | For NAT traversal when UDP is blocked. Config in openre-stream `config.turn`. |
| `OPENVIBE_CHAT_URL` env var | Chat service URL for cross-origin polling. Auto-resolved from surface map if unset. |

---

## What was fixed in this session

| Issue | File | Fix |
|---|---|---|
| Play button overlay — no actual player | `openvibe-live/server/ssr.js` | Live streams now render `<video>` + WHEP viewer JS instead of CSS overlay |
| WHEP endpoint missing | `openre-stream/server/whip.js` + `index.js` | Added `POST /whep/:slug` and `DELETE /whep/:slug/:id` with full mediasoup consumer setup |
| Live tab used iframe pointing to channel page | `stream-manager.js` | Replaced iframe with `<video>` + `startWhepPreview()` using the SFU directly |
| Chat in live tab used wrong relative URLs | `stream-manager.js` | Uses `state.chatUrl` (from dashboard API) as base; mode `cors` |
| Chat response key mismatch | `stream-manager.js` | `data.messages` → `data.items` (matches chat service `{ items }` response) |
| Chat send body field wrong | `stream-manager.js` | `{ content: text }` → `{ body: text }` (matches chat service `b.body` field) |
| `chat_url` missing from dashboard API | `index.js` + `config.js` | Added `config.chat.url` and included in `buildGoLiveDashboardState` return |
| openre.stream browser quick-start had dead "Go Live" button text | `public/index.html` | Replaced with link to openvibe.live/go-live |
| Hung "started" streams after server restart | `model.js` + `index.js` | `sweepHungStreams()` runs on boot |
| **WHIP room ID used numeric DB id** | `openre-stream/server/whip.js` | `channel-${channel.id}` → `channel-${channelSlug}` — `broadcast-ws` and WHEP both use slug-keyed rooms; WHIP was creating a different room so producers were invisible to all viewers and the WS bridge |
| Watch page WHEP viewer had no STUN | `openvibe-live/server/ssr.js` | `iceServers: []` → `stun:stun.l.google.com:19302` — viewers behind NAT silently failed to connect |

---

## What still needs work

- **TURN server configuration**: Without TURN, WHIP and WHEP may fail behind strict NATs. The config exists (`config.turn`) but is only used by the browser broadcast WHIP path in `stream-manager.js` (via `state.turnConfig`). The `state.turnConfig` field is never populated from the dashboard response. Wire it up if connectivity issues arise.
- **Viewer count**: `sfu.getViewerCount(roomId)` exists but the live tab's viewer count display (`#sm-live-viewers-display`) is not being polled. A simple `GET /api/v1/streams/:id` poll could update it.
- **RTMP → openvibe-live sync**: When OBS pushes RTMP, openre-stream creates a stream record. openvibe-live picks this up via event subscription (`subscription.enabled`). Ensure `LIVE_SUBSCRIBE_STREAM_EVENTS` is not `false` in production and the event bus URL is set.
- **embed_url**: Never populated for go-live streams. If openre-stream ever provides a CDN/HLS embed URL, wire it through `syncLiveStream`. For now, WHEP is the player for all native streams.
