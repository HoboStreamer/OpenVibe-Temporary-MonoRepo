# openvibe-chat — service reference

Centralized chat / DM / call signaling / TTS / audio-queue service.

* **Port:** 4800
* **DB:** SQLite WAL at `DB_PATH` (default `./data/openvibe-chat.db`)
* **Auth:** `X-Internal-Key` + `X-OpenVibe-Service` for service callers; user
  Bearer / cookie for end-users; anonymous = read-only on public rooms

See the route catalog and policy summary in
[phase-5-chat-community.md](./phase-5-chat-community.md).

## Schema

| Table | Purpose |
|---|---|
| `chat_rooms` | global / stream / channel / dm / call rooms with `external_ref_(type,id)` for cross-service linking |
| `chat_participants` | role per (room, actor); composite PK |
| `chat_messages` | message history with `legacy_source` / `legacy_id` for migration cross-ref |
| `chat_call_sessions` | call lifecycle records (status: ringing / active / declined / ended) |
| `chat_call_signals` | sequenced WebRTC-style signal envelopes (offer/answer/candidate/etc) |
| `chat_tts_settings` | per-owner TTS preferences (synthesized defaults if no row) |
| `chat_audio_queue` | unified TTS + soundboard + external-audio queue |
| `chat_legacy_map` | (source, kind, legacy_id) → new_id |

## SDK usage

```js
const { ChatClient } = require('@openvibe/sdk');
const chat = new ChatClient({
  chatUrl: 'http://127.0.0.1:4800',
  internalKey: process.env.OPENVIBE_INTERNAL_KEY,
  service: 'openvibe-live',
});
await chat.sendMessage(roomId, { body: 'hi' });
```

## TTS defaults

When no `chat_tts_settings` row exists for an owner the model returns the
service-wide defaults (`config.ttsDefaults`) with the synthetic flag
`_defaults: true`. This lets clients distinguish "owner has explicit prefs"
from "owner is using fallback".

## External audio resolution seam

`POST /api/chat/audio/resolve-external` accepts `{ external_url, owner_*,
provider }` and enqueues a `queue_type='soundboard'` row. Resolution to
playable bytes is delegated to a downstream player or future provider
plugin — no fetch is made from the chat service itself, so 101soundboards
and equivalents stay outside the kernel.
