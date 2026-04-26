# openvibe-community

OpenVibe Phase 5 social/forum/discussion/Discord-relay/paste service. Owns
spaces, categories, threads, posts, comments (reusable across `openvibe-live`,
`openvibe-blog`, etc), pastes, and Discord relay mappings.

## Runtime

* Node >=18, CommonJS, Express 4, better-sqlite3.
* Default port `4900`.
* Service-to-service auth: `X-Internal-Key` + `X-OpenVibe-Service`.

## Tables

* `community_spaces`, `community_categories`, `community_threads`, `community_posts`
* `community_pastes`, `community_attachments`
* `community_discord_relays`, `community_discord_messages`
* `community_legacy_map`

## Routes

See `server/routes.js`. Highlights:

* `GET/POST /api/community/spaces` · `GET /api/community/spaces/:idOrSlug`
* `GET/POST /api/community/spaces/:spaceId/categories`
* `GET/POST /api/community/threads`, `GET/POST /api/community/threads/:idOrSlug/posts`
* Reusable comments: `GET/POST /api/community/comments?ref_type=&ref_id=`
* Pastes: `GET/POST /api/community/pastes`, `GET /api/community/pastes/:slug`
* Legacy paste compat: `GET/POST /api/pastes`, `GET /api/pastes/:slug`
* Discord: `GET/POST /api/community/discord/relays`,
  `POST /api/community/discord/webhook`, `POST /api/community/discord/sync`

## Tests

```
npm test
```
