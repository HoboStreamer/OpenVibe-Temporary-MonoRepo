# Legacy chat + paste migration

How HoboStreamer's pre-Phase-5 chat history and pastes can be migrated into
`openvibe-chat` and `openvibe-community` without losing references.

## Chat history

For each row in HoboStreamer's chat tables (`chat_messages`,
`stream_chat_*`, `dm_*`):

1. Determine the canonical `(external_ref_type, external_ref_id)` —
   `('global', 'global')` for global chat, `('stream', streamId)` for live
   stream rooms, `('channel', channelSlug)` for channels.
2. `POST /api/chat/global/send` (or `/stream/:id/send` / `/channel/:id/send`)
   with `{ body, sender_type, sender_id, legacy_source: 'hobostreamer',
   legacy_id: <legacy row id> }`.
3. The chat service `ensureRoomForExternal()` will lazily create the
   matching `chat_rooms` row and insert the message preserving
   `legacy_source` / `legacy_id`.
4. Optional: `recordLegacyMap({ source: 'hobostreamer', kind: 'message',
   legacy_id, new_id })` (model-level helper) so old client links resolve.

DMs migrate by:

1. `POST /api/chat/dms { target_actor_type: 'user', target_actor_id: <them> }`
   while authenticated as the historical sender. The room is order-
   independent so you can run the script for either side.
2. `POST /api/chat/dms/:roomId/messages` per historical row.

## TTS / audio queue

In-flight queue items are not migrated (they're transient). User TTS
preferences migrate via `PUT /api/chat/tts/settings` keyed on the user id.

## Pastes

For each row in HoboStreamer's `pastes` table:

1. `POST /api/community/pastes { slug, title, body, language, visibility,
   created_at }`. The community service preserves the requested slug when
   unique and auto-suffixes collisions.
2. Persist `(source='hobostreamer', kind='paste', legacy_id=<old slug>,
   new_id=<new paste id>)` in `community_legacy_map` so the legacy
   `/api/pastes/:slug` compatibility URL keeps resolving even if the slug
   was rewritten.
3. The HTTP-level legacy mount `/api/pastes/*` proxies into the same
   community router, so callers that hardcoded the old URL keep working
   without code changes.

## Comments on VODs / clips

If HoboStreamer ever stored VOD/clip comments locally, migrate them by
posting to `/api/community/comments { ref_type: 'vod', ref_id, body,
author_type, author_id }`. The reusable comment-thread mechanism will
auto-create the backing thread on the first call and re-use it on every
subsequent comment for the same `ref_id`.

## Cutover ordering

1. Stand up `openvibe-chat` + `openvibe-community` (this phase).
2. Run the migration script(s) above against both services.
3. Set `OPENVIBE_CHAT_URL` and `OPENVIBE_COMMUNITY_URL` in HoboStreamer; the
   bridges in `server/openvibe-bridge/{chat,community}.js` start mirroring
   new writes.
4. After at least one full duty cycle without errors, flip read paths to
   the new services.
5. Keep the legacy local tables read-only as a safety net for one release;
   then drop after consumers are confirmed migrated.
