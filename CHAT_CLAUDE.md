# OpenVibe Chat — Developer Reference

## Architecture Overview

Chat is implemented in `services/openvibe-chat/` and surfaces in three places:
- **Global chat widget** — floating bubble on `openvibe.network` (`services/openvibe-network/public/index.html`)
- **Stream page chat panel** — sidebar on each stream page, rendered by `services/openvibe-live/server/ssr.js`
- **Full chat page** — `services/openvibe-chat/public/index.html` (room sidebar, DMs, TTS, etc.)

---

## Server: `services/openvibe-chat/server/`

| File | Role |
|------|------|
| `index.js` | Express app builder, WebSocket attachment, seeds global room on startup |
| `routes.js` | All REST endpoints (`/api/chat/*`), compatibility wrappers |
| `model.js` | Pure SQLite CRUD — rooms, messages, participants, DMs, TTS, calls; `setRoomTitle(id, title)` updates a room's display name |
| `policy.js` | Single decision point for read/send/edit/delete authorization |
| `chat-ws.js` | WebSocket server at `/ws/chat` — real-time push to room subscribers |
| `middleware.js` | Service-actor auth (`X-Internal-Key`) + optional OpenVibe JWT auth |
| `db.js` | SQLite schema, init, `describePersistence()` |
| `events.js` | EventBus wrapper for publishing `TOPICS.CHAT` events |
| `config.js` | Env config loading |

---

## Room Model

**Table:** `chat_rooms`

| Field | Values |
|-------|--------|
| `room_type` | `global`, `stream`, `channel`, `dm`, `group_dm`, `private`, `call` |
| `visibility` | `public`, `unlisted`, `restricted`, `private` |
| `external_ref_type` | `stream`, `channel`, `global`, etc. — links room to an external object |
| `external_ref_id` | The stream UUID or channel slug |
| `owner_type` / `owner_id` | `service` / `openvibe-chat` for system rooms; `user` for user-owned |

**Key lookups (model.js):**
- `getRoom(id)` — by room UUID or the literal `'global'`
- `findRoomByExternal(refType, refId)` — by external ref, returns `null` if not found
- `ensureRoomForExternal(refType, refId, defaults)` — creates if missing; safe to call on every request
- `setRoomTitle(id, title)` — updates the room's `title` column in place; used by `wrappedSend` to apply the channel name after a room was auto-created with a placeholder title

**Global room** is seeded at startup with `id: 'global'`, `room_type: 'global'`, `visibility: 'public'`.

---

## Message Model

**Table:** `chat_messages`

| Field | Description |
|-------|-------------|
| `id` | UUID (`msg_…`) |
| `room_id` | Foreign key to `chat_rooms` |
| `sender_type` | `user`, `service`, `anonymous` |
| `sender_id` | User UUID or service name; `null` for anonymous |
| `body` | Message text |
| `metadata` | JSON — includes `sender_name` (display name), `from_room_type`, `from_room_ref`, `from_room_title` (fan-out copies) |
| `created_at` | ISO timestamp |

**Display name precedence (client-side):**
```
m.metadata.sender_name  ||  m.sender_id  ||  'Anonymous'
```

---

## Auth & Identity

### Three actor types

| Type | How determined | Can send to public rooms |
|------|---------------|--------------------------|
| `user` | Valid JWT in Bearer header or cookie | Yes |
| `service` | `X-Internal-Key` + `X-OpenVibe-Service` headers | Yes |
| `anonymous` | No valid auth | Yes (public rooms only, identity via `metadata.sender_name`) |

### Sign-in / sign-out URLs (openvibe.chat)

`services/openvibe-chat/public/assets/openvibe.js` must build absolute URLs pointing to the network service, not relative ones:

```js
function signInUrl(returnTo) {
    return `${resolveSurfaceUrl('network')}/oauth/authorize?return_to=${encodeURIComponent(returnTo || location.href)}`;
}
function signOutUrl(returnTo) {
    return `${resolveSurfaceUrl('network')}/oauth/logout?return_to=${encodeURIComponent(returnTo || location.href)}`;
}
```

Using `/oauth/authorize` (relative) would hit the chat server on port 4800, which has no OAuth endpoint and silently returns 404. Other services already used the absolute pattern via `resolveSurfaceUrl('network')`.

### SSO cookie domain (cross-service login)

The auth cookie is set by `services/openvibe-network/server/native-auth.js` → `setSessionCookie`. In development all services share the `.localhost` root domain, so the cookie must be written to **both** `.network.localhost` (the primary service domain) **and** `.localhost` (the shared root):

```js
res.append('Set-Cookie', cookieParts(token, maxAge, '.network.localhost'));
res.append('Set-Cookie', cookieParts(token, maxAge, '.localhost'));
```

Old code was clearing `.localhost` immediately after setting `.network.localhost` as part of a one-time migration cleanup. That cleanup was removed; the `.localhost` cookie is load-bearing for all non-network services (chat, live, community, etc.).

### Anonymous identity (chat widgets)

Both the global widget and stream page widget auto-assign an anonymous ID on first use:

```js
var myName = (function() {
    var saved = localStorage.getItem('ov-chat-name');
    if (saved) return saved;
    var id = 'Anon_' + Math.random().toString(36).slice(2, 6).toUpperCase();
    localStorage.setItem('ov-chat-name', id);
    return id;
})();
```

Then async: check `/api/v1/session` — if logged in, replace `myName` with `display_name || username`.

The user can click "Chatting as X · click to change" to rename themselves. The name is stored in `localStorage['ov-chat-name']`.

---

## Policy (`policy.js`)

### `decideSend` logic

```
archived room → deny
admin → allow
service actor → allow
anonymous + public room → allow  (identity via metadata.sender_name)
anonymous + non-public room → deny
user + private/restricted/membership room → must be participant
user + blocked role → deny
otherwise → allow
```

### `decideRead` logic

```
admin → allow
service actor → allow
public/unlisted room → allow
otherwise → must be participant
```

---

## REST API

All routes are mounted at `/api/chat/` (also aliased as `/api/v1/chat/`).

### Core room/message routes

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/rooms` | List rooms (filtered by type, owner, external_ref) |
| `POST` | `/rooms` | Create room |
| `GET` | `/rooms/:roomId` | Get room + participants |
| `GET` | `/rooms/:roomId/messages` | List messages (newest-first, reversed client-side) |
| `POST` | `/rooms/:roomId/messages` | Send message to room |
| `PUT` | `/messages/:messageId` | Edit message |
| `DELETE` | `/messages/:messageId` | Delete message |

### Compatibility wrappers (used by chat widgets)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/global/history` | Global room messages |
| `POST` | `/global/send` | Send to global room |
| `GET` | `/stream/:streamId/history` | Stream room messages (auto-creates room) |
| `POST` | `/stream/:streamId/send` | Send to stream room (auto-creates room; fans out to global); accepts optional `room_title` body param to update the room's display name |
| `GET` | `/channel/:channelId/history` | Channel room messages |
| `POST` | `/channel/:channelId/send` | Send to channel room |

**Fan-out:** `wrappedSend` for non-global rooms copies each message to the global room with `metadata.from_room_type`, `from_room_ref`, `from_room_title` set. This is how the global chat widget shows stream activity.

**Room title resolution:** when the stream page sends a message it includes `room_title: ROOM_TITLE` (the channel display name injected by SSR). `wrappedSend` calls `model.setRoomTitle(room.id, req.body.room_title)` on every send, so even rooms pre-created by `wrappedHistory` with a placeholder `stream:UUID` title get corrected on the first real message.

### Session

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/session` | Returns `{ authenticated, anonymous, user }` |
| `GET` | `/account/session` | Same — shim for openvibe.js `loadSession()` compatibility |

---

## WebSocket (`chat-ws.js`)

**Endpoint:** `ws://<chat-host>/ws/chat`

### Wire protocol (JSON messages)

**Client → Server:**
```json
{ "type": "join", "roomId": "<room-id>", "displayName": "username" }
{ "type": "ping" }
```

**Server → Client:**
```json
{ "type": "joined", "roomId": "...", "peerId": "...", "userId": "...", "displayName": "...", "viewerCount": 5 }
{ "type": "message", "roomId": "...", "message": { "id": "...", "content": "...", "user_id": "...", "display_name": "...", "created_at": "..." } }
{ "type": "pong" }
```

In-memory state (`chat-ws.js`):
- `roomPeers`: `Map<roomId, Set<peerId>>` — who is in which room
- `peers`: `Map<peerId, { ws, userId, displayName, rooms }>` — peer registry

WebSocket subscriptions are in-memory only — lost on server restart. Chat widgets use polling as the primary data source and WS as a real-time push supplement.

---

## Chat Widgets

### Stream manager live tab (go-live page)

**File:** `services/openvibe-live/public/js/stream-manager.js` — `pollChat()` / `chatSendForm`

- **Base URL:** `state.chatUrl` — populated from `data.chat_url` in `GET /api/v1/go-live/dashboard`
  - Server-side: `config.chat.url` = `process.env.OPENVIBE_CHAT_URL || resolvePublicOrigin({ surface: 'chat' })`
  - This is a cross-origin fetch; `mode: 'cors'` + `credentials: 'include'` required
- Polls `GET {chatUrl}/api/chat/stream/:streamId/history?limit=40` every 4 seconds
- Sends via `POST {chatUrl}/api/chat/stream/:streamId/send` with `{ body: text }`
- Response key from history: `data.items` (not `data.messages`)
- Response key from send: `data.message` (singular)
- Identity: anonymous; sender name shown from `m.sender_name || m.actor_display_name || 'Anon'`

### Global chat widget — network home

**File:** `services/openvibe-network/public/index.html` (bottom of `<body>`)

- Polls `GET /api/chat/rooms/global/messages?limit=60` every 3 seconds
- Sends via `POST /api/chat/rooms/global/messages`
- Shows stream-room messages that have been fanned out into global, with a `[stream-title]` room label
- Identity: auto-assigned `Anon_XXXX` from localStorage, overwritten async with logged-in username

### Stream page chat panel

**File:** `services/openvibe-live/server/ssr.js` — `renderStreamPage()` → `extraScripts`

- Polls `GET /api/chat/stream/:streamId/history?limit=60` every 3 seconds for stream messages
- Sends via `POST /api/chat/stream/:streamId/send`
- **Global toggle:** "🌐 Global" button in chat header — off by default. When enabled, also polls `GET /api/chat/rooms/global/messages` and merges with stream messages (excluding fan-out copies originating from this stream to avoid duplicates). Global messages are styled dim with `[Global]` label.
- Identity: same auto-assign pattern as global widget

---

## Room Hierarchy & Visibility

```
Global room (id: 'global')
├── Shows: global messages + fanned-out copies of all stream/channel messages
└── Writable by: everyone (anonymous included for public room)

Stream rooms (external_ref_type: 'stream', external_ref_id: streamUUID)
├── Auto-created on first history poll or send via wrappedSend/wrappedHistory
├── Isolated by default: stream page shows only stream messages
├── Optional: user can toggle "🌐 Global" to also see global messages
└── Fan-out: each stream message is copied into global room automatically

Channel rooms (external_ref_type: 'channel', external_ref_id: slug)
└── Same pattern as stream rooms
```

---

## Data Flow: Sending a Message (stream page)

```
User types → clicks Send
    ↓
POST /api/chat/stream/:streamId/send
  { body, metadata: { sender_name: "Anon_XY3Z" } }
    ↓
wrappedSend():
  1. ensureRoomForExternal('stream', streamId) → create if missing
  2. policy.decideSend() → allow (public room)
  3. createMessage() → DB insert with metadata preserved
  4. Fan-out: createMessage() → global room with metadata.from_room_* set
  5. publishChatEvent() → EventBus → realtime subscribers
    ↓
201 → client polls stream history → renderMsgs()
    ↓
Global chat widget next poll sees fan-out copy in global room
```

---

## Common Issues & Root Causes

### "Messages not sending / 403"
- **Was:** `policy.js` blocked all `actor.type === 'anonymous'` sends
- **Fix:** Anonymous sends allowed for public rooms (global, stream, channel)

### "Send fails silently, user loses message"
- **Was:** `.catch(() => {})` swallowed all errors
- **Fix:** On fetch failure, message text is restored to input so user can retry

### "Sender name missing / shows UUID"
- **Was:** `wrappedSend` didn't pass `metadata: b.metadata` to `createMessage`
- **Fix:** `metadata` is now explicitly forwarded in `wrappedSend`

### "Stream chat empty on first load"
- **Was:** `wrappedHistory` used `findRoomByExternal` (returns null → `{ items: [] }` before any message sent)
- **Fix:** `wrappedHistory` now uses `ensureRoomForExternal` — room is created immediately, history returns `[]` cleanly

### "Name prompt pops up when opening chat"
- **Was:** `open()` called `enterNamingMode()` if `!myName`
- **Fix:** Name is always auto-assigned; `enterNamingMode` is now opt-in via clicking the "Chatting as X" label

### "Authorize / Sign in button does nothing on openvibe.chat"
- **Was:** `signInUrl()` built a relative `/oauth/authorize` URL, which hit the chat server (port 4800) — no OAuth there
- **Fix:** Prefix with `resolveSurfaceUrl('network')` so the URL points to the network service

### "Logging in on one page doesn't log you in on others"
- **Was:** `setSessionCookie` in `native-auth.js` cleared the `.localhost` domain cookie as migration cleanup, immediately after writing the primary `.network.localhost` cookie
- **Fix:** Write the auth token to both `.network.localhost` and `.localhost` simultaneously; do not clear either during normal login/logout

### "Stream room title shows as `stream:UUID` instead of channel name"
- **Was:** `wrappedHistory` created the room before any send with a placeholder title; `wrappedSend` found the existing room and never corrected it
- **Fix:** `setRoomTitle(room.id, req.body.room_title)` is called inside `wrappedSend` on every request; the stream page passes `room_title: ROOM_TITLE` (SSR-injected channel display name) with every send

---

## Full Chat Page (`services/openvibe-chat/public/`)

| File | Description |
|------|-------------|
| `index.html` | Full-page chat UI — room sidebar, message feed, composer, DM list, live stream rooms section |
| `overlay.html` | OBS browser-source overlay — transparent background, `?room=<id>` param, auto-fades old messages |

The overlay is served at `/overlay` and `/overlay/:roomId`.

### Multi-room sidebar & live stream rooms

`ROOM` and `ROOM_IS_STREAM` are `let` globals (not `const`). `switchRoom(roomId, label, isStream)` updates them and re-renders the active room state. `poll()` and `send()` branch on `ROOM_IS_STREAM`:

- `ROOM_IS_STREAM = false` → standard room API (`/rooms/:id/messages`)
- `ROOM_IS_STREAM = true` → wrapper API (`/stream/:id/history`, `/stream/:id/send`)

**`refreshStreamRooms()`** populates the "Live Streams" sidebar section:
1. Fetches `GET /api/v1/streams?status=live` from the live service (all active streams)
2. Fetches `GET /api/chat/rooms?room_type=stream` from the chat service (all stream rooms that have ever received a message)
3. Cross-references by `stream.id === room.external_ref_id`; renders only rooms that have a currently live stream
4. Each rendered button calls `switchRoom(room.id, room.title || stream.title, true)`
5. Refreshes every 30 seconds automatically

---

## SSE / Realtime Integration (openvibe-live)

Stream pages subscribe to SSE topics via `services/openvibe-live/public/js/realtime.js`:
```
Topics: global:live, community:pulse, stream:<streamId>, chat:stream:<streamId>
```

`chat.message.sent` events from the realtime bus are handled by `realtime.js` and appended to any `[data-chat-messages]` or `[data-stream-chat]` container in the DOM. This is a parallel real-time path; the polling-based widget is the primary source.
