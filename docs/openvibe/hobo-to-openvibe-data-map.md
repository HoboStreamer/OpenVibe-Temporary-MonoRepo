# Hobo → OpenVibe canonical data map

This document records the canonical ownership and migration target for durable
data moving out of `HoboStreamer.com` and `HoboApp/hobo-tools`.

The target of this map is the **OpenVibe canonical bundle / future Postgres
loader**, not the current service-local SQLite files.

## Identity and control plane

| Legacy source | Entity / table | OpenVibe owner | Canonical target dataset | Notes |
|---|---|---|---|---|
| hobo-tools | `users` | `openvibe-network` / auth | `identity/users` | Primary account source. Preserve password hashes, profile fields, bans, and legacy refs. |
| HoboStreamer | `users` | `openvibe-network` / auth | `identity/users` | Merge into hobo-tools accounts via `linked_accounts`, `legacy_source`, or explicit service links. |
| hobo-tools + HoboStreamer | `linked_accounts` | `openvibe-network` / auth | `identity/linked-accounts` | Canonical link graph between legacy identities and OpenVibe accounts. |
| hobo-tools + HoboStreamer | `verification_keys` | `openvibe-network` / auth | `identity/verification-keys` | Reserved username claims / verification artifacts. Deduplicate by key. |
| hobo-tools | `anon_users` | `openvibe-network` / auth | `identity/anon-users` | Preserve anon identity metadata; do not import anon IP audit logs. |
| hobo-tools | `user_effects` | `openvibe-network` | `identity/user-effects` | Durable profile effect ownership. |
| hobo-tools | `user_preferences` | `openvibe-network` | `control-plane/user-preferences` + `themes/preferences` | Network/global preference source. |
| HoboStreamer | `user_preferences` | `openvibe-live` / `openvibe-chat` | `control-plane/user-preferences` | Preserve service-local preferences under `scope=live`. |
| hobo-tools | `url_registry` | `openvibe-network` | `control-plane/url-registry` | Canonical control-plane URL registry. |
| hobo-tools | `notifications` | `openvibe-network` | `control-plane/notifications` | Durable in-app notification history. |
| hobo-tools | `notification_preferences` | `openvibe-network` | `control-plane/notification-preferences` | Per-category notification policy. |
| hobo-tools | `oauth_clients` (sanitized) | `openvibe-network` / auth | `control-plane/oauth-clients` | Export client manifests only; rotate client secrets during cutover. |

## Themes and social graph

| Legacy source | Entity / table | OpenVibe owner | Canonical target dataset | Notes |
|---|---|---|---|---|
| hobo-tools | `themes` | `themes.openvibe.network` | `themes/catalog` | Network/global theme catalog. |
| HoboStreamer | `themes` | `themes.openvibe.network` + `openvibe.live` | `themes/catalog` | Preserve as legacy live-surface themes with `scope=live`. |
| HoboStreamer | `user_themes` | `themes.openvibe.network` + `openvibe.live` | `themes/preferences` | Service-local theme choices. |
| hobo-tools | `follows` | platform social graph | `social/follows` | Network-level follow edges. |
| HoboStreamer | `follows` | platform social graph / `openvibe.live` | `social/follows` | Live-surface follow edges with source metadata. |

## Live / stream ownership

| Legacy source | Entity / table | OpenVibe owner | Canonical target dataset | Notes |
|---|---|---|---|---|
| HoboStreamer | `channels` | `openvibe.live` | `live/channels` | Channel slug derives from canonical owner username when possible. |
| HoboStreamer | `managed_streams` | `openvibe.live` + `openre-stream` | `live/stream-definitions` | Stable stream definitions / reusable stream keys. |
| HoboStreamer | `streams` | `openre-stream` + `openvibe.live` | `live/stream-sessions` | Session lifecycle + viewer stats + VOD attachment refs. |
| HoboStreamer | `restream_destinations` | `openre-stream` | `live/restream_destinations` | Export metadata only; redact stream keys. |
| HoboStreamer | `robotstreamer_integrations` | `openre-stream` / `openvibe.live` | `live/robotstreamer_integrations` | Export metadata only; redact tokens. |
| HoboStreamer | `channel_moderators` | `openvibe.live` | `live/channel_moderators` | Preserve moderator edges. |
| HoboStreamer | `channel_moderation_settings` | `openvibe.live` / `openvibe-chat` | `live/channel_moderation_settings` | Preserve moderation policies. |
| HoboStreamer | `stream_controls`, `control_configs`, `control_config_buttons` | `openvibe.live` | `live/*` raw datasets | Preserve exported control configuration for later product-specific remap. |
| HoboStreamer | `camera_profiles`, `camera_presets` | `openvibe.live` | `live/*` raw datasets | Preserve metadata only; camera credentials redacted. |
| HoboStreamer | `vibe_coding_sessions`, `vibe_coding_events` | `openvibe.live` / `openvibe.codes` | `live/vibe_coding_*` | Durable legacy devstream/session history. |
| HoboStreamer | `viewer_snapshots`, `stream_analytics` | `openvibe.live` analytics | `live/viewer_snapshots`, `live/stream_analytics` | Analytics history preserved for backfill. |
| HoboStreamer | `media_request_settings`, `media_requests` | `openvibe.live` + billing/chat integrations | `live/media_request_*` | Preserved as legacy live-interaction state; separate from Hobo Bucks balance import. |

## Chat and community

| Legacy source | Entity / table | OpenVibe owner | Canonical target dataset | Notes |
|---|---|---|---|---|
| HoboStreamer | `chat_messages` | `openvibe-chat` | `chat/messages` | Preserve room scope (`global`, `stream`, etc.), sender identity, deletion/moderation fields. |
| HoboStreamer | `bans` | `openvibe-chat` / moderation | `chat/moderation-bans` | Preserve site-wide and per-stream bans. |
| HoboStreamer | `comments` | `openvibe-community` | `community/comments` | Treat VOD/clip comments as reusable community comment threads. |
| HoboStreamer | `pastes` | `openvibe-community` | `community/pastes` | Preserve slug, text/screenshot metadata, visibility, fork graph, counts. |
| HoboStreamer | `paste_likes`, `paste_comments` | `openvibe-community` | `community/paste_likes`, `community/paste_comments` | Preserve engagement + discussion history for later thread remap. |
| hobo-tools | `notifications` | `openvibe-network` | `control-plane/notifications` | Cross-surface user notification history. |

## Media metadata

| Legacy source | Entity / table / field | OpenVibe owner | Canonical target dataset | Namespace | Notes |
|---|---|---|---|---|---|
| HoboStreamer | `vods` | `openvibe-media` | `media/objects` | `live.vods` | Preserve metadata, visibility, file path, size, duration, stream ref. |
| HoboStreamer | `clips` | `openvibe-media` | `media/objects` | `live.clips` | Preserve parent VOD ref, offsets, and clip metadata. |
| HoboStreamer | `users.avatar_url` | `openvibe-media` | `media/objects` | `user.profile_images` | Local file refs only; remote URLs stay as metadata until backfilled. |
| HoboStreamer | `emotes` | `openvibe-media` | `media/objects` | `chat.attachments` | Preserve emote metadata; bytes backfill later. |
| HoboStreamer | `pastes.screenshot_path` | `openvibe-media` | `media/objects` | `community.attachments` | Preserve screenshot attachment refs. |
| HoboStreamer | local thumbnail/banner refs | `openvibe-media` | `media/objects` / later derivatives | `live.thumbnails` | Missing files are diagnostics, not hard deletes. |

## Billing-relevant records

| Legacy source | Entity / table | OpenVibe owner | Canonical target dataset | Notes |
|---|---|---|---|---|
| HoboStreamer | `subscriptions` | `openvibe-billing` / `openvibe.vip` | `billing/subscriptions` | Preserve legacy entitlement relationships for explicit plan remap. |
| HoboStreamer | `transactions` | archive only | **excluded** | Historical Hobo Bucks rows may be archived/reconciled, but are not imported as canonical balances. |
| HoboStreamer | `users.hobo_bucks_balance` | archive only | **excluded** | Explicitly dropped from canonical import. |
| HoboStreamer | `donation_goals` | archive / later rebuild | **excluded** | Current amount is derived from the legacy Hobo Bucks model. |

## Export-only / deferred for later slices

These entities are preserved in exports or manifests for later product-specific
migration work but are not fully normalized in this foundation slice:

- Hobo Coins loyalty tables: `coin_transactions`, `coin_rewards`, `coin_redemptions`, `watch_time`
- secret-bearing or operational tables such as `api_keys`, `api_tokens`, `site_settings`, OAuth runtime tables, audit/IP logs
- device/runtime registrations such as push subscriptions and active sessions

## Redaction and manual rotation rules

The migration scaffold redacts or excludes:
- HoboStreamer restream keys
- RobotStreamer tokens
- camera credentials
- OAuth client secrets
- API keys and bot tokens
- host-specific secret-bearing settings

Those values must be rotated or re-entered explicitly in OpenVibe.

## Cutover note

This map is for a **hard cutover**.

The Hobo repos are migration sources and archives, not long-term runtime
backends once the OpenVibe import is validated and the old Hobo domains are
redirected.
