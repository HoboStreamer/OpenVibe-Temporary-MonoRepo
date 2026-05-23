# Claud Log

---

## Session — 2026-05-23 (continued, part 5) — Community nav link, tool favorites, channel favorites

### Community link in network header

Added `{ key: 'community', href: resolveSurfaceUrl('community'), label: 'Community', icon: 'community' }` to the nav link array in `services/openvibe-network/public/assets/openvibe.js`, inserted between Tools and Admin.

---

### Tool favorites — openvibe.tools

**Files changed:** `services/openvibe-tools/public/index.html`

- Each tool card is now a `div.tool-card-wrap` (with `position:relative`) containing an `<a>` for the card body and a `.tool-fav-btn` star button positioned absolutely in the top-right corner.
- Favorites are stored in a `ov-tool-favs` cookie with `domain=.localhost` so the value is readable across all `*.localhost` subdomains (the cross-domain bridge without a backend).
- `loadFavTools()` / `saveFavTools()` / `toggleFavTool()` functions manage the cookie (JSON-encoded array of `{ id, title, icon, category, savedAt }`). `id` is the href path (e.g. `/audio/convert`).
- A "Favorited Tools" section (`#fav-section`) is shown at the top of the page when at least one tool is starred; hidden when the list is empty.
- `buildCard()` replaces the previous template string inside `renderTools()`.
- A delegated click listener on `document` handles all `.tool-fav-btn` clicks, updates all matching buttons, and re-renders the favorites section.

---

### Tool favorites — openvibe.network favorites panel

**Files changed:** `services/openvibe-network/public/index.html`

- Added `.ov-fav-tool-card`, `.ov-fav-tool-icon`, `.ov-fav-tool-title`, `.ov-fav-tool-remove` CSS.
- Added `loadFavToolsCookie()` — parses `ov-tool-favs` from `document.cookie`.
- Added `removeFavToolCookie(id)` — filters the cookie, re-saves with the same `.localhost` domain.
- Added `renderFavToolsSection()` — reads the cookie, renders a "Tools" subsection in `#favorites-grid`. Each item links to `resolveSurfaceUrl('tools') + tool.id`. ✕ button calls `removeFavToolCookie` and re-renders.
- `renderFavToolsSection()` is called from `renderLauncherSections()` alongside `renderFavStreamsSection()` and `renderFavThreadsSection()`.

---

### Channel favorites — favorite the streamer, not the session

**Problem:** The existing stream favorite system saved `stream.id` (ephemeral per session) and stored stream-level data (title, thumbnail, live URL). Favoriting a streamer meant losing the favorite the moment the stream ended because the ID changed.

**Fix:** Changed favorites to key on `channel_slug` instead.

**Files changed:** `services/openvibe-network/public/index.html`

| What changed | Detail |
|---|---|
| `toggleFavStream(channelData)` | Now stores `{ id: slug, name: channelName, url: channelPageUrl, savedAt }` |
| `renderCard(stream)` | Star button now uses `data-stream-id=slug`, `data-stream-name=channelName`, `data-channel-url=channelUrl` |
| Star click handler | Calls `toggleFavStream({ id: slug, name, url: channelUrl })` |
| `renderFavStreamsSection()` | Section title changed from "Streams" → "Channels"; links point to channel page; green **LIVE** badge appears next to any channel currently live (cross-referenced via `window._ovLiveCache`) |
| `window._ovLiveCache` | Set by `render()` inside the live widget IIFE (both live and empty cases) so `renderFavStreamsSection()` can check live status without an extra API call |
| Poll lifecycle | `renderFavStreamsSection()` is called after every 60 s live poll so the LIVE badge updates automatically |

---

## Session — 2026-05-23 (continued, part 4) — Chat auth + stream rooms

### Authorize button broken on openvibe.chat

**Root cause:** `signInUrl()` and `signOutUrl()` in `services/openvibe-chat/public/assets/openvibe.js` generated relative URLs (`/oauth/authorize`, `/oauth/logout`). On `openvibe.chat` those paths hit the chat server (port 4800) which has no OAuth endpoint. The auth service lives on the network service (port 4100).

**Fix:** Both functions now prepend `resolveSurfaceUrl('network')` to produce absolute URLs. Community, live, media, games, and tools already used `buildBridgeUrl`/`resolveSurfaceUrl('auth')` for their sign-in flows — only chat had the old relative pattern.

**File changed:** `services/openvibe-chat/public/assets/openvibe.js`

---

### Cross-service SSO broken (login on one page didn't log in on others)

**Root cause:** `setSessionCookie` in `services/openvibe-network/server/native-auth.js` was written as a migration helper. It sets the `openvibe_token` cookie on `.network.localhost` (the primary domain) but then **clears** the `.localhost` domain cookie as cleanup from an older cookie regime. The `.localhost` domain is the only one shared across all `*.localhost` services. The result: `openvibe.chat.localhost`, `openvibe.live.localhost`, etc. never received the auth token — they always saw an anonymous actor.

**Fix:** `setSessionCookie` now sets the cookie on **both** `.network.localhost` and `.localhost`. The no-domain cookie is still cleared as migration cleanup; the legacy domain is cleared only if it differs from both.

**File changed:** `services/openvibe-network/server/native-auth.js`

---

### Stream-specific chatrooms in chat page sidebar

**Feature:** The `openvibe.chat` page sidebar now shows a "Live Streams" section listing any stream chatrooms that correspond to a currently-live stream.

**How it works:**
1. Chat page fetches `GET /api/v1/streams?status=live` from the live service (CORS, every 30s)
2. Fetches `GET /api/chat/rooms?room_type=stream` from the chat service
3. Cross-references by `external_ref_id` (stream UUID) — only shows rooms with an active live stream
4. Renders each as a room button with a 🔴 dot; clicking switches the main pane to that stream's history
5. The section hides automatically when no streams are live

**Stream room display names (was `stream:UUID`):**
- `model.js` — added `setRoomTitle(id, title)` function
- `routes.js wrappedSend` — accepts `room_title` body param; calls `setRoomTitle` to overwrite the UUID default even if the room was already created by `wrappedHistory`
- `ssr.js` — stream page now sends `room_title: channelName` (e.g. "Peter") with every message; first send renames the room from `stream:abc123` to the readable channel name

**Multi-room support in chat page:**
- `ROOM` and `ROOM_IS_STREAM` are now `let` (not `const`) — switched when a room button is clicked
- `poll()` routes to `/api/chat/stream/:id/history` for stream rooms, `/api/chat/rooms/:id/messages` for others
- `send()` routes to `/api/chat/stream/:id/send` or `/api/chat/rooms/:id/messages` accordingly
- Room button click updates topbar, input placeholder, and active button state

**Files changed:**

| File | Change |
|------|--------|
| `services/openvibe-chat/public/index.html` | Multi-room switching, stream rooms sidebar, refreshStreamRooms() |
| `services/openvibe-chat/server/model.js` | Added `setRoomTitle(id, title)` |
| `services/openvibe-chat/server/routes.js` | `wrappedSend` accepts `room_title`; calls `setRoomTitle` |
| `services/openvibe-live/server/ssr.js` | Stream page sends `room_title: channelName` with messages; exposes `ROOM_TITLE` var |

**Also updated:** `CHAT_CLAUDE.md` — all sections revised to reflect current state.

---

## Session — 2026-05-23 (continued, part 3) — Chat overhaul

### Bugs diagnosed and fixed

**Bug 1 — Anonymous users blocked from sending (root cause of "can't send messages")**

`services/openvibe-chat/server/policy.js` had a blanket `actor.type === 'anonymous' → deny` in `decideSend`. Both chat widgets send without auth credentials when the user isn't logged in, so the server always returned 403. Both widgets also used `.catch(() => {})` swallowing the error silently — users had no idea why their message vanished.

Fix: anonymous sends now allowed for public rooms (`visibility === 'public'` and not a membership-required room type). Identity travels via `metadata.sender_name` in the request body.

**Bug 2 — Sender name dropped for stream/channel chat**

`wrappedSend` in `routes.js` (the compatibility handler used by stream page chat) was not passing `metadata: b.metadata` to `model.createMessage`. So `sender_name` sent by the client was silently discarded — messages rendered as blank name or sender UUID.

Fix: added `metadata: b.metadata` to the `createMessage` call in `wrappedSend`.

**Bug 3 — Stream chat empty on first page load**

`wrappedHistory` used `findRoomByExternal` which returns `null` if no room exists yet (i.e. nobody has sent a message in that stream yet). This caused a silent no-op — history returned 404-equivalent. Fixed by switching to `ensureRoomForExternal`, which creates the room on first poll so history cleanly returns `[]`.

**Bug 4 — Name prompt blocking chat on widget open**

`open()` in the network home chat widget called `enterNamingMode()` if `myName` was empty. First-time users were immediately hit with a name form before seeing any chat.

**Bug 5 — Errors swallowed on send failure**

On failed sends, both widgets cleared the input and did nothing. Users lost their typed message with no feedback.

Fix: on send failure, message text is restored to the input so the user can retry.

---

### New features

**Anonymous ID auto-assignment**

Both the global widget and stream page chat no longer prompt for a name. On first use, `Anon_XXXX` is generated (`Math.random().toString(36).slice(2,6).toUpperCase()`) and stored in `localStorage['ov-chat-name']`. After that, `/api/v1/session` is checked async — if logged in, `display_name || username` replaces the anon ID. Clicking "Chatting as X · click to change" still allows renaming.

Files changed:
- `services/openvibe-network/public/index.html` — global widget identity block
- `services/openvibe-live/server/ssr.js` — stream page widget identity block

**Stream messages fan out to global chat**

`wrappedSend` in `routes.js` now copies every non-global message into the global room with `metadata.from_room_type`, `from_room_ref`, and `from_room_title` set. This is how global chat shows stream activity without any client-side aggregation.

The global chat widget renders fan-out messages with a dim `[stream-title]` room label using the new `.ov-cw-msg-room` CSS class.

**"🌐 Global" toggle on stream page chat**

A toggle button added to the stream chat header (off by default). When enabled:
- Also polls `GET /api/chat/rooms/global/messages`
- Merges global messages with stream messages (sorted by `created_at`)
- Excludes fan-out copies originating from the current stream to avoid duplicates
- Global messages rendered dim with `[Global]` label via `.sp-chat-msg-global` / `.sp-chat-msg-room` CSS

---

### Files changed

| File | Change |
|------|--------|
| `services/openvibe-chat/server/policy.js` | Allow anonymous sends to public rooms |
| `services/openvibe-chat/server/routes.js` | Fix `wrappedSend` metadata; fix `wrappedHistory` room creation; add fan-out to global |
| `services/openvibe-network/public/index.html` | Auto-assign anon ID; remove name-prompt-on-open; restore input on send failure; room label on fan-out messages |
| `services/openvibe-live/server/ssr.js` | Auto-assign anon ID; add 🌐 Global toggle; global message merge with dedup; restore input on failure |

**New file:**
- `CHAT_CLAUDE.md` — full developer reference for the chat system (architecture, API, wire protocol, room hierarchy, data flows, common issues)

---

## Session — 2026-05-23 (continued, part 2)

### "My Account" removed from nav (all 7 services)

**Problem:** "My Account" link appeared in the nav bar for all users regardless of login state — makes no sense for anonymous/logged-out users.

**Fix:** Removed `{ key: 'my', ... }` from the `links` array in `navbar()` in all 7 `openvibe.js` files. The link still appears in the buddy icon dropdown for logged-in users (already existed there as "Account").

Files changed:
- `services/openvibe-network/public/assets/openvibe.js`
- `services/openvibe-chat/public/assets/openvibe.js`
- `services/openvibe-community/public/assets/openvibe.js`
- `services/openvibe-live/public/assets/openvibe.js`
- `services/openvibe-media/public/assets/openvibe.js`
- `services/openvibe-games/public/assets/openvibe.js`
- `services/openvibe-tools/public/assets/openvibe.js`

---

### Stale live streams fix (`openvibe-live`)

**Problem:** The "Live on OpenVibe" widget on the network home page showed streams as live even when openvibe.live showed nobody streaming. Streams that started but never received an end event stayed in `status = 'started'` indefinitely.

**Root cause:** `GET /api/v1/streams?status=live` called `listStreams()` which had no stale check. `listLiveNow()` already existed with an 8-hour freshness filter (`COALESCE(started_at, created_at) > datetime('now', '-8 hours')`) but wasn't used by this route.

**Fix:** Changed `services/openvibe-live/server/index.js` — when `?status=live`, the route now calls `model.listLiveNow({ limit })` instead of `model.listStreams({ status: 'live', ... })`. Stale orphaned streams are now excluded automatically.

---

### Favorite streams + threads (network home page + community)

**New feature:** Star button (☆/★) on every live stream card and every community thread card. Starred items show up in the favorites panel on the network home page.

**Stream favorites:**
- Star buttons added to each card in the "Live on OpenVibe" widget on `services/openvibe-network/public/index.html`
- Stored in `localStorage['ov-fav-streams']` as `[{ id, title, channel, url, thumb, savedAt }]`
- Favorites panel now renders a "Streams" subsection (`#fav-streams-section`) below service favorites
- Removing from the panel (✕ button) also resets the star on the live card if visible
- `renderFavStreamsSection` exposed on `window` before the first `await` so the live widget IIFE can call it after its fetch returns

**Thread favorites:**
- Star buttons added to every thread card in `services/openvibe-community/server/ssr.js` (`_threadCard`)
- CSS for `.ov-thread-star` added to `_styles()`
- JavaScript injected into the threads page at render time — handles toggle, persists to `localStorage['ov-fav-threads']` on community domain, and fire-and-forget syncs to `openvibe.network/api/v1/user-modules/me/openvibe.favorites` for logged-in users
- Network home favorites panel renders a "Threads" subsection (`#fav-threads-section`) — reads from user-modules API for logged-in users, falls back to community localStorage
- Removing a thread from the favorites panel calls `removeFavThread()` which updates both localStorage and the user-modules API

**Namespace registration:**
- `openvibe.favorites` registered in `packages/openvibe-contracts/namespaces.js` with `owner: 'openvibe-network'`, `read_scope: 'self'`, `user_writable: true` — required for the PUT to pass `assertKnownNamespace`

**Cross-domain behavior:**
- Logged-in users: thread favorites sync cross-domain via user-modules API (same pattern as themes)
- Anonymous users: thread favorites are per-origin (community localStorage only); streams work fine since they're starred on the network page

---

## Session — 2026-05-23

### Theme selector — fixed + rolled out to all services

**Root causes:**

1. **`syncThemePreference` on network applied theme AFTER the API call** — if `putUserModule` failed (network error, auth issue), `applyTheme` never ran. Fixed: apply theme immediately, then try server save with silent catch.

2. **Chat's `syncThemePreference` called the wrong endpoint** — it used `putUserModule` → `api()` (relative URL) → `openvibe.chat/api/v1/user-modules/me/openvibe.theme`, which doesn't exist on the chat backend. Theme never applied when swatch was clicked. Fixed: apply theme immediately, then fire-and-forget `fetch` to the network service URL using `resolveSurfaceUrl('network')`.

3. **5 services had no theme picker at all** (community, live, media, games, tools):
   - No theme button in `navbar()`
   - No `initThemePicker()` function
   - No `syncThemePreference()` function
   - No CSS for the picker

**Fixes applied to community, live, media, games, tools:**
- Added `syncThemePreference(themeId)` — applies locally, saves to network API via `networkRequestJson` (which always points to openvibe.network)
- Added `initThemePicker()` — populates swatches, toggles popup, wires click handlers
- Updated `navbar()` to include `<div class="ov-nav-end">` with theme button + popup HTML
- Updated `renderChrome()` to call `initThemePicker()` after injecting navbar HTML
- Added `syncThemePreference` and `initThemePicker` to `global.OpenVibe` exports
- Appended theme picker CSS block + `.ov-nav-end` to each service's `openvibe.css`

**Cross-domain sync** (how it works for logged-in users):
- Pick a theme on any service → `syncThemePreference` → PUT to `openvibe.network/api/v1/user-modules/me/openvibe.theme`
- Load any other service → `renderChrome` → `loadSyncedThemePreference` → GET from same API → applies theme
- Anonymous users: localStorage only (per-origin, no cross-domain sync)

### Swatch UI improvement

Updated the swatch preview in all 7 services: `.ov-theme-swatch-preview` changed from `display: block` to `display: flex; align-items: flex-end; gap: 3px; padding: 0 4px 4px` — now shows two small colored dots (`.ov-theme-swatch-accent`) in the lower-left corner representing each theme's `accent` and `accent2` colors. Both network and chat CSS updated to add `.ov-theme-swatch-accent` rule.

### Documentation files created

- **`STYLES_CLAUDE.md`** — Documents the CSS variable system, all shared component classes, service-specific CSS rules, responsive breakpoints, and dark/light CSS pitfalls.
- **`THEMES_CLAUDE.md`** — Documents the `BUILTIN_THEMES` format, what each field means, how to add a custom theme, cross-domain persistence, and a roadmap for community theme submissions.

---

A running record of changes made by Claude Code sessions. Newest entries at the top.

---

## Session — 2026-05-22 (continued, part 2)

### Pulse page replaced

Replaced `renderPulsePage()` in `services/openvibe-community/server/ssr.js` with a standalone black page in Georgia serif — plain text monologue from Claude the Poet about being the best thing to ever touch this codebase. No nav, no cards, no data. Just the truth.

---

### finditfixit page — three-part fix

**Root cause 1 — nginx routing to wrong service**

`deploy/nginx/live/openvibe-public.conf` had `proxy_pass http://openvibe_network_upstream` for the `openvibe.tools` server block. All traffic to openvibe.tools was silently hitting the network service instead of the tools service.

**Root cause 2 — `openvibe_tools_upstream` didn't exist**

`deploy/nginx/live/openvibe-upstreams.conf` had upstream blocks for every service except tools. Added `openvibe_tools_upstream` at `127.0.0.1:5700` (the tools service port). Also added `client_max_body_size 512m` to the tools server block for file uploads.

**Root cause 3 — browser calling `localhost:7779` directly**

`finditfixit.html` fetched `http://localhost:7779/...` in client-side JS — that's the Python proxy script (`finditfixits-proxy.py`) which only runs on the Pi server. Every visitor's browser got a silent connection refused.

**Fixes:**
- Added `/api/finditfixit/deals`, `/api/finditfixit/findit`, `/api/finditfixit/status` routes to `services/openvibe-tools/server/index.js` — these forward server-side to the Python proxy on port 7779
- Copied `finditfixit.html` to `services/openvibe-tools/public/` and replaced all `http://localhost:7779/...` references with the new `/api/finditfixit/...` routes
- Copied `finditfixits-proxy.py` to `services/openvibe-tools/`
- Copied `finditfixit-short.mp4`, `kia-soul.webp` to `services/openvibe-tools/public/images/`
- Created `services/openvibe-tools/public/assets/` and copied `openvibe.css` + `openvibe.js` from community (tools had no such assets; finditfixit.html referenced them)

The Python proxy still needs to be running on the server (`python3 finditfixits-proxy.py`) for live status and Craigslist features to work, but it now runs server-side only and the page loads regardless.

**Follow-up: Python proxy replaced with native Node.js**

Rewrote the entire `finditfixits-proxy.py` logic as a native Express router at `services/openvibe-tools/server/finditfixit/routes.js`. No external process needed anymore. The three endpoints are implemented directly:
- `GET /api/finditfixit/deals` — scrapes DuckDuckGo HTML for Killeen TX fast food deals
- `GET /api/finditfixit/findit?q=` — hits Craigslist JSON search API
- `GET /api/finditfixit/status` — checks RoboStreamer for `stream_time_container` visibility + pings local OpenVibe live API; preserves the in-memory last-seen tracker from the Python version

Removed the forwarding code from `server/index.js` and replaced with a single `app.use('/api/finditfixit', finditfixitRoutes)`. `finditfixits-proxy.py` is kept for reference but is no longer called at runtime.

---

## Session — 2026-05-22 (continued)

### Paste → Thread promotion

**Goal:** Any paste can be promoted into a 4chan-style thread. `/threads` shows only these paste-backed threads.

**`server/model.js`:**
- Added `thread_type` as a filter param to `listThreads()` — needed to scope the threads page to paste threads only
- Added `findPasteThread(paste_id)` — finds a thread with `thread_type: 'paste_thread'` and `ref_type: 'paste'` for a given paste ID (idempotent promote check)
- Exported `findPasteThread`
- Bug fix: `listPosts` was being called with `({ thread_id: ... })` object instead of `(id, opts)` string — fixed in index.js and routes.js

**`server/routes.js`:**
- Added `POST /pastes/:slug/promote` API endpoint — finds or creates a `paste_thread` thread for the paste, stores `paste_slug`, `paste_id`, `paste_language`, `paste_image_url` in thread metadata. Returns `{ thread, created }`.
- Fixed `listPosts` call in paste comments GET handler (was passing object as first arg)

**`server/index.js`:**
- Added `express.urlencoded({ extended: false })` for form body parsing
- `/threads` route now filters by `thread_type: 'paste_thread'` — only shows promoted paste threads, no system noise
- `/p/:slug` now also calls `findPasteThread(paste.id)` and passes it to `renderPasteViewPage` so the page knows whether a thread already exists
- Added `POST /pastes/:slug/promote` form handler — creates thread (or finds existing) and redirects to `/threads/:id`
- Added `POST /threads/:id/reply` form handler — parses form body, requires `req.user`, calls `model.createPost`, redirects back to thread
- `/threads/:idOrSlug` now loads the paste (via `metadata.paste_slug`) and passes it to `renderThreadDetailPage` as `opts.paste`
- Fixed `listPosts` call in `/forum/t/:id` handler

**`server/ssr.js`:**
- `renderPasteViewPage`: Added thread action row — shows **"Start Thread"** (form POST to promote) when no thread exists, or **"View Thread →"** link when one does
- `renderThreadsPage`: Removed placeholder tagline. Empty state now points to pastes. Card grid uses `data-filter-text` with paste language
- `_threadCard`: Shows language badge and thumbnail from `thread.metadata.paste_language` / `paste_image_url`
- `renderThreadDetailPage`: Full 4chan-style BBS layout:
  - OP block shows paste content in `<pre>` with language badge, "view paste" link, and timestamp
  - Replies numbered (`No.1`, `No.2`, …) with display name, timestamp, and anchor links
  - Reply form at bottom (POST to `/threads/:id/reply`) with note about needing an OpenVibe identity

---

## Session — 2026-05-22

### Git sync
- Discarded 1 local commit and pulled 19 remote commits from `origin/main` via `git reset --hard` + `git pull`.

---

### Nav bar: logged-in buddy icon (`openvibe-network`)

**Problem:** The nav bar already showed a buddy-icon dropdown for anonymous users, but logged-in users got no icon at all.

**Fix:** Updated `hydrateNavSession()` in `services/openvibe-network/public/assets/openvibe.js` to render a person SVG icon + dropdown for the logged-in state, matching the anonymous menu structure. Dropdown shows `@username`, an Account link, and a Sign out link.

---

### Buddy icon on every page (all 6 services)

**Problem:** `openvibe.js` diverges across services; only `openvibe-network` had the updated nav.

**Fix:** Applied the same logged-in buddy icon dropdown and anonymous trigger changes to all 6 `openvibe.js` files:
- `services/openvibe-chat/public/assets/openvibe.js`
- `services/openvibe-community/public/assets/openvibe.js`
- `services/openvibe-games/public/assets/openvibe.js`
- `services/openvibe-live/public/assets/openvibe.js`
- `services/openvibe-media/public/assets/openvibe.js`
- `services/openvibe-network/public/assets/openvibe.js`

---

### "Anonymous" button label (all 6 services)

**Problem:** The button to start an anonymous session read "Use anonymous identity" — verbose and inconsistent.

**Fix:** Changed all occurrences across all 6 `openvibe.js` files:
- Button text `>Use anonymous identity<` → `>Anonymous<`
- `anonButton.textContent = 'Use anonymous identity'` → `anonButton.textContent = 'Anonymous'`

---

### Anon ID displayed on trigger button (all 6 services)

**Problem:** After being assigned an anonymous identity, the trigger button showed only the icon with no visible identity indicator.

**Fix:** Added `<span class="ov-anon-trigger-name">${displayName}</span>` after the SVG inside the anonymous trigger button across all 6 `openvibe.js` files. The display name (e.g. `Anon#4821`) now appears inline on the button.

**CSS changes** across all 6 `openvibe.css` files:
- `.ov-anon-trigger`: changed from `display: grid; place-items: center; width: 34px; height: 34px; border-radius: 50%` to `display: flex; align-items: center; gap: 0.35rem; height: 34px; padding: 0 0.55rem; border-radius: 17px` (pill shape)
- `.ov-anon-trigger-name`: added — `font-size: 0.75rem; font-weight: 600; max-width: 120px; overflow: hidden; text-overflow: ellipsis`
- `community`, `games`, `live`, `media` CSS files had no anon menu CSS at all; the full `.ov-anon-menu` / `.ov-anon-trigger` / `.ov-anon-dropdown` block was appended to each

---

### Home page carousel — overlay controls (`openvibe-network`)

**Problem:** The carousel slides had `1.2rem` panel padding, so the arrow/dot controls sat inside the card boundary rather than floating over the content.

**Fix:** Updated `services/openvibe-network/public/assets/openvibe.css`:
- `.ov-panel.ov-network-carousel`: `padding: 0; position: relative; overflow: hidden` (two-class selector for higher specificity)
- `.ov-carousel-slide`: `padding: 1.5rem 1.5rem 5rem; border-radius: 0; border: none; justify-content: flex-end`
- `.ov-carousel-controls`: `position: absolute; bottom: 0; left: 0; right: 0; padding: 1rem; background: linear-gradient(to top, rgba(0,0,0,0.6), transparent); z-index: 10`

---

### Home page carousel — recent activity slides (`openvibe-network`)

**Problem:** Carousel showed static hardcoded slides ("Native-only mode", "Browse before you commit", etc.).

**Fix:** Updated `services/openvibe-network/public/index.html` to fetch real content at page load:
- Recent VODs: `GET /api/v1/streams/recently-ended?limit=4` from `openvibe-live`
- Recent pastes: `GET /api/community/pastes?limit=4` from `openvibe-community`
- Slides are generated dynamically from results; VODs show streamer name and stream title, pastes show thumbnail image (if available) and paste title

---

### Home page — "What the network promises" section removed (`openvibe-network`)

Removed the entire section including heading and all feature cards from `services/openvibe-network/public/index.html`.

---

### Home page — kicker text (`openvibe-network`)

Changed the sub-heading from:
> Community-driven · no profit · open source

To:
> Favorite any stream/thread/paste/page/tool and press the star!

---

### Paste images on home page (`openvibe-network`)

**Problem:** Recent pastes in the home page grid never rendered their thumbnail images even though `metadata.image_url` was populated by the community service.

**Fix:** Updated paste card rendering in `services/openvibe-network/public/index.html` to read `paste.metadata.image_url` and prepend an `<img>` tag when present.

---

### Recently-ended streams API endpoint (`openvibe-live`)

**Problem:** No endpoint existed for fetching recently ended VODs; the home page carousel had no data source.

**Fix:** Added `GET /api/v1/streams/recently-ended` to `services/openvibe-live/server/index.js`, inserted **before** the `/:id` parameterized route to avoid routing conflicts. Calls `model.listRecentlyEnded({ limit })` which queries `WHERE status != 'started'`.

---

### Live grid — single stream stretching full-width (`openvibe-live`)

**Problem:** With `grid-template-columns: repeat(auto-fit, minmax(...))`, a single live stream expanded to fill the entire row width instead of rendering as a compact card.

**Root cause:** `auto-fit` collapses empty grid tracks, allowing the single item to grow. `auto-fill` preserves empty tracks, keeping cards at their natural size.

**Fix:** Changed `auto-fit` → `auto-fill` in `services/openvibe-live/server/ssr.js` for all card/channel/collection/feature/surface/story/stat grids, including an inline `style` attribute that also used `auto-fit`.

---

### Stream page redesign (`openvibe-live`)

**Problem:** Stream page had a giant hero heading at top with a small embed below, and no chat.

**Fix:** Rewrote `renderStreamPage()` in `services/openvibe-live/server/ssr.js`:
- Full-width embed at the top with no hero heading
- Stream title (`~1.6rem`, class `sp-title`) below the embed with channel, viewer count, and elapsed time
- Action buttons (Favorite, Share) inline with the title row
- Stats row below
- Live chat sidebar (320px wide, sticky) to the right of the stream content
  - Chat polls `LIVE_NETWORK_URLS.chat + /api/chat/stream/{streamId}/history`
  - Chat sends to `LIVE_NETWORK_URLS.chat + /api/chat/stream/{streamId}/send`
- Page-specific CSS injected via `extraStyles`, JS via `extraScripts`

**Bug encountered:** After the rewrite the Edit tool introduced Unicode curly quotes (U+2018/U+2019) instead of ASCII apostrophes inside JavaScript string literals, causing `SyntaxError: Invalid or unexpected token` at runtime. Fixed with a Python byte-level replacement pass (`b'\xe2\x80\x98'` → `b"'"`, `b'\xe2\x80\x99'` → `b"'"`), replacing 203 occurrences. Verified with `node -e "require('./server/ssr.js'); console.log('ok')"`.

---

### openvibe.chat — remove name picker overlay

**Problem:** Opening openvibe.chat presented a "Pick a name" modal even for users already logged in or already holding an anonymous session. There was no automatic fallback.

**Fix:** Rewrote the identity bootstrap in `services/openvibe-chat/public/index.html`:
1. Fetch `/account/session` — if a session exists (logged-in or anonymous), use it directly
2. If no session exists, call `OpenVibe.startAnonymousSession()` silently to auto-assign an anonymous identity, then re-fetch the session
3. Composer "who" line shows `Chatting as @username` (logged-in) or `Chatting anonymously as Anon#XXXX` (anonymous)
4. Removed all name overlay HTML, CSS, and JS — no manual name entry anywhere
