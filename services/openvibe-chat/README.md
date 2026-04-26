# openvibe-chat

OpenVibe Phase 5 shared communication platform. Owns canonical state for
rooms, DMs, calls, TTS, soundboard / audio queues, and chat overlays. Consumed
by `openvibe-live` for stream chat and by HoboStreamer compat adapters during
migration.

## Runtime

* Node >=18, CommonJS, Express 4, better-sqlite3.
* Default port `4800`.
* Service-to-service auth: `X-Internal-Key` + `X-OpenVibe-Service`.

## Tables (created on boot)

* `chat_rooms`, `chat_participants`, `chat_messages`
* `chat_call_sessions`, `chat_call_signals`
* `chat_tts_settings`, `chat_audio_queue`
* `chat_legacy_map`

## Events

Published on `chat.events` topic via `openvibe-events`.
See `@openvibe/contracts/chat-events.js`.

## Routes

See `server/routes.js`. Highlights:

* `POST /api/chat/rooms`, `GET /api/chat/rooms/:roomId/messages`
* `POST /api/chat/rooms/:roomId/messages`
* `GET/POST /api/chat/dms`
* `POST /api/chat/calls`, `POST /api/chat/calls/:id/{accept,decline,end,signal}`
* `GET/PUT /api/chat/tts/settings`
* `POST /api/chat/tts/queue`, `POST /api/chat/audio/queue`
* HoboStreamer compatibility shims under
  `/api/chat/global/*`, `/api/chat/stream/:streamId/*`, `/api/chat/channel/:channelId/*`.

## Tests

```
npm test
```
