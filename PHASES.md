# OpenVibe — Phase status

Numbering follows the later (corrected) numbering used in
[context/META_PROMPT_FOR_CHATGPT.md](context/META_PROMPT_FOR_CHATGPT.md):

| # | Name | Status | Where |
|---|---|---|---|
| 1 | Platform Kernel Foundations | ✅ implemented in this commit | `services/openvibe-network`, `services/openvibe-events`, `packages/openvibe-contracts`, `packages/openvibe-sdk` |
| 2 | Identity / Control Plane Extraction | ✅ implemented in this commit (federation mode) | `services/openvibe-network/server/identity.js` + host surfaces |
| 3 | Media platform extraction | ✅ implemented in this commit | `services/openvibe-media`, `packages/openvibe-contracts/src/media-namespaces.js`, `packages/openvibe-sdk` (`MediaClient`), `compat/hobostreamer/` + `/opt/hobostreamer/server/openvibe-bridge/media.js` |
| 4 | openvibe.live + openre.stream split | ✅ implemented in this commit | `services/openvibe-live` (SSR), `services/openre-stream` (ingest/restream), `packages/openvibe-contracts/src/stream-events.js`, `packages/openvibe-sdk` (`StreamClient`), `/opt/hobostreamer/server/openvibe-bridge/stream.js` |
| 5 | Chat / community / product migration | ✅ implemented in this commit | `services/openvibe-chat`, `services/openvibe-community`, `packages/openvibe-contracts/{chat-events,community-events}.js`, `packages/openvibe-sdk` (`ChatClient`, `CommunityClient`), `/opt/hobostreamer/server/openvibe-bridge/{chat,community}.js` |
| 6 | Billing / credits / tips ledger | ⏳ deferred | future `openvibe-billing` |
| 7 | AI backend orchestration | ⏳ deferred | future `openvibe-ai` |
| 8 | Mods + trust tiers | ⏳ deferred | extends capability + policy registries |

## Phase 1 — Platform Kernel Foundations: acceptance

1. `services/openvibe-events` boots, persists events with full envelope
   (`event_id`, `trace_id`, `event_type`, `version`, `source`, `actor_*`,
   `timestamp`, `payload`), supports topic + subscription filtering, has a
   work-queue with ack / retry, and a dead-letter table. ✅
2. `services/openvibe-network` exposes:
   * `POST/GET /api/v1/user-modules/:userId/:namespace` — namespaced shared
     user data, owner-attested writes, schema/version aware. ✅
   * `POST/GET /api/v1/services` — service registry (id, internal/public URL,
     declared capabilities + topics, last heartbeat). ✅
   * `POST/GET /api/v1/capabilities` — capability registry (owner service,
     input/output schemas, version, rate-limit policy). ✅
   * `POST/GET /api/v1/contracts` — contract registry (event/user-module/media
     schema definitions). ✅
3. The policy engine ([server/policy.js](services/openvibe-network/server/policy.js))
   is the single decision point used by all four registries above and by the
   user-modules API. ✅
4. All writes are audited in `audit_log`. ✅
5. No client-trusted writes — every mutating route runs through both
   `requireOpenVibeAuth` and `policy.assert(...)` before touching the DB. ✅

## Phase 2 — Identity / Control Plane Extraction: acceptance

1. Host-aware routing serves `auth.openvibe.network`, `api.openvibe.network`,
   `admin.openvibe.network`, `my.openvibe.network`,
   `themes.openvibe.network`. ✅
2. `auth.openvibe.network` exposes
   `/.well-known/openid-configuration` and `/.well-known/jwks.json` with the
   active RS256 public key (the existing hobo-tools key in federation mode).
   It also redirects to the existing hobo-tools `/oauth/authorize` so existing
   client redirects keep working. ✅
3. `themes.openvibe.network`, `admin.openvibe.network`,
   `my.openvibe.network` serve OpenVibe-branded shells **and** transparently
   proxy the existing hobo-tools API for the legacy surfaces, so existing
   browsers continue working through the new domains. ✅
4. URL registry compatibility: the OpenVibe network mirrors the
   `hobo-tools` registry plus `OPENVIBE_*` keys with documented Hobo
   fallbacks. ✅
5. HoboStreamer can verify a token from **either** `hobo.tools` or
   `auth.openvibe.network` via the additive `OPENVIBE_*` env vars
   (compat shim in [HoboStreamer.com/server/auth/openvibe-issuer.js](../HoboStreamer.com/server/auth/openvibe-issuer.js)).
   When the OpenVibe env vars are absent the existing Hobo flow is bit-for-bit
   unchanged. ✅

## Phase 3 — Media platform extraction: acceptance

1. `services/openvibe-media` boots on port `4500`, persists media in
   `media_objects` + `media_derivatives` + `media_jobs` + `media_quotas` +
   `media_usage` + `media_lifecycle_audit` + `media_legacy_map`. ✅
2. Single namespace registry
   ([packages/openvibe-contracts/src/media-namespaces.js](packages/openvibe-contracts/src/media-namespaces.js))
   covers `live.vods`, `live.clips`, `live.thumbnails`,
   `live.stream_snapshots`, `live.media_requests`, `community.pastes`,
   `community.attachments`, `chat.attachments`, `chat.tts_audio`,
   `user.profile_images`, `tools.images`, `games.assets`, `wiki.assets`,
   `blog.assets`. Per-namespace defaults seeded in `config.defaultQuotas`. ✅
3. Upload flow `POST /media/upload/init` → `PUT /media/:id/upload` →
   `POST /media/:id/upload/complete` enqueues thumbnail / metadata jobs and
   emits `media.upload.initialized`, `media.uploaded`,
   `media.processing.started`, `media.derivative.created`,
   `media.processing.completed`, `media.ready` on topic `media.events`. ✅
4. Hot/warm/cold tiers managed via `archive` (`status=archived`,
   `tier=cold`) and `restore` (`status=ready`, `tier=warm`); soft-delete via
   `DELETE /media/:id`. ✅
5. Storage seam: `LocalStorageProvider` (default) or `S3SeamProvider`
   selected via `STORAGE_PROVIDER`; key path `<namespace>/<id>.<ext>`. ✅
6. Read access: public/unlisted always allowed; private/restricted owner-or-
   admin only — gated centrally by `policy.decideRead`. ✅
7. Per-owner-namespace quotas (file size, storage cap, file count, mime
   allow-list, type allow-list) enforced before write. ✅
8. HoboStreamer compat shim `mirrorUploadSafe` lives at
   [/opt/hobostreamer/server/openvibe-bridge/media.js](/opt/hobostreamer/server/openvibe-bridge/media.js);
   inert when `OPENVIBE_MEDIA_URL` is unset. ✅
9. Service test
   `services/openvibe-media/test/model-policy-quota.test.js` passes. ✅
10. End-to-end live curl flow validated in this session — see
    [docs/openvibe/phase-3-media.md](docs/openvibe/phase-3-media.md). ✅

## Phase 4 — openvibe.live (SSR product) + openre.stream (infra) split: acceptance

1. `services/openre-stream` boots on port `4700` and is the authority for
   stream lifecycle — schema covers `channels`, `streams`,
   `ingest_sessions`, `restream_destinations`, `output_state`,
   `mirror_state`, `legacy_id_map`. ✅
2. Routes `POST /api/v1/channels`, `POST /api/v1/streams` (returns RTMP /
   WHIP / JSMpeg ingest URLs), `POST /api/v1/streams/:id/{start,end,attach-vod}`,
   `POST /api/v1/destinations`, `POST /api/v1/streams/:id/output`,
   `POST /api/v1/ingest/{connected,disconnected}` all gated by
   `policy.assert`. ✅
3. Lifecycle events emitted on topic `stream.events`: `stream.created`,
   `stream.started`, `stream.mirrored_to_live`, `stream.ended`,
   `stream.vod.attached`. Wrapper merges channel context into the
   `buildStreamEventPayload(stream, extra)` envelope. ✅
4. `services/openvibe-live` boots on port `4600` and serves SSR pages at
   `/`, `/c/:slug`, `/c/:slug/s/:streamId`. Every page emits `<title>`,
   `<meta name=description>`, `<link rel=canonical>`, full og: + twitter:
   card metadata. `og:type` flips to `video.other` when the channel is
   live; offline channels render an SEO-clean shell with
   `og:type=website`. ✅
5. `services/openvibe-live` accepts stream events two ways: push from
   `openvibe-events` to `POST /api/v1/events/stream` (single envelope or
   `{events:[...]}`), and direct service-authenticated upserts. The read
   model uses COALESCE-based upserts and never destroys data. ✅
6. URL registry overlay
   ([services/openvibe-network/server/api/url-registry.js](services/openvibe-network/server/api/url-registry.js))
   now advertises `OPENVIBE_MEDIA_URL`, `OPENVIBE_LIVE_URL`,
   `OPENRE_STREAM_URL` (and their `_INTERNAL_URL` variants). ✅
7. HoboStreamer compat shim
   [/opt/hobostreamer/server/openvibe-bridge/stream.js](/opt/hobostreamer/server/openvibe-bridge/stream.js)
   exposes `upsertChannelSafe`, `createStreamSafe`, `startStreamSafe`,
   `endStreamSafe`, `attachVodSafe` — inert when `OPENRE_STREAM_URL` is
   unset. ✅
8. Service tests `services/openre-stream/test/lifecycle.test.js` and
   `services/openvibe-live/test/ssr.test.js` pass. ✅
9. End-to-end live curl flow validated in this session: create →
   start → end (with VOD attached) produces the expected event sequence in
   `openvibe-events` and lights up the SSR page on `openvibe-live` with
   the LIVE NOW badge — see
   [docs/openvibe/phase-4-live-restream.md](docs/openvibe/phase-4-live-restream.md). ✅
10. Migration map per legacy table → new namespace / table / event
    documented in [docs/openvibe/migration-map.md](docs/openvibe/migration-map.md). ✅

## Phase 5 — openvibe-chat + openvibe-community: acceptance

1. `services/openvibe-chat` boots on port `4800`. Schema covers
   `chat_rooms`, `chat_participants`, `chat_messages`, `chat_call_sessions`,
   `chat_call_signals`, `chat_tts_settings`, `chat_audio_queue`,
   `chat_legacy_map`. ✅
2. `services/openvibe-community` boots on port `4900`. Schema covers
   `community_spaces`, `community_categories`, `community_threads`,
   `community_posts`, `community_pastes`, `community_attachments`,
   `community_discord_relays`, `community_discord_messages`,
   `community_legacy_map`. ✅
3. Chat REST surface: rooms, messages, edit/delete, DMs, call signaling
   envelopes, TTS settings + queue, soundboard / external-audio queue.
   Compatibility wrappers `/api/chat/{global,stream/:id,channel/:id}/*`
   keep HoboStreamer URLs stable via `ensureRoomForExternal()`. ✅
4. Community REST surface: spaces, categories, threads, posts, reusable
   comments via `(ref_type, ref_id)`, pastes (with legacy `/api/pastes/*`
   compatibility mount), Discord relay management + inbound webhook with
   `community_discord_messages.discord_message_id` loop prevention. ✅
5. Events emitted on `chat.events` and `community.events` topics use the
   canonical envelope and pass `is{Chat,Community}EventType` validation. ✅
6. Policy seams: `decideRead` / `decideSend` / `decideEdit` /
   `decideDelete` / `decideTtsOwnership` / `decideCallParticipant` for chat;
   `decideRead` / `decidePost` / `decideEdit` / `decideDelete` /
   `decidePasteOwnership` / `decideRelayManage` for community. All
   mutations route through `policy.assert`. ✅
7. Attachments in `community_attachments` reference `media_id` only — the
   community DB never holds raw paths or external URLs (those belong to
   `openvibe-media`). ✅
8. SDK clients `ChatClient` and `CommunityClient` exported from
   `@openvibe/sdk` and re-used internally by both services for cross-
   service calls. ✅
9. HoboStreamer compatibility shims
   [/opt/hobostreamer/server/openvibe-bridge/chat.js](/opt/hobostreamer/server/openvibe-bridge/chat.js)
   and
   [/opt/hobostreamer/server/openvibe-bridge/community.js](/opt/hobostreamer/server/openvibe-bridge/community.js)
   are inert when `OPENVIBE_CHAT_URL` / `OPENVIBE_COMMUNITY_URL` are unset.
   ✅
10. Service smoke tests `services/openvibe-chat/test/chat-smoke.test.js` and
    `services/openvibe-community/test/community-smoke.test.js` exercise
    model + policy in-process and pass. End-to-end curl flow validated:
    `POST /api/chat/rooms`, `POST /api/community/spaces`, `POST
    /api/community/threads`, and legacy `POST /api/pastes` all return
    `201` with the canonical resource shape. See
    [docs/openvibe/phase-5-chat-community.md](docs/openvibe/phase-5-chat-community.md),
    [docs/openvibe/chat-service.md](docs/openvibe/chat-service.md),
    [docs/openvibe/community-service.md](docs/openvibe/community-service.md),
    [docs/openvibe/legacy-chat-pastes-migration.md](docs/openvibe/legacy-chat-pastes-migration.md).
    ✅

## Validation

```bash
cd /opt/openvibe
npm install
npm run check       # node --check across every server file
npm test            # in-repo module tests
```

Manual local validation steps live in
[services/openvibe-network/README.md](services/openvibe-network/README.md)
and [services/openvibe-events/README.md](services/openvibe-events/README.md).
