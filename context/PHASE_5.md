
Treat the current workspace as the active OpenVibe migration workspace. Do not fetch external repository URLs. Do not assume old Hobo repos are authoritative long-term destinations. The legacy Hobo repos are migration/reference sources under `HoboReposToMigrateFrom/`; new OpenVibe code should be created or evolved in the current workspace’s OpenVibe structure, following whatever Phase 1, Phase 2, Phase 3, and Phase 4 already established.

Analyze #file:PLAN.md to gain an in depth detailed understanding of the architecture and plans to continue migrating/editing/merging the `HoboStreamer.com` folder and the `HoboApp` monorepo folder based on the planning/memories for "OpenVibe" ( these plans were generated from a conversation with ChatGPT which can be seen in #file:PLANNING_CONVERSATION.md )

Analyze the #codebase then confirm the exact scope from the current OpenVibe migration plan before editing anything. You have already finished integrating/implementing Phase 1, Phase 2, Phase 3, and Phase 4 ( #file:PHASE_1_AND_2.md and #phase_232 ) within the `openvibe` folder in this workspace.

Analyze the #codebase then complete OpenVibe Phase 5 end-to-end inside the current workspace.

Do not fetch external repository URLs. Do not mention or depend on any temporary repository URL. Treat the current VS Code workspace as the active OpenVibe migration workspace. The legacy Hobo source trees under `HoboReposToMigrateFrom/` are migration/reference sources only; new canonical OpenVibe implementation should live in the OpenVibe service/package structure already established in this workspace.

Important context:
- Phase 1 and Phase 2 are complete: OpenVibe kernel/control-plane foundations should already exist.
- Phase 3 is complete: `openvibe-media` should already exist.
- Phase 4 is complete: `openvibe-live`, `openre-stream`, and stream/media/restream integration should already exist.
- I just added/updated `openre-stream`, `openvibe-live`, and `openvibe-media`, so Phase 5 must integrate with those actual services instead of recreating them.
- Phase 5 = `openvibe-chat` + `openvibe-community`.

Primary Phase 5 goals:

1. Build/evolve `openvibe-chat` as the shared OpenVibe communication platform.
2. Build/evolve `openvibe-community` as the shared forum/discussion/social/Discord-relay/paste platform.
3. Migrate/bridge legacy HoboStreamer chat, DMs, voice/cam calls, TTS/audio queues, soundboards, chat overlays, pastes, comments, and discussion surfaces into the new OpenVibe services.
4. Integrate with the completed Phase 1–4 systems:
   - OpenVibe auth/control plane
   - OpenVibe events
   - OpenVibe user modules
   - OpenVibe service registry
   - OpenVibe capability registry
   - OpenVibe contract registry
   - OpenVibe policy engine
   - OpenVibe SDK/contracts packages
   - `openvibe-media`
   - `openvibe-live`
   - `openre-stream`
5. Preserve legacy HoboStreamer behavior through adapters/wrappers until later cleanup phases.
6. Implement usable, intuitive, user-testable UI/API flows, not only backend tables.

Do not stop at planning. Implement the code.

---

# 0. Confirmatory analysis before edits

Before changing files, inspect the actual current workspace and report what exists.

First inspect these root/current OpenVibe files or directories if present:

- #file:README.md
- #file:PLAN.md
- #file:package.json
- #file:docs
- #file:packages
- #file:services
- #file:apps
- #file:openvibe-network
- #file:openvibe-events
- #file:openvibe-media
- #file:openvibe-live
- #file:openre-stream
- #file:openvibe-chat
- #file:openvibe-community

Then inspect these legacy migration sources if present:

- #file:HoboReposToMigrateFrom/HoboStreamer.com/README.md
- #file:HoboReposToMigrateFrom/HoboStreamer.com/docs/broadcasting.md
- #file:HoboReposToMigrateFrom/HoboStreamer.com/server
- #file:HoboReposToMigrateFrom/HoboStreamer.com/server/index.js
- #file:HoboReposToMigrateFrom/HoboStreamer.com/server/config.js
- #file:HoboReposToMigrateFrom/HoboStreamer.com/server/db/schema.sql
- #file:HoboReposToMigrateFrom/HoboStreamer.com/public
- #file:HoboReposToMigrateFrom/HoboApp/README.md
- #file:HoboReposToMigrateFrom/HoboApp/hobo-tools/README.md
- #file:HoboReposToMigrateFrom/HoboApp/hobo-tools/server/index.js
- #file:HoboReposToMigrateFrom/HoboApp/hobo-tools/server/config.js
- #file:HoboReposToMigrateFrom/HoboApp/hobo-tools/server/db/database.js
- #file:HoboReposToMigrateFrom/HoboApp/hobo-tools/server/discord
- #file:HoboReposToMigrateFrom/HoboApp/packages

Then search #codebase for the actual Phase 1–4 implementations and inspect the exact files before editing:

- event backbone
- user modules
- service registry
- capability registry
- contract registry
- policy engine
- OpenVibe auth/control-plane compatibility layer
- OpenVibe SDK/contracts packages
- `openvibe-media`
- `openvibe-live`
- `openre-stream`
- legacy HoboStreamer compatibility adapters
- admin/internal diagnostics surfaces

Before editing, report:

1. Where the event infrastructure currently lives.
2. Where user modules, service registry, capabilities, contracts, and policy enforcement currently live.
3. Where `openvibe-media`, `openvibe-live`, and `openre-stream` currently live.
4. Which APIs/events/capabilities those services already expose.
5. Which files currently own legacy:
   - global chat
   - stream chat
   - chat history
   - chat overlays
   - DMs
   - voice/cam calls
   - call WebSocket signaling
   - TTS settings
   - TTS queue
   - soundboard/audio queue behavior
   - 101soundboards/external audio behavior, if present
   - media/song requests tied to chat/audio
   - pastes
   - comments/discussions
   - Discord relay/integration
6. Which old routes/WebSockets must remain compatibility adapters.
7. The exact files to edit/create.

Only after this confirmatory analysis should you implement.

---

# 1. Service boundaries for Phase 5

## 1.1 `openvibe-chat` owns

`openvibe-chat` is the cross-platform realtime communication service.

It should own canonical OpenVibe state for:

- global chat rooms
- stream/channel chat rooms
- community chat rooms where needed
- direct messages
- group DMs, at least scaffolded if not fully UI-complete
- chat history
- message moderation lifecycle hooks
- chat overlays/widgets
- room presence
- typing/activity state if practical
- voice/cam room metadata
- user-to-user call invites
- streamer-to-viewer call invites
- call session records
- call signaling API/WebSocket adapters
- streamer TTS manager
- TTS queue
- shared audio playback queue
- soundboard queue
- external audio resolution seam, including 101soundboards-style integrations
- media request audio queue integration seam
- reusable chat/call/TTS capabilities
- SDK/client helpers for embedding chat, calls, overlays, and TTS controls

`openvibe-chat` should not own:

- stream/VOD storage
- billing ledger
- tips/subscription accounting
- generic forum threads
- generic paste storage
- Discord source-of-truth archives
- OpenVibe identity

It should integrate with `openvibe-media`, `openvibe-live`, `openre-stream`, the OpenVibe event system, and the OpenVibe control plane.

## 1.2 `openvibe-community` owns

`openvibe-community` is the social/forum/discussion/Discord-relay/paste service.

It should own canonical OpenVibe state for:

- community spaces
- forums/categories
- discussion threads
- posts/replies/comments
- lightweight social feed foundations
- community moderation events
- paste migration target
- paste listing/viewing/creating/editing/deleting
- paste attachments through `openvibe-media`
- image/file attachment references through `openvibe-media`
- Discord relay mappings
- Discord channel-to-community mappings
- Discord-origin posts/messages with source tags
- anti-loop relay metadata
- reusable comment/thread capabilities for other services
- embeddable discussion widgets

`openvibe-community` should not own:

- realtime chat voice/calls/TTS queues
- billing ledger
- generic media object storage
- core identity
- AI/wiki/blog/news product content

It should integrate with `openvibe-media`, `openvibe-live`, future content products, the OpenVibe event system, and the OpenVibe control plane.

---

# 2. Implement or evolve `openvibe-chat`

If `openvibe-chat` already exists, evolve it.
If it does not exist, create it in the same service/app pattern used by `openvibe-live`, `openvibe-media`, and `openre-stream`.

Do not invent a new framework.

## 2.1 Data model

Implement safe additive migrations/storage for chat.

Minimum canonical models:

### Chat rooms

Support fields equivalent to:

- `id`
- `room_type`
  - `global`
  - `stream`
  - `channel`
  - `community`
  - `dm`
  - `group_dm`
  - `call`
  - `system`
- `external_ref_type`
  - `stream`
  - `channel`
  - `community`
  - `user`
  - `legacy_hobostreamer`
- `external_ref_id`
- `title`
- `visibility`
  - `public`
  - `unlisted`
  - `private`
  - `restricted`
- `owner_type`
- `owner_id`
- `created_by`
- `created_at`
- `updated_at`
- `archived_at`
- `metadata_json`

### Chat participants

Support fields equivalent to:

- `room_id`
- `actor_type`
- `actor_id`
- `role`
  - `owner`
  - `mod`
  - `speaker`
  - `participant`
  - `viewer`
  - `blocked`
- `joined_at`
- `last_seen_at`
- `muted_until`
- `metadata_json`

### Chat messages

Support fields equivalent to:

- `id`
- `room_id`
- `sender_type`
- `sender_id`
- `message_type`
  - `text`
  - `system`
  - `tts`
  - `soundboard`
  - `media_request`
  - `call_invite`
  - `tip_alert`
  - `moderation`
- `body`
- `rich_payload_json`
- `reply_to_message_id`
- `legacy_source`
- `legacy_id`
- `created_at`
- `edited_at`
- `deleted_at`
- `moderation_status`
- `metadata_json`

### DMs

Implement DMs as chat rooms with `room_type = dm` where practical.

Support:

- find-or-create DM room
- list DMs for current user
- send/list messages
- last-read/unread if existing patterns make it easy

### Call sessions

Support fields equivalent to:

- `id`
- `room_id`
- `call_type`
  - `voice`
  - `video`
  - `screen`
  - `mixed`
- `status`
  - `pending`
  - `ringing`
  - `active`
  - `ended`
  - `missed`
  - `declined`
  - `failed`
- `started_by`
- `target_actor_type`
- `target_actor_id`
- `started_at`
- `answered_at`
- `ended_at`
- `metadata_json`

### TTS settings

Support fields equivalent to:

- `owner_type`
  - `user`
  - `channel`
  - `stream`
  - `service`
- `owner_id`
- `tts_enabled`
- `read_chat`
- `read_tips`
- `read_redemptions`
- `voice`
- `volume`
- `rate`
- `pitch`
- `max_length`
- `min_tip_amount`
- `filter_links`
- `filter_emotes`
- `queue_limit`
- `metadata_json`

### Audio queue

Support fields equivalent to:

- `id`
- `owner_type`
- `owner_id`
- `queue_type`
  - `tts`
  - `soundboard`
  - `media_request`
  - `alert`
  - `system`
- `status`
  - `queued`
  - `playing`
  - `played`
  - `skipped`
  - `failed`
  - `cancelled`
- `priority`
- `source_type`
  - `chat`
  - `tip`
  - `manual`
  - `soundboard`
  - `external_url`
  - `media`
- `source_id`
- `requested_by`
- `text`
- `audio_url`
- `media_id`
- `external_provider`
- `external_url`
- `playback_json`
- `created_at`
- `started_at`
- `finished_at`
- `metadata_json`

Use the existing DB/migration style found in the workspace. Do not destructively rename legacy tables.

## 2.2 APIs

Implement REST APIs using the existing service route patterns.

Minimum APIs:

### Rooms/messages

- `GET /api/chat/rooms`
- `POST /api/chat/rooms`
- `GET /api/chat/rooms/:roomId`
- `GET /api/chat/rooms/:roomId/messages`
- `POST /api/chat/rooms/:roomId/messages`
- `PUT /api/chat/messages/:messageId`
- `DELETE /api/chat/messages/:messageId`

### Global/stream/channel compatibility

- `GET /api/chat/global/history`
- `POST /api/chat/global/send`
- `GET /api/chat/stream/:streamId/history`
- `POST /api/chat/stream/:streamId/send`
- `GET /api/chat/channel/:channelId/history`
- `POST /api/chat/channel/:channelId/send`

### DMs

- `GET /api/chat/dms`
- `POST /api/chat/dms`
- `GET /api/chat/dms/:roomId/messages`
- `POST /api/chat/dms/:roomId/messages`

### Calls

- `POST /api/chat/calls`
- `GET /api/chat/calls/:callId`
- `POST /api/chat/calls/:callId/accept`
- `POST /api/chat/calls/:callId/decline`
- `POST /api/chat/calls/:callId/end`
- `POST /api/chat/calls/:callId/signal`

### TTS/audio

- `GET /api/chat/tts/settings`
- `PUT /api/chat/tts/settings`
- `GET /api/chat/tts/queue`
- `POST /api/chat/tts/queue`
- `POST /api/chat/tts/speak`
- `POST /api/chat/tts/skip`
- `POST /api/chat/tts/clear`
- `GET /api/chat/audio/queue`
- `POST /api/chat/audio/queue`
- `POST /api/chat/audio/skip`
- `POST /api/chat/audio/clear`
- `POST /api/chat/audio/resolve-external`

Adjust route prefixes to match the workspace’s conventions, but preserve compatibility wrappers for old HoboStreamer routes.

## 2.3 Realtime and WebSocket behavior

Implement/evolve realtime support for:

- room subscriptions
- message fanout
- presence updates
- DM updates
- call signaling
- TTS/audio queue updates
- overlay/widget updates
- moderation events

Requirements:

- authenticate through OpenVibe auth/control plane
- allow anonymous/public behavior only where policy permits
- server validates room access before subscribe/send/fanout
- server validates sender identity before message persistence/fanout
- server validates call participants before signaling fanout
- persisted state must happen before fanout where correctness matters
- event bus should be used for cross-service/system events
- no client-trusted room membership, call permission, TTS ownership, or moderation permission

If legacy HoboStreamer still owns WebSocket paths, add compatibility bridges/adapters rather than removing old paths.

## 2.4 Events

Publish through the existing Phase 1 event backbone.

Required event types:

- `chat.room.created`
- `chat.room.updated`
- `chat.participant.joined`
- `chat.participant.left`
- `chat.message.created`
- `chat.message.edited`
- `chat.message.deleted`
- `chat.message.moderated`
- `chat.dm.created`
- `chat.call.started`
- `chat.call.ringing`
- `chat.call.accepted`
- `chat.call.declined`
- `chat.call.ended`
- `chat.tts.settings.updated`
- `chat.tts.queued`
- `chat.tts.started`
- `chat.tts.completed`
- `chat.tts.skipped`
- `chat.audio.queued`
- `chat.audio.started`
- `chat.audio.completed`
- `chat.audio.failed`

Events should include:

- event type/version
- trace_id if supported
- room_id
- actor/sender
- source service
- related stream/channel/community refs
- sanitized payload

## 2.5 Capabilities/contracts

Register/add contracts for:

- `chat.room.create`
- `chat.room.join`
- `chat.room.leave`
- `chat.message.send`
- `chat.message.edit`
- `chat.message.delete`
- `chat.dm.open`
- `chat.call.start`
- `chat.call.signal`
- `chat.call.end`
- `chat.tts.settings.update`
- `chat.tts.enqueue`
- `chat.tts.skip`
- `chat.tts.clear`
- `chat.audio.enqueue`
- `chat.audio.skip`
- `chat.audio.clear`
- `chat.overlay.render`

Update existing OpenVibe SDK/contracts packages with:

- chat room types
- message types
- participant types
- DM helpers
- call session types
- TTS settings types
- audio queue types
- event contracts
- capability names
- client helpers where current package patterns support them

## 2.6 Integration with `openvibe-live`

Integrate with the existing `openvibe-live` service from Phase 4.

Requirements:

- live stream pages embed or call into `openvibe-chat` for stream chat
- live stream pages use `openvibe-chat` for overlay/widget data
- streamer dashboard uses `openvibe-chat` for TTS/audio queue manager
- streamer can call a viewer through `openvibe-chat`
- viewer call invite state is delivered through `openvibe-chat`
- old HoboStreamer chat overlay URLs remain usable through wrapper/redirect/proxy
- TTS/audio settings are not duplicated as long-term `openvibe-live` state
- `openvibe-live` should consume chat events and APIs, not own canonical chat state

Do not implement full `openvibe.tips` billing in Phase 5. Only create clean event/capability seams for future monetized interactions.

## 2.7 Integration with `openvibe-media`

Audio and attachments must use the Phase 3 media service where appropriate.

Requirements:

- audio queue items can reference `media_id`
- soundboard/custom audio assets can reference `media_id`
- chat attachments can reference `media_id`
- legacy raw URLs/local paths may be wrapped for compatibility, but new OpenVibe records should prefer media IDs
- do not duplicate media object storage in `openvibe-chat`

## 2.8 Integration with `openre-stream`

Only integrate where relevant:

- stream-call invitations can reference stream IDs produced by `openre-stream`/`openvibe-live`
- stream chat rooms should map cleanly to OpenVibe stream IDs
- restream mirror streams should still be able to get an associated OpenVibe chat room

Do not move ingest/restream code into `openvibe-chat`.

## 2.9 Legacy HoboStreamer chat compatibility

Inspect all legacy chat/DM/call/TTS/audio routes and WebSocket handlers.

Preserve old behavior with adapters:

- old REST endpoints should delegate to `openvibe-chat` where possible
- old WS paths should bridge/proxy or continue working against new persistence APIs
- old chat overlay URLs should still render or redirect safely
- old admin routes for chat/TTS should still work or show migration-aware wrappers
- old docs should be updated to mention OpenVibe migration state

Do not remove legacy endpoints yet.

---

# 3. Implement or evolve `openvibe-community`

If `openvibe-community` already exists, evolve it.
If it does not exist, create it in the same service/app pattern used by the current OpenVibe services.

## 3.1 Data model

Implement safe additive migrations/storage for community.

Minimum canonical models:

### Spaces/communities

Support fields equivalent to:

- `id`
- `slug`
- `name`
- `description`
- `visibility`
  - `public`
  - `unlisted`
  - `private`
  - `restricted`
- `owner_type`
- `owner_id`
- `created_by`
- `created_at`
- `updated_at`
- `archived_at`
- `metadata_json`

### Categories/forums

Support fields equivalent to:

- `id`
- `community_id`
- `slug`
- `name`
- `description`
- `sort_order`
- `created_at`
- `updated_at`

### Threads

Support fields equivalent to:

- `id`
- `community_id`
- `category_id`
- `slug`
- `title`
- `thread_type`
  - `discussion`
  - `question`
  - `announcement`
  - `paste`
  - `discord_relay`
  - `system`
- `status`
  - `open`
  - `locked`
  - `archived`
  - `deleted`
- `visibility`
- `created_by`
- `last_activity_at`
- `created_at`
- `updated_at`
- `metadata_json`

### Posts/replies/comments

Support fields equivalent to:

- `id`
- `thread_id`
- `parent_post_id`
- `author_type`
- `author_id`
- `body`
- `body_format`
  - `markdown`
  - `plain`
  - `html_sanitized`
  - `code`
- `source_type`
  - `openvibe`
  - `discord`
  - `legacy_paste`
  - `legacy_comment`
  - `system`
- `source_id`
- `edited_at`
- `deleted_at`
- `created_at`
- `metadata_json`

### Pastes

Support either a dedicated paste table or `thread_type = paste` with paste-specific metadata.

Minimum features:

- slug
- title
- content/body
- syntax/language
- visibility
- expiry/expires_at
- created_by
- media attachment IDs
- legacy source mapping
- view count if existing behavior supports it

### Attachments

Attachments must reference `openvibe-media` media IDs.

Support fields equivalent to:

- `id`
- `post_id` or `thread_id`
- `media_id`
- `attachment_type`
- `sort_order`
- `created_at`

Do not store raw files in community tables.

### Discord relay mappings

Support fields equivalent to:

- `id`
- `community_id`
- `discord_guild_id`
- `discord_channel_id`
- `openvibe_category_id`
- `openvibe_thread_id`
- `relay_direction`
  - `discord_to_openvibe`
  - `openvibe_to_discord`
  - `bidirectional`
- `enabled`
- `last_synced_at`
- `metadata_json`

### Discord message mappings

Support fields equivalent to:

- `discord_message_id`
- `discord_channel_id`
- `openvibe_post_id`
- `openvibe_thread_id`
- `relay_direction`
- `created_at`
- `metadata_json`

Required:

- source tags
- loop prevention
- edit/delete mapping where practical
- mock/local webhook validation that does not require production Discord credentials

## 3.2 APIs

Implement REST APIs using the existing service route patterns.

Minimum APIs:

### Spaces

- `GET /api/community/spaces`
- `POST /api/community/spaces`
- `GET /api/community/spaces/:spaceIdOrSlug`
- `PUT /api/community/spaces/:spaceIdOrSlug`
- `DELETE /api/community/spaces/:spaceIdOrSlug`

Deletion should be soft-delete/archive only.

### Categories

- `GET /api/community/spaces/:spaceId/categories`
- `POST /api/community/spaces/:spaceId/categories`
- `PUT /api/community/categories/:categoryId`
- `DELETE /api/community/categories/:categoryId`

### Threads/posts

- `GET /api/community/threads`
- `POST /api/community/threads`
- `GET /api/community/threads/:threadIdOrSlug`
- `PUT /api/community/threads/:threadId`
- `DELETE /api/community/threads/:threadId`
- `GET /api/community/threads/:threadId/posts`
- `POST /api/community/threads/:threadId/posts`
- `PUT /api/community/posts/:postId`
- `DELETE /api/community/posts/:postId`

Thread/post deletion should be soft-delete/archive where practical.

### Reusable comments/discussions for other services

Implement reusable comment/thread APIs:

- `GET /api/community/comments?ref_type=&ref_id=`
- `POST /api/community/comments`
- `GET /api/community/embed/thread?ref_type=&ref_id=`

These APIs should allow `openvibe-live`, and later `openvibe-blog`, `openvibe-wiki`, `openvibe-news`, `openvibe-reviews`, and other services to embed discussion without owning comment tables.

### Pastes

- `GET /api/community/pastes`
- `POST /api/community/pastes`
- `GET /api/community/pastes/:slug`
- `PUT /api/community/pastes/:slug`
- `DELETE /api/community/pastes/:slug`

Compatibility routes should preserve old HoboStreamer paste behavior where practical:

- old `GET /api/pastes`
- old `POST /api/pastes`
- old `GET /api/pastes/:slug`

Old routes should delegate to `openvibe-community`.

### Discord relay

- `GET /api/community/discord/relays`
- `POST /api/community/discord/relays`
- `PUT /api/community/discord/relays/:relayId`
- `DELETE /api/community/discord/relays/:relayId`
- `POST /api/community/discord/webhook`
- `POST /api/community/discord/sync`
- `GET /api/community/discord/status`

Use existing HoboTools Discord service/config patterns where practical. Do not duplicate secrets or bot config if a usable config source already exists.

## 3.3 Events

Publish through the existing Phase 1 event backbone.

Required event types:

- `community.space.created`
- `community.space.updated`
- `community.space.archived`
- `community.category.created`
- `community.thread.created`
- `community.thread.updated`
- `community.thread.locked`
- `community.thread.archived`
- `community.post.created`
- `community.post.updated`
- `community.post.deleted`
- `community.comment.created`
- `community.paste.created`
- `community.paste.updated`
- `community.paste.deleted`
- `community.discord.relay.created`
- `community.discord.relay.updated`
- `community.discord.message.imported`
- `community.discord.message.relayed`
- `community.discord.message.updated`
- `community.discord.message.deleted`

Events should include:

- event type/version
- trace_id if supported
- community_id
- thread_id/post_id/paste_id where relevant
- actor/source
- source service
- sanitized payload

## 3.4 Capabilities/contracts

Register/add contracts for:

- `community.space.create`
- `community.category.create`
- `community.thread.create`
- `community.thread.lock`
- `community.post.create`
- `community.post.delete`
- `community.comment.attach`
- `community.paste.create`
- `community.paste.update`
- `community.discord.relay.configure`
- `community.discord.message.import`

Update OpenVibe SDK/contracts packages with:

- community types
- space/forum/category types
- thread types
- post/comment types
- paste types
- Discord relay types
- event contracts
- capability names
- client helpers where current package patterns support them

## 3.5 Integration with `openvibe-media`

All paste/image/file attachments must use `openvibe-media`.

Requirements:

- new paste attachments store media IDs
- uploaded images/files go through media upload init/complete
- legacy paste/image URLs are mapped or wrapped
- community tables do not store raw uploaded file paths as canonical OpenVibe state
- media namespaces include or register:
  - `community.pastes`
  - `community.attachments`

## 3.6 Integration with `openvibe-live`

Integrate where Phase 4 expects discussion/comment features:

- live channels can link to a community space
- stream pages can embed discussion/comments through `openvibe-community`
- VOD/clip pages can use reusable community comments where practical
- old HoboStreamer comments should migrate/bridge toward community posts/comments

Do not move stream chat into `openvibe-community`; stream chat belongs to `openvibe-chat`.

## 3.7 Discord relay

Use existing HoboTools Discord patterns if present.

Implement:

- Discord channel to OpenVibe space/category/thread mapping
- inbound Discord message import to posts
- source tagging
- loop prevention
- optional bidirectional relay seam
- message edit/delete mapping where practical
- diagnostics for failed relay/import
- admin/internal status endpoints
- local mock webhook validation path

Do not require production Discord credentials for local dev.

## 3.8 Legacy HoboStreamer pastes/comments compatibility

Inspect legacy paste/comment routes and data structures.

Implement:

- compatibility adapters for old paste APIs
- compatibility adapters for old comment APIs where practical
- optional idempotent backfill script for old pastes/comments into community tables
- no destructive deletion of old paste/comment data
- docs for migration state

---

# 4. Cross-service integration requirements

## 4.1 Service registry

Register or document registrations for:

- `openvibe-chat`
- `openvibe-community`

Each registration should declare:

- public URL
- internal URL
- capabilities
- events produced/consumed
- namespaces
- health endpoint
- dependency on auth/events/media/live where relevant

## 4.2 Health endpoints

Add health/status endpoints following current service patterns:

- `GET /health` or equivalent for `openvibe-chat`
- `GET /health` or equivalent for `openvibe-community`

Include:

For chat:
- DB status
- event service status if practical
- websocket/call subsystem status if practical
- media dependency status if practical

For community:
- DB status
- event service status if practical
- media dependency status if practical
- Discord relay status if practical

## 4.3 User modules

Use user modules only for user-owned/profile/preference state.

Potential namespaces:

- `chat.preferences`
- `chat.presence_prefs`
- `chat.dm_settings`
- `chat.tts_defaults`
- `community.profile`
- `community.preferences`
- `community.reputation`

Do not store high-volume chat messages, posts, or Discord relay payloads in user modules.

## 4.4 Policy enforcement

Use the existing Phase 1/2 policy engine or permission seam.

Enforce server-side:

- room visibility
- room membership
- DM participant access
- call participant access
- message send/edit/delete permissions
- TTS/audio queue ownership
- community space visibility
- thread/post create/edit/delete permissions
- paste create/edit/delete permissions
- Discord relay admin permissions
- media attachment permissions

No client-only enforcement.

## 4.5 Admin/internal diagnostics

If current admin/control-plane surfaces exist, add lightweight hooks/pages/endpoints for:

Chat:

- room lookup
- message lookup
- DM lookup
- active call sessions
- TTS/audio queue state
- failed audio resolution jobs
- moderation search

Community:

- spaces/forums
- threads/posts
- paste search
- Discord relay mappings/status
- failed relay imports

Keep it lightweight and useful. Do not rewrite the whole admin app.

---

# 5. Frontend/UI requirements

Implement minimal usable UI or integration points matching current workspace patterns.

For `openvibe-chat`:

- global chat page or panel
- stream chat widget/overlay consumable by `openvibe-live`
- DM list/message view if practical
- call invite/start/accept/decline/end controls if practical
- streamer TTS/audio queue manager
- soundboard/audio queue manager surface
- compatibility route or redirect for old HoboStreamer chat overlay URLs

For `openvibe-community`:

- spaces list
- space detail
- category/thread list
- thread detail
- post/reply composer
- paste list/detail/create
- Discord relay status/config surface if admin pattern exists
- embeddable comments/discussion widget

Prioritize user-testable end-to-end flows over perfect polish.

---

# 6. Optional migration/backfill scripts

If legacy data structures are clear enough, add idempotent migration scripts for:

- legacy chat room/message metadata where safe
- legacy DMs where safe
- legacy TTS/audio queue settings where safe
- legacy pastes
- legacy comments

Rules:

- no destructive changes
- idempotent by legacy source/id
- log skipped/failed rows
- support dry-run mode
- document how to run locally
- do not require production access

---

# 7. Documentation requirements

Update or create Phase 5 docs.

Suggested docs if the workspace uses `docs/openvibe`:

- `docs/openvibe/phase-5-chat-community.md`
- `docs/openvibe/chat-service.md`
- `docs/openvibe/community-service.md`
- `docs/openvibe/legacy-chat-pastes-migration.md`

Docs must cover:

- service boundaries
- how legacy HoboStreamer chat/calls/TTS/pastes/comments map into OpenVibe
- how `openvibe-live` embeds/uses `openvibe-chat`
- how `openvibe-community` provides comments/discussions to `openvibe-live`
- how Discord relay works
- how media attachments use `openvibe-media`
- env vars/config keys
- local development
- manual validation
- deferred work

Update root/phase docs if they already exist from Phases 1–4.

---

# 8. Tests/checks

Add practical regression coverage where current test harness supports it.

At minimum:

Chat tests:

- room create/list
- send message authorization
- stream chat compatibility route
- DM create/send/list
- TTS queue enqueue/skip/clear
- audio queue enqueue/skip/clear
- call start/accept/decline/end basic flow
- event emission smoke test
- denied access test for private room/DM

Community tests:

- space create/list
- category create/list
- thread create/list
- post create/list
- paste create/get/update compatibility
- media attachment permission handoff if testable
- Discord webhook import with mock payload
- loop-prevention behavior for Discord relay
- event emission smoke test
- denied access test for private/restricted space

Cross-service tests:

- service registry declarations exist
- capability registry entries exist
- contract exports exist
- policy denies unauthorized actions
- legacy compatibility routes do not break
- `openvibe-live` can resolve/use `openvibe-chat` for stream chat
- `openvibe-live` can resolve/use `openvibe-community` comments/discussions where implemented

If no test harness exists, add the lightest practical smoke scripts and document manual validation.

Run basic checks:

- install/build/test commands already present in the workspace
- syntax checks for changed JS/TS
- service boot smoke test if practical

Do not claim tests were run unless you actually run them.

---

# 9. Migration safety rules

- Do not delete data.
- Do not destructively rename tables.
- Do not remove HoboStreamer legacy chat, call, TTS, paste, or comment routes.
- Do not break old chat overlay URLs.
- Do not break old global chat/stream chat behavior.
- Do not store media attachments as raw local paths in new community/chat records; use media IDs.
- Do not trust client-side identity, room membership, moderation permissions, call permissions, or TTS/audio ownership.
- Do not bypass Phase 1 events/capabilities/registry/policy primitives.
- Do not duplicate `openvibe-media`, `openvibe-live`, or `openre-stream` functionality.
- Do not implement billing/tips/VIP in this phase beyond clean event/capability seams.
- Do not implement the full AI/wiki/blog/news stack in this phase.
- Do not migrate games in this phase.
- Do not force production Discord credentials for local development.
- Preserve backward-compatible Hobo aliases/adapters until later cleanup phases.

---

# 10. Optional production inspection block

If local code or migration docs reveal that real production data is required for a safe backfill plan, include this optional section in your final response only; do not run it yourself.

OPTIONAL — requires explicit developer permission to run against production

Production SSH target is configured as `hobo.tools`.

Default mode is inspect-only. Suggested non-destructive commands only:

- inspect service directories
- inspect database schema
- count legacy chat message rows
- count legacy DM rows
- count legacy paste rows
- count legacy comment rows
- inspect Discord relay config names without printing secrets
- inspect TTS/media request/audio queue table names/counts
- inspect config/env variable names without printing secret values

Before any remote command:

- summarize the exact command
- require explicit developer confirmation
- remind developer to redact secrets/tokens/IPs before pasting logs back

Do not suggest destructive production commands.

---

# 11. Final response format

When finished, provide:

1. Confirmatory analysis summary.
2. Files changed.
3. What changed in each file/group.
4. Schema/migration changes.
5. Env/config changes.
6. Tests/checks run.
7. Manual validation steps.
8. Legacy compatibility notes.
9. Deferred work for later phases.
10. Explicit statement of how the implementation satisfies Phase 5.

Implement the code. Do not output only a plan. Continue working until Phase 5 ( #file:PHASE_5.md ) has been entirely completed end-to-end. Create the structure, components, and connected OpenVibe related services, context, and projects contained within the `openvibe` folder in the workspace. Create and init the individual/modular/split git repository folders that we will push/deploy to newly created GitHub repositories, after all OpenVibe phases have been 100% completed and tested in our local environment. Utilize intuitive modular structures that will allow us to easily grow, expand, and iterate upon during the completion of phases ( as described in the original plan: #file:PLAN.md ) and update #file:PHASES.md after following all instructions for Phase 5.

