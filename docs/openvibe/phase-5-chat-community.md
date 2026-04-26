# Phase 5 — openvibe-chat + openvibe-community

Phase 5 lifts every chat-, DM-, call-, TTS-, soundboard-, paste-, and
discussion-shaped surface that lived inside HoboStreamer into two new
services on the kernel:

| Service | Port | Domain |
|---|---|---|
| [services/openvibe-chat](../../services/openvibe-chat) | 4800 | rooms, DMs, messages, calls (signaling envelopes), TTS settings + queue, soundboard / external-audio queue |
| [services/openvibe-community](../../services/openvibe-community) | 4900 | spaces, categories, threads, posts, reusable comments (vods, clips, blog), pastes, Discord relay |

## openvibe-chat

Owns realtime chat surfaces. Persists everything in
`data/openvibe-chat.db` (better-sqlite3, WAL).

| Concern | Where |
|---|---|
| Schema (`chat_rooms`, `chat_participants`, `chat_messages`, `chat_call_sessions`, `chat_call_signals`, `chat_tts_settings`, `chat_audio_queue`, `chat_legacy_map`) | [services/openvibe-chat/server/db.js](../../services/openvibe-chat/server/db.js) |
| Policy seam | [services/openvibe-chat/server/policy.js](../../services/openvibe-chat/server/policy.js) |
| Model | [services/openvibe-chat/server/model.js](../../services/openvibe-chat/server/model.js) |
| Events | [services/openvibe-chat/server/events.js](../../services/openvibe-chat/server/events.js) |
| Routes | [services/openvibe-chat/server/routes.js](../../services/openvibe-chat/server/routes.js) |

Routes (auth-guarded; service callers via `X-Internal-Key` +
`X-OpenVibe-Service`):

* `GET/POST /api/chat/rooms`, `GET /api/chat/rooms/:roomId`
* `GET/POST /api/chat/rooms/:roomId/messages`
* `PUT/DELETE /api/chat/messages/:messageId`
* Compatibility wrappers (kept stable for HoboStreamer):
  * `GET/POST /api/chat/global/{history,send}`
  * `GET/POST /api/chat/stream/:streamId/{history,send}`
  * `GET/POST /api/chat/channel/:channelId/{history,send}`
* DMs: `GET/POST /api/chat/dms`, `GET/POST /api/chat/dms/:roomId/messages`
* Calls (signaling envelopes only — actual transport stays in `openvibe-live`):
  `POST /api/chat/calls`, `GET /api/chat/calls/:id`,
  `POST /api/chat/calls/:id/{accept,decline,end,signal}`,
  `GET /api/chat/calls/:id/signals`
* TTS: `GET/PUT /api/chat/tts/settings`, `GET/POST /api/chat/tts/queue`,
  `POST /api/chat/tts/{speak,skip,clear}`
* Audio queue: `GET/POST /api/chat/audio/queue`,
  `POST /api/chat/audio/{skip,clear}`,
  `POST /api/chat/audio/resolve-external` — seam for 101soundboards-style
  external audio links.

Events published on `chat.events`:
`chat.room.created`, `chat.message.{created,edited,deleted}`,
`chat.dm.created`, `chat.call.{started,ringing,accepted,declined,ended}`,
`chat.tts.{settings.updated,queued,started,completed,skipped}`,
`chat.audio.{queued,started,completed,failed}`.

### Policy summary

* **Read** — public/unlisted rooms readable by everyone (incl. anonymous);
  private rooms require participant or admin.
* **Send** — anonymous denied; archived rooms reject sends; muted/blocked
  participants rejected.
* **Edit/Delete** — author or admin.
* **TTS settings ownership** — only the owner actor or an admin/service can
  view/mutate.
* **Calls** — only call participants can read signals or transition state.

### Compat with HoboStreamer

The legacy URLs `/api/chat/global/*`, `/api/chat/stream/:id/*`, and
`/api/chat/channel/:id/*` accept the same shape they always did.  Internally
those endpoints `ensureRoomForExternal()` against `chat_rooms`, so the legacy
"global" / "stream:42" / "channel:7" naming is preserved as a stable
external_ref pair.

## openvibe-community

Owns shared discussion infrastructure. Persists everything in
`data/openvibe-community.db`.

| Concern | Where |
|---|---|
| Schema (`community_spaces`, `community_categories`, `community_threads`, `community_posts`, `community_pastes`, `community_attachments`, `community_discord_relays`, `community_discord_messages`, `community_legacy_map`) | [services/openvibe-community/server/db.js](../../services/openvibe-community/server/db.js) |
| Policy seam | [services/openvibe-community/server/policy.js](../../services/openvibe-community/server/policy.js) |
| Model | [services/openvibe-community/server/model.js](../../services/openvibe-community/server/model.js) |
| Events | [services/openvibe-community/server/events.js](../../services/openvibe-community/server/events.js) |
| Routes | [services/openvibe-community/server/routes.js](../../services/openvibe-community/server/routes.js) |

Routes:

* `GET/POST /api/community/spaces`, `GET/PUT /api/community/spaces/:idOrSlug`
* `GET/POST /api/community/spaces/:spaceId/categories`
* `GET/POST /api/community/threads`, `GET /api/community/threads/:idOrSlug`
* `POST /api/community/threads/:id/lock`
* `GET/POST /api/community/threads/:id/posts`,
  `PUT/DELETE /api/community/posts/:postId`
* **Reusable comments** — `GET/POST /api/community/comments?ref_type=&ref_id=`
  auto-creates a hidden thread keyed on `(ref_type, ref_id)`. Used by
  `openvibe-live` (vod / clip), future blog services, etc.
* Pastes — `GET/POST /api/community/pastes`, `GET/PUT/DELETE
  /api/community/pastes/:slug`. Legacy `/api/pastes/*` is mounted as a thin
  rewrite-into-router compatibility wrapper for HoboStreamer.
* Discord relay (admin-only manage): `GET/POST/PUT /api/community/discord/relays`,
  `POST /api/community/discord/webhook`, `GET /api/community/discord/status`.
  Loop prevention by `community_discord_messages.discord_message_id` PK.

Events published on `community.events`:
`community.space.{created,updated,archived}`, `community.category.created`,
`community.thread.{created,updated,locked,archived}`,
`community.post.{created,updated,deleted}`, `community.comment.created`,
`community.paste.{created,updated,deleted}`,
`community.discord.relay.{created,updated}`,
`community.discord.message.{imported,relayed,updated,deleted}`.

### Policy summary

* Public/unlisted threads, spaces, pastes are readable by everyone.
* Private resources require owner/admin/service identity.
* Posting requires authenticated user; locked or archived threads only
  accept admin posts.
* Edit/delete restricted to author or admin.
* Discord relay management requires admin or service identity.

### Attachments must reference media

`community_attachments` stores only `media_id` plus a target descriptor
(`attached_to_type`, `attached_to_id`). Raw paths or external URLs are not
written into the community DB — they belong to `openvibe-media` (Phase 3).

## Compatibility shims (HoboStreamer)

Inert when the corresponding URL env vars are empty.

* [server/openvibe-bridge/chat.js](../../../hobostreamer/server/openvibe-bridge/chat.js)
  — `mirrorMessage`, `getHistory`, `enqueueTts`, `enqueueAudio`, `startCall`,
  `endCall`. Activated by `OPENVIBE_CHAT_URL`.
* [server/openvibe-bridge/community.js](../../../hobostreamer/server/openvibe-bridge/community.js)
  — `mirrorPaste`, `getPaste`, `listComments`, `postComment`,
  `importDiscordMessage`. Activated by `OPENVIBE_COMMUNITY_URL`.

Both bridges share `OPENVIBE_INTERNAL_KEY` / `INTERNAL_API_KEY` and tag
themselves as `OPENVIBE_SERVICE_NAME` (default `hobostreamer`). They never
throw — failures are logged via `console.warn` so legacy paths keep working.

## Acceptance — Phase 5 ✅

* [x] Both services boot to `GET /health` returning `{ ok: true }`
* [x] `node --check` passes for every new file
* [x] Smoke test scripts (`test/{chat,community}-smoke.test.js`) exercise the
  model + policy in-process and pass
* [x] Live `POST /api/chat/rooms`, `POST /api/community/spaces`, `POST
  /api/community/threads`, and legacy `POST /api/pastes` all return 201 with
  the canonical resource shape
* [x] Each service published a Phase 5 lifecycle event on its respective
  topic during boot smoke (verified via `[EventsClient] publish ...` log
  lines; backbone DLQ would receive these in production)
* [x] Compatibility shims at `hobostreamer/server/openvibe-bridge/{chat,community}.js`
  remain inert when env vars are empty
