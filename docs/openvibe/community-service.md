# openvibe-community — service reference

Shared discussion / forum / paste / Discord-relay service.

* **Port:** 4900
* **DB:** SQLite WAL at `DB_PATH` (default `./data/openvibe-community.db`)
* **Auth:** `X-Internal-Key` + `X-OpenVibe-Service` for service callers; user
  Bearer / cookie for end-users; anonymous = read-only on public targets

See the route catalog and policy summary in
[phase-5-chat-community.md](./phase-5-chat-community.md).

## Schema

| Table | Purpose |
|---|---|
| `community_spaces` | top-level community / forum container |
| `community_categories` | per-space organization buckets |
| `community_threads` | discussions, comment-threads (linked via `(ref_type, ref_id)`), discord-relay imports |
| `community_posts` | top-level + reply posts under a thread |
| `community_pastes` | textual pastes with friendly slug + visibility |
| `community_attachments` | (attached_to_type, attached_to_id, media_id) — never holds raw paths |
| `community_discord_relays` | (discord_channel_id, openvibe_thread_id) routing config |
| `community_discord_messages` | imported/relayed message ledger; PK = `discord_message_id` for loop prevention |
| `community_legacy_map` | (source, kind, legacy_id) → new_id |

## Reusable comment threads

`POST /api/community/comments { ref_type, ref_id, body }` auto-creates an
on-demand thread the first time a target is commented on. The thread is
fetched via `findThreadByRef(ref_type, ref_id)` so subsequent comments
re-use it. This lets `openvibe-live`, future blog services, etc., share a
single comment substrate without duplicating threading code.

## SDK usage

```js
const { CommunityClient } = require('@openvibe/sdk');
const community = new CommunityClient({
  communityUrl: 'http://127.0.0.1:4900',
  internalKey: process.env.OPENVIBE_INTERNAL_KEY,
  service: 'openvibe-live',
});
await community.createPaste({ body: 'hi', language: 'txt', visibility: 'public' });
await community.addComment({ ref_type: 'vod', ref_id: 'vod_xyz', body: 'great vod' });
```

## Discord relay loop prevention

Inbound messages POST to `/api/community/discord/webhook` (optionally
secured by `DISCORD_WEBHOOK_SECRET`). Before importing, the service checks
`community_discord_messages.discord_message_id` and drops duplicates with
`{ ok: true, deduped: true }`. Outbound relays (when implemented) record
the same key when sending to Discord, so a round-trip cannot reimport.
