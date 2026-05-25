# Claud Log

---

## Session — 2026-05-24 (part 17) — Streaming: WHEP viewer, live tab, chat fixes, openre.stream cleanup

### What was done

**Added WHEP viewer endpoint to openre-stream (`services/openre-stream/server/whip.js` + `index.js`):**
- New `POST /whep/:channelSlug` — validates producers exist, creates mediasoup consumer transport, connects DTLS, calls `sfu.consume()` for each producer (video + audio), returns 201 with `sendonly` SDP answer + `Location` header
- New `DELETE /whep/:channelSlug/:resourceId` — cleans up viewer session
- `buildWhepSdpAnswer()` — assembles SDP using consumer's `rtpParameters` (payload type, SSRC, CNAME) and transport ICE/DTLS credentials
- CORS headers on all WHEP routes (`Access-Control-Allow-Origin: *`, `Access-Control-Expose-Headers: Location`)
- `viewerSessions` Map for tracking active viewer connections

**Fixed stream watch page — live streams now play video (`services/openvibe-live/server/ssr.js`):**
- `renderStreamPage` now renders `<video id="sp-live-video">` instead of CSS play-button overlay when `isLive && !embed_url`
- Injected WHEP viewer JS in `extraScripts` — creates `RTCPeerConnection`, adds recvonly transceivers, POSTs SDP offer to `{restreamUrl}/whep/{slug}`, sets remote description, auto-retries on failure after 3s
- Previously: `embed_url` was never set for go-live streams; `renderMediaThumb` was purely a CSS decoration — no actual player

**Fixed live tab in stream manager — direct WHEP preview (`services/openvibe-live/public/js/stream-manager.js`):**
- `activateLiveTab()` now creates `<video>` element + calls `startWhepPreview(video, whepBase, slug)` instead of embedding an iframe pointing to `/@slug?embed=1`
- `startWhepPreview()` — async WHEP viewer, muted (no echo), auto-retries on ICE failure
- `stopChatPoll()` — closes WHEP peer connection and DELETEs resource URL on stream end

**Fixed chat in stream manager (`services/openvibe-live/public/js/stream-manager.js`):**
- Added `state.chatUrl` populated from dashboard API `chat_url` field; all chat fetches now use it as base with `mode: 'cors'`
- `pollChat` response key: `data.messages` → `data.items` (matches openvibe-chat `wrappedHistory` response)
- Chat send body field: `{ content: text }` → `{ body: text }` (matches chat service `b.body`)
- Previously: all chat URLs were relative (`/api/chat/...`) — openvibe-live has no such routes; chat is a separate service

**Added `chat_url` to config + dashboard API (`services/openvibe-live/server/config.js` + `index.js`):**
- `config.chat = { url: process.env.OPENVIBE_CHAT_URL || resolvePublicOrigin({ surface: 'chat' }) }`
- `buildGoLiveDashboardState` now includes `chat_url: config.chat.url` in its return

**Cleaned up openre.stream landing page (`services/openre-stream/public/index.html`):**
- Removed all browser streaming code: `getMediaStream`, `startWhip`, `stopWhip`, `stopBrowserStream`, `handleGoLive`, `selectSource`, plus all related state vars, CSS, and window exports
- `renderBrowserPanel()` now shows a redirect notice + "Go to Stream Manager →" link pointing to `{openvibe.live}/go-live`
- openre.stream scope: restream destinations only; all streaming management belongs on openvibe.live

**Created `STREAMING_CLAUDE.md` at repo root:**
- Full architecture overview (3 services, ports, roles)
- Complete browser broadcast flow (WHIP, 5 steps)
- OBS/RTMP broadcast flow
- Viewer flow (WHEP) with SDP answer construction details
- Live tab preview details
- Chat flow for both watch page and live tab
- Infrastructure requirements (mediasoup binary, UDP ports, MEDIASOUP_ANNOUNCED_IP, TURN)
- Table of all fixes made in this session
- Known remaining gaps (TURN wiring, viewer count polling, RTMP sync verification)

**Files changed:**

| File | Change |
|---|---|
| `services/openre-stream/server/whip.js` | Added WHEP endpoint implementation (`handleWhepOffer`, `handleWhepDelete`, `buildWhepSdpAnswer`, `viewerSessions`) |
| `services/openre-stream/server/index.js` | Registered WHEP routes (`POST /whep/:slug`, `DELETE /whep/:slug/:id`, CORS preflight OPTIONS) |
| `services/openvibe-live/server/ssr.js` | Live stream watch page: renders `<video>` + WHEP viewer JS instead of broken CSS play-button |
| `services/openvibe-live/public/js/stream-manager.js` | Chat URL fix, response key fix, send body fix, live tab WHEP preview, WHEP cleanup on stream end; bumped to `v=20260524-2` |
| `services/openvibe-live/server/config.js` | Added `chat.url` |
| `services/openvibe-live/server/index.js` | Added `chat_url` to dashboard API response |
| `services/openre-stream/public/index.html` | Removed browser streaming UI; added redirect to openvibe.live/go-live |
| `STREAMING_CLAUDE.md` | New — full streaming architecture + fix log + known gaps |
| `services/openre-stream/server/whip.js` | **Critical:** WHIP room key `channel-${channel.id}` → `channel-${channelSlug}` — broadcast-ws and WHEP both use slug-keyed rooms; WHIP was creating a mismatched room so all viewers and the WS bridge saw zero producers |
| `services/openvibe-live/server/ssr.js` | Watch page WHEP viewer: `iceServers: []` → STUN server — viewers behind NAT were silently failing ICE |
| `CHAT_CLAUDE.md` | Added stream manager live tab chat integration section |

---

## Session — 2026-05-23 (part 16) — CI test fixes

### What was done

**Fixed all test failures caused by our previous changes + pre-existing schema drift:**

**`postgres-migrations` — schema drift in two services:**
- Added `community_themes` table + 2 indexes to `services/openvibe-network/server/migrations/postgres/001_init.sql` — table existed in SQLite schema but was missing from the Postgres migration
- Added `community_page_views` table to `services/openvibe-community/server/migrations/postgres/001_init.sql` — same drift issue

**`chat-smoke.test.js` — policy assertion updated:**
- Line 110: flipped `allow` assertion from `false` → `true` for anonymous sends to public rooms
- The chat policy intentionally allows anonymous sends to public rooms (identity carried via `metadata.sender_name`); the test was stale

**`home-feed.test.js` — VOD route always 404 in tests:**
- Added `process.env.ENABLE_VOD = 'true'` to the test env setup
- `/vod/:id` was gated on `config.features.vodEnabled` which reads `ENABLE_VOD`; test never set it so the route always returned 404

**Previous session fixes (carried forward):**
- `community-smoke`: added `community-phase16-chip` div + `community-links` nav to `services/openvibe-community/public/index.html`
- `ssr-pages.test.js`: fixed `content:` → `body:` in paste view test; rewrote `renderPulsePage()` from static placeholder to real implementation
- `sourcevibe-engine.test.js`: updated assertions to match new games grid homepage (`OpenVibe Games`, `Play OpenVibe games`)

**Not fixed (local-only, pass on CI):**
- `migrate-hobo/*` and `openvibe-api/*` — `better-sqlite3` native binary not compiled locally; CI rebuilds it with `npm rebuild better-sqlite3 --build-from-source` on every run

---

## Session — 2026-05-23 (part 15) — Paste sorting, image fix, paste strip, wallet nav button

### What was done

**Paste sorting (`/pastes`):**
- `listPastes` in `model.js` now accepts `sort` (`'recent'` default → `ORDER BY rowid DESC`, `'views'` → `ORDER BY view_count DESC, rowid DESC`) and `offset` params. Also accepts `excludeId` to filter one paste out.
- `/pastes` SSR route reads `?sort=views|recent` and passes it through
- `renderPastesPage` in `ssr.js` renders two sort buttons ("Most recent" / "Most viewed") — active state highlighted with accent border/color

**Paste image fix (`/p/:slug`):**
- `renderPasteViewPage` was using `paste.content` which doesn't exist — the model returns `paste.body`. Fixed to `paste.body` everywhere in `ssr.js`
- `_pasteCard` had the same bug (preview never showed for text pastes) — fixed
- `renderPasteViewPage` now renders `paste.metadata.image_url` as a full-width image above the data points (object-fit: contain, max-height 420px)

**Paste strip below view:**
- `/p/:slug` route now also fetches `listPastes({ visibility: 'public', limit: 16, excludeId: paste.id })` and passes as `opts.morePastes`
- `renderPasteViewPage` renders a horizontally scrollable strip of cards at the bottom: thumbnail (if any), language label, title (2-line clamp), views + time
- Hover border highlight on each card, scrollbar-width: thin

**Wallet copy in nav dropdown:**
- Auth dropdown in `openvibe-network/public/assets/openvibe.js` now has a "Copy wallet address" button (hidden by default)
- After render, fetches `openvibe.wallet` user module — shows button only if `solana_address` is set
- Only applies to openvibe-network (other services use inline buttons for auth, not a dropdown)

**Files changed:**

| File | Change |
|---|---|
| `services/openvibe-community/server/model.js` | `listPastes` — added `sort`, `offset`, `excludeId` params |
| `services/openvibe-community/server/index.js` | `/pastes` passes sort; `/p/:slug` fetches morePastes |
| `services/openvibe-community/server/ssr.js` | Sort buttons on pastes page; image + body fix + paste strip on view page |
| `services/openvibe-network/public/my.html` | Wallet section with legal disclaimer, address save/remove |
| `services/openvibe-network/public/assets/openvibe.js` | Wallet copy button in auth dropdown |

---

## Session — 2026-05-23 (part 14) — Games page, Minesweeper, Wallet section

### What was done

**openvibe-games homepage rewrite (`services/openvibe-games/public/index.html`):**
- Stripped all SourceVibe-branded markup and replaced with standard OpenVibe chrome (`openvibe.css`, `openvibe-icons.js`, `openvibe.js`, `renderChrome('games')`)
- Clean game grid: cards with 16:9 thumbnail (img or emoji fallback), name, description, accent-colored tag pills
- GAMES array in JS — add one object per game, no other changes needed
- Currently two entries: 2D World and Minesweeper

**Minesweeper (`services/openvibe-games/public/minesweeper/`):**
- `index.html` — HTML shell only, links to `game.css` and `game.js`
- `game.css` — all styles (board, cells, modal, number colors, responsive)
- `game.js` — full game logic: Easy/Medium/Hard difficulties, first-click safety, flood-fill, right-click flags, timer, win/lose modal
- Pattern established: each game lives in its own folder with separate HTML/CSS/JS files

**Wallet section (`services/openvibe-network/public/my.html`):**
- Added **Wallet** section to My Account (sidenav + section block), between Linked accounts and Theme
- Prominent legal disclaimer card (orange border): OpenVibe cannot store keyphrases, cannot recover wallets, cannot guarantee safety of funds, peer-to-peer only, tax implications noted
- No wallet set → paste field with base58 validation (32–44 chars, base58 regex) + Save button
- Wallet set → shows address with Copy button + Remove option
- Address stored in `openvibe.wallet` user module (`{ solana_address: "..." }`)
- Wallet generation is **opt-in only** — nothing triggers on signup or page load; user must visit My Account → Wallet to set up
- Hidden from unauthenticated users (added to the hidden sections list)

**Wallet copy in nav dropdown (`services/openvibe-network/public/assets/openvibe.js`):**
- Auth dropdown now includes a "Copy wallet address" button between Account and Sign out
- Button is hidden by default; after dropdown renders, fetches `openvibe.wallet` module — only shows if address is set
- Clicking copies address to clipboard, shows "Copied!" for 2s, then reverts
- Only applies to openvibe-network (other services use inline buttons for auth users, not a dropdown)

**Files changed:**

| File | Change |
|---|---|
| `services/openvibe-games/public/index.html` | Rewritten — OpenVibe chrome + game grid |
| `services/openvibe-games/public/minesweeper/index.html` | NEW — HTML shell |
| `services/openvibe-games/public/minesweeper/game.css` | NEW — Minesweeper styles |
| `services/openvibe-games/public/minesweeper/game.js` | NEW — Minesweeper game logic |
| `services/openvibe-network/public/my.html` | Added Wallet section with disclaimer + address management |
| `services/openvibe-network/public/assets/openvibe.js` | Auth dropdown — wallet copy button (hidden when no address set) |

---

## Session — 2026-05-23 (part 13) — Community theme submission

### Goal

Let users design a theme on the themes page and submit it so it appears in a community gallery others can browse and apply — no JSON, no GitHub PR, just a button.

### What was done

**Backend:**
- Added `community_themes` table to `db.js` (migration-safe `CREATE TABLE IF NOT EXISTS`) with: `id`, `user_id`, `author_name`, `name`, `description`, `accent`, `accent2`, `preview`, `vars_json`, `created_at`
- Created `services/openvibe-network/server/api/community-themes.js` — builds the full `vars` object server-side from the 5 palette colors, generates the preview gradient, stores and returns the theme
- `GET /api/v1/themes/community` — public, newest-first, supports `limit`/`offset`
- `POST /api/v1/themes/community` — requires auth; body: `{ name, description, palette: { bg, accent, accent2, text, textDim } }`; validates all 5 colors are valid hex; 400 on bad input, 401 if not signed in
- Mounted in `index.js` via `communityThemes.buildRouter({ requireAuth: requireOpenVibeAuth(authClient) })`

**Frontend (`themes.html`):**
- Custom palette panel now has a **Name** input (required for submission) and **Description** textarea (optional) below the color pickers
- Split save/submit into two buttons:
  - **"Apply to me"** — saves palette to `localStorage['openvibe.theme.custom']`, calls `applyTheme('custom')` and `syncThemePreference('custom')` (syncs to user account), no public sharing
  - **"Submit Theme"** — POSTs to `POST /api/v1/themes/community`; shows inline status ("submitted!", error, or "Sign in to submit themes." on 401)
- Added **Community Themes** section below built-ins — hidden when empty, shows when themes exist; each tile renders name + author, clicking applies immediately via `Object.entries(vars)`
- Status message clears after 2.5s on success

**Files changed:**

| File | Change |
|---|---|
| `services/openvibe-network/server/db.js` | Added `community_themes` table + indexes to `SCHEMA_SQL` |
| `services/openvibe-network/server/api/community-themes.js` | NEW — GET + POST handlers |
| `services/openvibe-network/server/index.js` | Require + mount `communityThemes` router |
| `services/openvibe-network/public/themes.html` | Name/desc inputs, two action buttons, community section, inline status |

---

## Session — 2026-05-23 (part 12) — Theme architecture extraction (Phase 1)

### Goal

Themes were scattered across 7 openvibe.js files in two slightly different schemas. The goal was to establish a single source of truth and eliminate the schema split so themes can be edited in one place.

### What was done

**Single source of truth:**
- Created `packages/openvibe-themes/themes.json` — all 8 themes in a unified schema
- Each theme has a `vars` object containing every CSS variable for every service (both `--ov-*` and the legacy `--panel`/`--muted`/etc. aliases for live)
- This eliminates the two-schema split that existed before (Schema 1 for network/chat, Schema 2 for community/games/live/media/tools)

**Sync script:**
- Created `scripts/sync-themes.js` — reads `themes.json`, generates a JS `BUILTIN_THEMES` constant, and stamps it into all 7 openvibe.js files between `// <openvibe-themes-generated>` … `// </openvibe-themes-generated>` markers
- Usage: `node scripts/sync-themes.js`
- From now on, editing a theme means editing `themes.json` and running the sync script — no manual edits to any openvibe.js needed

**Schema-agnostic `applyTheme`:**
- Updated `applyTheme` in all 7 openvibe.js files to replace ~10 individual `root.style.setProperty(k, theme.field)` calls with:
  ```js
  Object.entries(theme.vars || {}).forEach(function(e) { root.style.setProperty(e[0], e[1]); });
  ```
- The custom palette override block is unchanged (still reads localStorage and derives vars on the fly)
- Color-scheme is still set separately: `theme.colorScheme || (theme.id === 'openvibe-light' ? 'light' : 'dark')`

**API endpoint:**
- Added `GET /api/v1/themes` to openvibe-network — returns `{ items: [...] }` from themes.json
- Foundation for the future no-code theme builder UI

**Documentation:**
- Rewrote `THEMES_CLAUDE.md` to reflect the new architecture: single JSON, sync script, unified vars schema, API endpoint, Phase 1/2 roadmap

### Files changed

| File | Change |
|---|---|
| `packages/openvibe-themes/themes.json` | NEW — unified source of truth for all 8 themes |
| `scripts/sync-themes.js` | NEW — stamps themes.json into all 7 service files |
| All 7 `services/*/public/assets/openvibe.js` | Added `// <openvibe-themes-generated>` markers; `applyTheme` now uses `Object.entries(theme.vars)` loop |
| `services/openvibe-network/server/index.js` | Added `GET /api/v1/themes` endpoint |
| `THEMES_CLAUDE.md` | Full rewrite for new architecture |

### Phase 2 (not done yet)

Full no-code theme builder: pick colors, backgrounds, fonts, border radius on the themes page, generate a submittable theme JSON. The `vars` flat object schema and the `/api/v1/themes` endpoint are the building blocks.

---

## Session — 2026-05-23 (part 11) — HoboStreamer theme + Custom Palette

### HoboStreamer theme

Added a new built-in theme based on the HoboStreamer.com design system (campfire amber on near-black).

**Colors sourced from:** `https://github.com/HoboStreamer/HoboStreamer.com` CSS files (`style.css`, `cosmetics.css`)

| Field | Value | Source |
|---|---|---|
| `accent` | `#c0965c` | `--accent` campfire amber |
| `accent2` | `#dbb077` | `--accent-light` |
| `bg` | `#0d0d0f` | `--bg-primary` |
| `text` | `#e8e6e3` | `--text-primary` cream |
| `textDim` | `#9a9a9a` | `--text-secondary` |

The theme uses dark, near-black backgrounds with warm amber accents. It sits at position 7 in `BUILTIN_THEMES` — off the popup picker's `slice(0, 6)` limit — so it only appears on the themes page.

**Files changed:** All 7 `services/*/public/assets/openvibe.js`

---

### Custom Palette theme

Added a `custom` theme (position 8) that lets users pick their own 5 colors on the themes page.

**How it works:**
- `themes.html` renders a color picker panel (5 `<input type="color">` swatches) below the grid when the Custom Palette tile is selected
- Picking a color saves to `localStorage['openvibe.theme.custom']` as `{ bg, accent, accent2, text, textDim }` and calls `applyTheme('custom')` immediately (live preview)
- `applyTheme` in all 7 openvibe.js files has a new `if (themeId === 'custom')` block that reads saved colors from localStorage and overrides CSS variables, including deriving `bgSoft`/`bgElev`/`bgElev2` from `bg` and `border` from `accent` at 0.18 opacity
- Custom palette colors are browser-local only (not synced to user-modules API)

**Files changed:**
- All 7 `services/*/public/assets/openvibe.js` — added `custom` to `BUILTIN_THEMES`, added custom override block in `applyTheme`
- `services/openvibe-network/public/themes.html` — color picker panel HTML + CSS + JS
- `THEMES_CLAUDE.md` — full rewrite documenting both schemas, all 8 themes, custom palette system

---

## Session — 2026-05-23 (part 10) — VOD toggle + floating chat bubble (items 11 + 12)

### Item 11 — VOD feature flag (disabled by default)

VODs are off unless `ENABLE_VOD=true` is set in the environment. When disabled, the routes return 404 and the nav item is hidden.

**Files changed:**

- `services/openvibe-live/server/config.js` — added `features: { vodEnabled: process.env.ENABLE_VOD === 'true' }` to module.exports
- `services/openvibe-live/server/ssr.js` — added `const VOD_ENABLED = process.env.ENABLE_VOD === 'true';` before `renderNav()`; VODs nav item is now conditional: `...(VOD_ENABLED ? [{ href: '/vods', ... }] : [])`
- `services/openvibe-live/server/index.js` — three routes gated with `if (!config.features.vodEnabled) return res.status(404)...`:
  - `GET /vods` → 404 HTML
  - `GET /vod/:id` → 404 HTML
  - `GET /api/v1/vods` → 404 JSON `{ error: 'not_found' }`

---

### Item 12 — Floating chat bubble on all services except openvibe.chat

A fixed-position 💬 bubble appears in the bottom-right corner of every service and links to `openvibe.chat`. Clicking opens chat in a new tab.

**Style:** `position:fixed; bottom:1.25rem; right:1.25rem; z-index:9999; width:3rem; height:3rem; border-radius:50%; background:linear-gradient(135deg,#8b5cf6,#22d3ee); box-shadow:0 4px 16px rgba(0,0,0,0.35)`

**Files changed:**

| File | How chat URL is determined |
|------|---------------------------|
| `services/openvibe-community/server/ssr.js` | Server-side template literal using `${COMMUNITY_URLS.chat}` (resolved at startup from env/defaults) |
| `services/openvibe-live/server/ssr.js` | Server-side template literal using `${LIVE_NETWORK_URLS.chat}` |
| `services/openre-stream/public/index.html` | Inline JS IIFE: `hostname.endsWith('.localhost')` → `http://openvibe.chat.localhost:4800`, else `https://openvibe.chat` |
| `services/openvibe-tools/public/index.html` | Same inline JS IIFE (appended inside existing `<script>` block) |
| `services/openvibe-network/public/my.html` | Same inline JS IIFE (My Account page) |
| `services/openvibe-network/public/themes.html` | Same inline JS IIFE (Themes page) |

The network home (`index.html`) already had a full embedded chat widget — no bubble needed there.

---

## ✅ ALL 14 ITEMS COMPLETE

| # | Item | Status |
|---|------|--------|
| 1 | Theme selector fixed + rolled out to all 7 services | ✅ |
| 2 | Cross-service SSO (`.localhost` cookie) | ✅ |
| 3 | Chat authorize button (relative → absolute URL) | ✅ |
| 4 | Stream-specific chatrooms in sidebar | ✅ |
| 5 | Stale live streams fix | ✅ |
| 6 | Favorite streams + threads (network home) | ✅ |
| 7 | Community landing page (threads + pastes) | ✅ |
| 8 | Community pages section (`/pages`) | ✅ |
| 9 | finditfixit community page | ✅ |
| 10 | openre.stream overhaul (channel=account, browser quick-start, WHIP) | ✅ |
| 11 | VOD feature flag (`ENABLE_VOD=true` to enable) | ✅ |
| 12 | Floating chat bubble on all non-chat services | ✅ |
| 13 | Auth analysis + fixes (bridge links, openvibe.js in community shell) | ✅ |
| 14 | Favorites server-side sync (user-modules API for channels + tools) | ✅ |

---

## Session — 2026-05-23 (part 9) — openre.stream overhaul (item 10)

### openre.stream — channel = your account, browser quick-start, credentials panel

**File changed:** `services/openre-stream/public/index.html` (full rewrite)

**What changed:**

1. **No more channel creation.** Your account IS your channel. On first load after sign-in, the service calls `GET /api/v1/channels?owner_user_id=...` — if no channel exists, it auto-creates one with `slug = slugify(username)` via `POST /api/v1/channels`. The channel form and all channel management UI is gone.

2. **Ingest credentials panel** (left column, always visible when signed in):
   - RTMP Server field with copy button
   - Stream key field — hidden by default (●●●●), reveal/hide toggle + copy button
   - "Regenerate key" button (with confirmation) → `POST /api/v1/channels/:slug/regenerate-key`
   - OBS setup instructions inline

3. **Browser quick-start panel** (right column):
   - Three source tiles: Camera (webcam + mic), Screen (display capture), Camera + screen
   - Single "Go live from browser" button — no forms, no extra steps
   - Browser asks for permissions, then streams immediately via WHIP to `/whip/:channelSlug?key=:streamKey`
   - Shows live preview video + animated LIVE indicator + elapsed timer
   - "Stop stream" button cleans up: closes RTCPeerConnection, stops tracks, sends DELETE to WHIP resource URL

4. **Restream destinations** — unchanged functionally. Add form on the right (platform/label/RTMP URL/stream key), saved destinations list on the left with individual delete buttons.

5. **Recent streams** — shows last 6 streams for the user's channel with status pills.

6. **Sign-out hero** — unauthenticated users see a simple hero with sign-in CTA instead of the dashboard.

**WHIP browser streaming flow:**
```
selectSource('camera'|'screen'|'both') → handleGoLive()
  → getMediaStream() → getUserMedia / getDisplayMedia
  → startWhip(channelSlug, streamKey, mediaStream)
      → new RTCPeerConnection()
      → addTrack() for each media track
      → createOffer() → setLocalDescription()
      → wait for ICE gathering complete (or 4s timeout)
      → POST /whip/:slug?key=:key with SDP
      → setRemoteDescription(answer SDP)
  → show live preview + timer
  → on connectionState disconnected/failed: auto-stop
stopBrowserStream() → pc.close() → DELETE /whip resource URL → stop tracks
```

**Test updated:** `services/openre-stream/test/lifecycle.test.js` — replaced stale assertions (hero copy, "Creator dashboard") with check for `/whip/` reference in the shell.

---

## Session — 2026-05-23 (part 8) — Auth analysis + fixes (item 13)

### Auth system analysis

Traced the full auth architecture across all services. See `AUTH_CLAUDE.md` for the complete developer reference.

**Two auth patterns found:**
- Pattern A (live, restream, tips): own `/auth/login` → bridge → `/auth/callback` → local session cookie
- Pattern B (community, tools): `.localhost` domain cookie SSO + client-side sessionStorage via bridge

**Bugs found and fixed:**

#### 1. Community SSR: broken sign-in links (`/auth/login` doesn't exist on network)
**File:** `services/openvibe-community/server/ssr.js`

All 5 occurrences of `${COMMUNITY_URLS.network}/auth/login` replaced with `${SIGN_IN_URL}`.
The `/auth/anonymous` link replaced with `${ANON_URL}` (points to `/oauth/authorize?prompt=anonymous`).

Added two constants at the top of ssr.js:
```js
const SIGN_IN_URL = `${COMMUNITY_URLS.network}/api/v1/session/bridge?return_to=${encodeURIComponent(COMMUNITY_URLS.community)}`;
const ANON_URL = `${COMMUNITY_URLS.network}/oauth/authorize?prompt=anonymous`;
```

#### 2. Network tools.html: broken `/auth/login` and `/auth/register` links
**File:** `services/openvibe-network/public/tools.html`

Neither route exists on the network service. Changed to `/oauth/authorize` (the actual login page).

#### 3. Community SSR shell: missing openvibe.js script tag
**File:** `services/openvibe-community/server/ssr.js`

SSR pages (/pulse, /threads, /pastes, /p/:slug, /threads/:id, etc.) were not loading `openvibe.js`. Added:
```html
<script src="/assets/openvibe.js" defer></script>
```

Without this, thread favorite stars did nothing, session exchange never ran, and the auth-changed event was never fired on SSR pages.

#### 4. Community SSR shell: nav doesn't update after sign-in
Added `id="ov-nav-auth"` to the nav auth div and an inline script that listens for `openvibe-auth-changed`:
- Authenticated: shows display_name/username linking to My Account
- Anonymous/guest: shows "Sign in" bridge link

### AUTH_CLAUDE.md
Created `AUTH_CLAUDE.md` at monorepo root — full developer reference covering both auth patterns, the bridge endpoint, session exchange, cookie setup, token verification, and a "known broken patterns" section with the 2026-05-23 fixes.

---

## Session — 2026-05-23 (part 7) — Community Pages section (items 7, 8, 9)

### Community Pages — /pages section on openvibe.community

**Files changed:**
- `services/openvibe-community/server/db.js` — added `community_page_views` table to `SCHEMA_SQL` (tracks slug, view_count, last_viewed_at; uses UPSERT on each page visit).
- `services/openvibe-community/server/pages-registry.json` — new file; JSON array of page metadata entries (`slug`, `title`, `author`, `description`, `tags`, `created_at`). First entry: `finditfixit`.
- `services/openvibe-community/server/routes.js` — added `loadPagesRegistry()`, `bumpPageView(slug)`, `getPageViews(slug)` helpers; added `GET /api/community/pages` endpoint (returns registry + view counts, sorted by views desc); exported helpers for use in `index.js`.
- `services/openvibe-community/server/index.js` — added routes:
  - `GET /pages` — SSR pages listing
  - `GET /pages/submit` — SSR submission guide
  - `GET /pages/:slug` — bumps view count, serves `public/pages/:slug.html`; 404s with listing page if not in registry or file missing
  - `GET /finditfixit` and `GET /finditfixit.html` — 301 redirects to `/pages/finditfixit`
- `services/openvibe-community/server/ssr.js` — added "Pages" to `_nav()` between Pastes and Chat; added `renderPagesPage(registry, opts)` and `renderSubmitPage()`; both exported.
- `services/openvibe-community/public/pages/finditfixit.html` — finditfixit's personal page now lives here (migrated from community root).
- `services/openvibe-community/public/index.html` — added "Community Pages" section between Threads and Pastes; fetches from `/api/community/pages`; renders as `ov-card` grid with view counts and author; includes "+ Submit your page" link.
- `services/openvibe-tools/public/finditfixit.html` — replaced with a redirect page (`<meta http-equiv="refresh">` + `window.location.replace`) pointing to `openvibe.community/pages/finditfixit`. Keeps existing links working.

### How to add a new community page
1. Drop `yourname.html` in `services/openvibe-community/public/pages/`
2. Add an entry to `server/pages-registry.json` with slug, title, author, description
3. The page is immediately live at `/pages/yourname` and shows up in the listing + highlight reel

---

## Session — 2026-05-23 (part 6) — My Account scrollable layout, community landing threads + pastes, one-thread-per-paste DB enforcement

### My Account — scrollable sections (no tabs)

**File changed:** `services/openvibe-network/public/my.html`

Replaced the tab-based layout with a single scrollable page. All eight sections (Profile, Security, Stream, Chat, Bookmarks, Notifications, Linked accounts, Theme) are stacked vertically and always visible. A sticky sidebar nav (`<nav class="my-sidenav">`) provides anchor links so users can jump to any section without hiding content. On mobile the sidebar collapses to a horizontal chip row. All section content and interactivity (token reveal/copy, session revoke, credential rows, banned words save, bookmark remove, theme apply) is identical to the previous tab version.

Key CSS classes: `.my-layout` (2-col grid), `.my-sidenav` (sticky, collapses on mobile), `.my-sections`, `.my-section`, `.my-section-title`, `.my-section-sub`.

---

### Community landing page — shows both threads and pastes

**File changed:** `services/openvibe-community/public/index.html`

- Title changed from "Pastes — OpenVibe" to "Community — OpenVibe".
- Page now has two sections: **Threads** (top, loads from `GET /api/community/threads?limit=8`) and **Pastes** (below, loads from `GET /api/community/pastes?limit=12`).
- Each thread renders as a `.community-thread-card` link to `/threads/:id` with a favorite star button (saves to `ov-fav-threads` localStorage and syncs to user-modules for signed-in users).
- "Browse all →" links for both sections point to the SSR pages (`/threads`, `/pastes`).
- Thread filter: only `paste_thread` and `discussion` types are shown (excludes `discord_relay`, etc.).
- Paste composer modal and auth check logic unchanged.

---

### One thread per paste — DB-level unique index

**File changed:** `services/openvibe-community/server/db.js`

Added a partial UNIQUE index in `applyLegacyBootstrap()`:
```sql
CREATE UNIQUE INDEX idx_paste_thread_unique_ref ON community_threads(ref_type, ref_id)
WHERE thread_type = 'paste_thread' AND ref_type IS NOT NULL AND ref_id IS NOT NULL
```
Applied idempotently (checks `sqlite_master` before creating). Catches the error and logs a warning if existing data has duplicates, so it doesn't crash the server on startup. The application-level guard in `routes.js` (`findPasteThread` check before `createThread`) was already in place — this is the DB safety net.

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

---

## Session — 2026-05-24 (part 18) — Chat bubble refactor: standalone widget

### Problem
Every service had its own chat bubble implementation. Six of them (`openvibe-tools`, `openvibe-network/themes.html`, `openvibe-network/my.html`, `openre-stream`, `openvibe-live` SSR, `openvibe-community` SSR) used a simple `<a href="https://openvibe.chat">💬</a>` redirect button — no inline chat panel. The network home page (`openvibe-network/index.html`) had the full inline widget but it was ~400 lines of duplicated HTML/CSS/JS.

### Fix
Created `services/openvibe-network/public/assets/chat-bubble.js` — a fully self-contained widget that:
- Injects its own CSS into `<head>` and creates the button + panel DOM on load
- Polls `GET /api/chat/rooms/global/messages` every 3s; shows unread badge when closed
- Sends to `POST /api/chat/rooms/global/messages`
- Resolves chat base URL via `OpenVibe.resolveSurfaceUrl('chat')` with hostname fallback
- Guards against double-mount with an early return if the button already exists

Copied the file identically to all 5 other services' `public/assets/` directories (creating `openre-stream/public/assets/` which didn't exist).

Replaced all 7 old bubble implementations (6 redirect `<a>` tags + 1 inline network home widget) with a single tag:
```html
<script src="/assets/chat-bubble.js" defer></script>
```

### Files changed
| File | Change |
|------|--------|
| `services/openvibe-network/public/assets/chat-bubble.js` | **Created** — the canonical widget |
| `services/openvibe-tools/public/assets/chat-bubble.js` | **Created** — copy |
| `services/openre-stream/public/assets/chat-bubble.js` | **Created** — copy (also created `public/assets/` dir) |
| `services/openvibe-live/public/assets/chat-bubble.js` | **Created** — copy |
| `services/openvibe-community/public/assets/chat-bubble.js` | **Created** — copy |
| `services/openvibe-network/public/index.html` | Removed ~400-line inline widget; replaced with script tag |
| `services/openvibe-network/public/themes.html` | Removed redirect IIFE; replaced with script tag |
| `services/openvibe-network/public/my.html` | Removed redirect IIFE; replaced with script tag |
| `services/openvibe-tools/public/index.html` | Removed redirect IIFE; replaced with script tag |
| `services/openre-stream/public/index.html` | Removed redirect `<script>` block; replaced with script tag |
| `services/openvibe-live/server/ssr.js` | Replaced redirect `<a>` in template with script tag |
| `services/openvibe-community/server/ssr.js` | Replaced redirect `<a>` in template with script tag |
| `CHAT_CLAUDE.md` | Updated Global chat widget section to reflect standalone file |

---

## Session — 2026-05-24 (part 19) — Games cards fix, community pages routing, finditfixit proxy integration

### openvibe.games — game cards not rendering

**Problem:** The games homepage (`/`) showed a blank grid. The IIFE awaited `OpenVibe.primeEnvironment()` and `OpenVibe.renderChrome('games')` before building `grid.innerHTML`, so any chrome error crashed the whole script before the cards rendered.

**Fix (`services/openvibe-games/public/index.html`):**
- Moved `grid.innerHTML = GAMES.map(...)` to execute first, unconditionally
- Added inline `esc()` helper so the grid doesn't depend on `OpenVibe.escapeHtml` being available
- Wrapped both chrome calls in `try/catch` — nav failures no longer block the game cards

---

### openvibe.community — pages not showing / routing broken

**Problems:**
1. Community home showed "No community pages yet" even though `pages-registry.json` had entries — `loadPagesRegistry()` used `require()` which caches JSON forever; pages added after server start were invisible
2. `Cannot GET /pages/` and `Cannot GET /pages/finditfixit` — routes registered as `/pages` and `/pages/:slug` with no trailing-slash variants
3. `/pages/finditfixit.html` worked (static serve) but `/pages/finditfixit` (clean URL) didn't — `express.static` doesn't resolve `.html` extensions by default
4. Two identical copies of `finditfixit.html` (`public/finditfixit.html` and `public/pages/finditfixit.html`)
5. `finditfixits-proxy.py` — a separate Python HTTP server on `localhost:7779` that had to be run manually; page would silently break without it

**Fixes:**

**`server/routes.js`** — `loadPagesRegistry`:
- Replaced `require('pages-registry.json')` with `JSON.parse(fs.readFileSync(...))` — reads fresh from disk on every request, no restart needed when adding pages

**`server/index.js`:**
- `express.static(..., { extensions: ['html'] })` — clean URLs like `/pages/finditfixit` now resolve to `public/pages/finditfixit.html` automatically
- Routes changed to array form for trailing slash support: `['/pages', '/pages/']`, `['/pages/submit', '/pages/submit/']`, `['/pages/:slug', '/pages/:slug/']`
- Imported and mounted `buildFinditfixitRouter()` at `/api/community/finditfixit` (browser-facing, no internal key required)

**`server/routes-finditfixit.js`** (new file):
- Pure Node.js proxy — no Python, no external dependencies beyond Node built-ins
- `GET /api/community/finditfixit/status[?last_online=ISO]` — checks RoboStreamer live status + OpenVibe Live channel; in-memory last-seen tracker
- `GET /api/community/finditfixit/deals` — scrapes DuckDuckGo HTML for fast food deals near Killeen TX
- `GET /api/community/finditfixit/findit[?q=query]` — queries Craigslist Killeen JSON search API for free/broken items

**`public/pages/finditfixit.html`:**
- All three `fetch('http://localhost:7779/...')` calls replaced with `/api/community/finditfixit/...`
- Error message no longer mentions the Python proxy

**Deleted:**
- `public/finditfixit.html` — duplicate (keep only `public/pages/finditfixit.html`)
- `public/finditfixits-proxy.py` — replaced by Node routes above

### Files changed
| File | Change |
|------|--------|
| `services/openvibe-games/public/index.html` | Render cards before chrome calls; guard chrome with try/catch |
| `services/openvibe-community/server/routes.js` | `loadPagesRegistry`: `require()` → `fs.readFileSync` |
| `services/openvibe-community/server/index.js` | Static extensions; trailing slash routes; mount finditfixit router |
| `services/openvibe-community/server/routes-finditfixit.js` | **Created** — Node proxy for status/deals/findit endpoints |
| `services/openvibe-community/public/pages/finditfixit.html` | Fetch URLs → `/api/community/finditfixit/*` |
| `services/openvibe-community/public/finditfixit.html` | **Deleted** — was duplicate of pages/ version |
| `services/openvibe-community/public/finditfixits-proxy.py` | **Deleted** — replaced by Node routes |

---

## Session — 2026-05-24 (part 20) — openvibe.network services directory: missing surfaces added

### Problem
The services directory row on `openvibe.network` was missing many planned and built surfaces — `openvibe.trade`, `openvibe.tips`, `openvibe.blog`, `openvibe.wiki`, `openvibe.codes`, `openvibe.news`, `openvibe.deals`, `openvibe.coupons`, `workers.openvibe.network`, `realtime.openvibe.network`. The `openvibe-community` entry was also mislabeled "Pastes".

Root cause: `openvibe.js` (frontend) had manually-maintained copies of the surface lookup tables that were out of sync with the authoritative `packages/openvibe-sdk/url-defaults.js` which had all surfaces defined.

### Fix (`services/openvibe-network/public/assets/openvibe.js`)

Added 13 missing surfaces to all four lookup tables — `SURFACE_URL_KEYS`, `SURFACE_FALLBACKS`, `LOCAL_SURFACE_HOSTS`, `LOCAL_SURFACE_PORTS` — matching `url-defaults.js` exactly:

| Surface | Production URL | Local port |
|---------|---------------|------------|
| workers | workers.openvibe.network | 5300 |
| realtime | realtime.openvibe.network | 5400 |
| codes / blog / wiki / news / reviews / deals / coupons / trade | openvibe.{surface} | 5500 |
| tips | openvibe.tips | 5600 |
| vip | openvibe.vip | 5000 |

Added new service IDs to `SERVICE_SURFACE_MAP`:
`openvibe-workers`, `openvibe-realtime`, `openvibe-tips`, `openvibe-trade`, `openvibe-codes`, `openvibe-blog`, `openvibe-wiki`, `openvibe-news`, `openvibe-reviews`, `openvibe-deals`, `openvibe-coupons`, `openvibe-content`

Updated `FALLBACK_SERVICES`:
- Fixed `openvibe-community`: display_name "Pastes" → "OpenVibe Community", updated description
- Added 10 new service entries: Trade, Tips, Blog, Wiki, Codes, News, Deals, Coupons, Workers, Realtime
- `spotlight: true` on Trade (it's a primary product surface)

### Files changed
| File | Change |
|------|--------|
| `services/openvibe-network/public/assets/openvibe.js` | Added 13 surfaces to all lookup tables; updated FALLBACK_SERVICES with 10 new entries + community rename |

---

## Session — 2026-05-24 (part 21) — Community SSR auth, paste image URLs, network cross-origin images

### Problems
1. Thread/paste/pulse pages on openvibe.community showed user as logged out and had no buddy icon dropdown, despite being signed in
2. Paste thumbnail images showed on openvibe.community homepage but not on openvibe.network
3. `paste.metadata.image_url` was a relative URL (`/api/paste-screenshots/...`) when `config.publicBaseUrl` was empty — works same-origin on community, silently broken cross-domain on network

### Fixes

**Community SSR shell auth (`services/openvibe-community/server/ssr.js`):**
- `_styles()`: Added full CSS block for `.ov-nav-session`, `.ov-anon-menu`, `.ov-anon-trigger`, `.ov-anon-dropdown`, `.ov-anon-dropdown-item` and `.ov-btn` variants — previously these styles only existed in openvibe-chat and openvibe-media service assets
- `_shell()`: Replaced `<div id="ov-nav-auth"><a>Sign in</a></div>` with `<div id="ov-nav-session"></div>` — `hydrateNavSession()` inside `renderChrome` looks for `id="ov-nav-session"`; old id was never found
- Removed stale `openvibe-auth-changed` event listener (replaced by renderChrome's hydrateNavSession)
- Added `<script defer>` after openvibe.js that calls `primeEnvironment()` then `renderChrome('community')` — deferred scripts run in order so OpenVibe is available

**Paste image URLs (`services/openvibe-community/server/model.js`):**
- `hydratePaste()`: Changed `config.publicBaseUrl || ''` → `config.publicBaseUrl || 'https://openvibe.community'` as fallback — ensures `image_url` is always an absolute URL even if env var not configured

**Network cross-origin images (`services/openvibe-network/public/index.html`):**
- Recent pastes grid: Check `image_url.startsWith('http')` — if relative, prefix with `communityBase` before rendering `<img src>`
- Activity feed paste cards: Same fix applied to the `_communityBase + rawImg` case

### Root cause
`renderChrome()` fills `id="nav-mount"` (full chrome nav) and `id="ov-nav-session"` (buddy icon). Community SSR had its own custom topbar and used `id="ov-nav-auth"` — so `renderChrome` couldn't hydrate it. No `primeEnvironment()` call meant session was never loaded, so user appeared unauthenticated on all SSR-rendered community pages (threads, pastes, pulse, forum).

### Files changed
| File | Change |
|------|--------|
| `services/openvibe-community/server/ssr.js` | Added buddy icon CSS; `ov-nav-auth` → `ov-nav-session`; replaced auth listener with deferred `renderChrome` call |
| `services/openvibe-community/server/model.js` | `publicBaseUrl` fallback to production URL |
| `services/openvibe-network/public/index.html` | Prefix relative image_url with communityBase in 2 places |

---

## Session — 2026-05-24 (part 22) — Theme system: CSS variable fixes across SSR pages

### Problem
Themes were not visually changing pages even when applied. Root cause: community and live SSR pages had **hardcoded color values** in their CSS that did not reference CSS variables — so even when the theme system wrote `--bg`, `--panel`, `--border` etc. via `root.style.setProperty(...)`, the body background, topbar, cards, and other elements never updated because they used literal `rgba()` / hex values.

### Fixes

**`services/openvibe-community/server/ssr.js` — `_styles()`:**
- `body { background: radial-gradient(hardcoded...) }` → `background: var(--bg, #050916)` 
- `.topbar { background: rgba(5,9,22,0.72) }` → `color-mix(in srgb, var(--bg) 72%, transparent)`
- `.glass-card { background: linear-gradient(hardcoded) }` → `background: var(--panel, ...)`
- `.nav-link`, `.section-link`, `.filter-input`, `.pill`, `.empty-state`, `.data-point`, `.paste-content` — all hardcoded rgba replaced with CSS variable equivalents using `color-mix()` for opacity variants
- `.footer-row`, `.topbar` borders updated to `var(--border)`

**`services/openvibe-live/server/ssr.js` — `_shellStyles()`:**
- Same body, topbar, card background treatment
- `.stack-item, .data-point, .media-thumb` glass card backgrounds → `var(--panel)`
- `.nav-user-dropdown` background → `color-mix(in srgb, var(--bg) 97%, transparent)`
- Media iframe/video backgrounds → `var(--bg)`

### How the theme system works (for reference)
1. `openvibe.js` top-level calls `applySavedTheme()` immediately on load → reads `localStorage['openvibe.theme']` → calls `applyTheme()` which sets ALL theme vars via `root.style.setProperty('--bg', ...)`, `--panel`, `--text`, etc. as **inline styles**, overriding any stylesheet `:root` defaults
2. `renderChrome()` → `loadSyncedThemePreference()` → fetches saved theme from network user-modules API → applies it (for authenticated cross-domain sync)
3. Pages that use `var(--bg)`, `var(--panel)` etc. in CSS react to inline style changes immediately

### What does NOT participate in the theme system
- `openvibe-tools/public/index.html` — standalone page with own CSS vars, no `openvibe.js`
- `openvibe-tips/public/index.html` + `tip-page.html` — same, standalone

### Files changed
| File | Change |
|------|--------|
| `services/openvibe-community/server/ssr.js` | All hardcoded SSR styles → CSS variables |
| `services/openvibe-live/server/ssr.js` | Body/topbar/card hardcoded backgrounds → CSS variables |

---

## Session — 2026-05-24 (part 23) — SSR reference doc + openvibe-content SSR split into 9

### Work done

**SSR_CLAUDE.md created** — new reference document at repo root cataloguing every SSR file in the monorepo:
- 5 SSR files documented: openvibe-community (1051 lines / 64 KB), openvibe-live (4503 lines / 252 KB), openvibe-content (1062 lines / 76 KB), openre-stream (608 lines / 48 KB), openvibe-control (349 lines / 16 KB)
- Each entry lists every exported render function, its route, what page it produces, and notes on auth/theme behaviour
- Also lists 9 services with no ssr.js and how they serve pages

**openvibe-content SSR split into 9 standalone surface files:**

The original monolithic `ssr.js` (1062 lines, 76 KB) was restructured into 11 files:

| File | Size | Role |
|------|------|------|
| `ssr-shared.js` | 15 KB | All rendering/utility functions shared by all 9 surfaces |
| `ssr-codes.js` | 6.6 KB | openvibe.codes — platform docs, API reference |
| `ssr-blog.js` | 5.3 KB | openvibe.blog — platform blog posts |
| `ssr-wiki.js` | 9.5 KB | openvibe.wiki — streaming technology reference |
| `ssr-news.js` | 6.2 KB | openvibe.news — streaming & creator economy news |
| `ssr-reviews.js` | 6.1 KB | openvibe.reviews — gear and software reviews |
| `ssr-deals.js` | 5.6 KB | openvibe.deals — curated deals for streamers |
| `ssr-coupons.js` | 4.5 KB | openvibe.coupons — promo codes |
| `ssr-trade.js` | 6.2 KB | openvibe.trade — gear classifieds |
| `ssr-host.js` | 9.3 KB | openvibe.host — hosting guides and reviews |
| `ssr.js` (rewritten) | 1.8 KB | Thin aggregator — dispatches by surfaceId, same public API |

### Architecture

- `ssr-shared.js` exports: `escapeHtml`, `formatBytes`, `toIsoDate`, `navItems`, `surfaceStatusNote`, `surfaceKicker`, `pageForPath`, `buildJsonLd`, `renderLayout`, `renderHome`, `renderEntry`, `renderNotFound`, `buildFeedXml`, `buildAtomXml`, `buildSitemapXml`, `buildRobotsTxt`, `renderRequest({ config, surface, routePath })`
- Each surface file exports: `buildSurface(config)` → surface object, `renderRequest({ config, routePath })` → calls shared renderRequest with its own surface
- `ssr.js` aggregator: `SURFACE_MODULES` map → `buildSurfaceCatalog(config)`, `hostStatuses(config)`, `renderRequest({ config, surfaceId, routePath })`
- `routes.js` is **untouched** — still calls `renderRequest({ config, surfaceId, routePath })` and `hostStatuses(config)` from `./ssr`

### Files changed
| File | Change |
|------|--------|
| `services/openvibe-content/server/ssr-shared.js` | New — shared rendering engine |
| `services/openvibe-content/server/ssr-codes.js` | New — openvibe.codes surface |
| `services/openvibe-content/server/ssr-blog.js` | New — openvibe.blog surface |
| `services/openvibe-content/server/ssr-wiki.js` | New — openvibe.wiki surface |
| `services/openvibe-content/server/ssr-news.js` | New — openvibe.news surface |
| `services/openvibe-content/server/ssr-reviews.js` | New — openvibe.reviews surface |
| `services/openvibe-content/server/ssr-deals.js` | New — openvibe.deals surface |
| `services/openvibe-content/server/ssr-coupons.js` | New — openvibe.coupons surface |
| `services/openvibe-content/server/ssr-trade.js` | New — openvibe.trade surface |
| `services/openvibe-content/server/ssr-host.js` | New — openvibe.host surface |
| `services/openvibe-content/server/ssr.js` | Rewritten as thin aggregator (1062 → 55 lines) |
| `SSR_CLAUDE.md` | New — SSR reference document |

---

## Session — 2026-05-24 (part 24) — openvibe-community SSR split into feature files

### Work done

Same pattern as openvibe-content (session 23) applied to the community SSR.

The original `ssr.js` (1051 lines, 64 KB) was split into 8 files:

| File | Size | Role |
|------|------|------|
| `ssr-shared.js` | 22 KB | COMMUNITY_URLS, SIGN_IN_URL, ANON_URL, utilities, `_styles()`, `_shell()`, `_threadCard()`, `_pasteCard()`, `_forumShell()` |
| `ssr-threads.js` | 12 KB | `renderThreadsPage` + `renderThreadDetailPage` |
| `ssr-pastes.js` | 12 KB | `renderPastesPage` + `renderPasteViewPage` |
| `ssr-pulse.js` | 1.5 KB | `renderPulsePage` |
| `ssr-chat.js` | 1.9 KB | `renderChatPage` |
| `ssr-pages.js` | 5.1 KB | `renderPagesPage` + `renderSubmitPage` |
| `ssr-forum.js` | 7.0 KB | `renderForumHomePage` + `renderForumSpacePage` + `renderForumThreadPage` |
| `ssr.js` (rewritten) | 0.8 KB | Thin aggregator — re-exports all 11 functions, same public API |

### Architecture

- `ssr-shared.js` owns all constants (`COMMUNITY_URLS`, `SIGN_IN_URL`, `ANON_URL`), utility functions (`escapeHtml`, `timeAgo`, `pasteLanguageLabel`), shared CSS (`_styles()`), HTML shells (`_shell()`, `_forumShell()`), and card partials (`_threadCard()`, `_pasteCard()`)
- Each feature file requires only what it needs from `ssr-shared`
- `ssr.js` aggregator simply re-exports all functions from the 6 feature files — `index.js` is untouched

### Files changed
| File | Change |
|------|--------|
| `services/openvibe-community/server/ssr-shared.js` | New — shared constants, utilities, shells, card partials |
| `services/openvibe-community/server/ssr-threads.js` | New — threads list + thread detail |
| `services/openvibe-community/server/ssr-pastes.js` | New — pastes list + paste view |
| `services/openvibe-community/server/ssr-pulse.js` | New — community pulse |
| `services/openvibe-community/server/ssr-chat.js` | New — Discord relay chat |
| `services/openvibe-community/server/ssr-pages.js` | New — community pages + submit |
| `services/openvibe-community/server/ssr-forum.js` | New — forum home, space, thread |
| `services/openvibe-community/server/ssr.js` | Rewritten as thin aggregator (1051 → 17 lines) |
| `SSR_CLAUDE.md` | Updated — section 1 rewritten to reflect new file structure |

---

## Session 25 — openvibe-live SSR split

**Date:** 2026-05-24

### Summary

Split `services/openvibe-live/server/ssr.js` (4503 lines, 252 KB — largest SSR in the repo) into 7 focused files using the same aggregator pattern as sessions 23–24.

### File structure after split

| File | Size | Role |
|------|------|------|
| `ssr-shared.js` | 107 KB | Constants, utilities, CSS, scripts, nav/footer/renderPage, all UI partials |
| `ssr-golive.js` | 71 KB | `renderGoLivePage` — 934 lines, inline styles + script |
| `ssr-media.js` | 38 KB | `renderStreamPage`, `renderMediaDetailPage`, `renderCustomMediaPlayer`, `renderCollectionPage`, `renderMissingMediaPage` |
| `ssr-channel.js` | 14 KB | `renderChannelPage`, `renderChannelsPage`, `renderOfflinePage` |
| `ssr-home.js` | 11 KB | `renderHomePage` |
| `ssr-updates.js` | 1.9 KB | `renderUpdatesPage` |
| `ssr.js` (rewritten) | 1.1 KB | Thin aggregator — re-exports all 11 functions, same public API |

### Architecture

- `ssr-shared.js` owns everything layout/utility: constants (`LIVE_NETWORK_URLS`, `BUILD_UPDATES`, `GO_LIVE_TRACKS`), 13 utility functions, `_meta()`, `_shellStyles()`, live `_shellScript()`, `VOD_ENABLED`, `renderNav`, `renderFooter`, `renderPage`, and all UI partials (`renderPill`, `renderMediaThumb`, `renderVideoCard`, `renderStreamerGroupCard`, `renderStreamCard`, `renderChannelCard`, `renderSection`, `renderSignalCard`)
- Dead code block (lines 2244–2457 of original) — a duplicate `renderChannelCard` that was never active — excluded from the split
- Each feature file requires only what it uses from `ssr-shared`
- `ssr.js` aggregator re-exports all 11 public functions

### Smoke test

All 11 exports pass with correct HTML output lengths. Public API identical to original.

### Files changed

| File | Change |
|------|--------|
| `services/openvibe-live/server/ssr-shared.js` | New — 107 KB, all constants/utilities/layout/partials |
| `services/openvibe-live/server/ssr-home.js` | New — renderHomePage |
| `services/openvibe-live/server/ssr-channel.js` | New — renderChannelPage, renderChannelsPage, renderOfflinePage |
| `services/openvibe-live/server/ssr-media.js` | New — renderStreamPage, renderMediaDetailPage, renderCustomMediaPlayer, renderCollectionPage, renderMissingMediaPage |
| `services/openvibe-live/server/ssr-golive.js` | New — renderGoLivePage |
| `services/openvibe-live/server/ssr-updates.js` | New — renderUpdatesPage |
| `services/openvibe-live/server/ssr.js` | Rewritten as thin aggregator (4503 → 22 lines) |
| `SSR_CLAUDE.md` | Updated — section 2 rewritten to reflect new file structure |

---

## Session 26 — CORS fix, restart script, seamless community auth

**Date:** 2026-05-24

### Summary

Four separate workstreams: nginx CORS hardening, a single-script platform startup, parallel service restart, and full cross-domain auth for openvibe.community.

---

### 1. nginx CORS fix for openvibe.community

**Problem:** When openvibe-community service was down (502), the browser received nginx's error page with no `Access-Control-Allow-Origin` header — causing a CORS block in the browser console on openvibe.network's index page (which fetches `https://openvibe.community/api/community/threads?limit=4` client-side).

**Root cause:** The `cors()` middleware in the Node.js app never fires when nginx returns a 502 — so no CORS headers get added to error responses.

**Fix:** Added nginx-level CORS headers with `always` flag to the `openvibe.community` location block in `deploy/nginx/live/openvibe-public.conf`:
```nginx
add_header 'Access-Control-Allow-Origin' $http_origin always;
add_header 'Access-Control-Allow-Credentials' 'true' always;
add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS' always;
add_header 'Access-Control-Allow-Headers' 'Content-Type, Authorization, X-Internal-Key' always;
```

---

### 2. Platform startup scripts

**`scripts/deploy/restart-all.sh`** (new) — production VPS restart:
- Accepts `--pull` (git pull) and `--install` (npm install) flags
- Tests nginx config before reloading
- Restarts all 17 services in parallel tiers (not serial) — see below

**`start.sh`** (new, repo root) — single entry point for both environments:
- Auto-detects production vs dev: root + systemd units installed → prod mode; normal user → dev mode
- **Prod mode**: git pull → npm install → nginx reload → parallel restart → status table
- **Dev mode**: installs node_modules if missing, kills stale port holders, checks Postgres + Redis, delegates to `scripts/dev/start-production-like-stack.sh`
- Flags: `--pull`, `--install`, `--stop`

**Deleted** `scripts/start-all-services.sh` — had a broken Python port-check (`sys.argv[1]` never passed), missing 4 services, and was superseded.

### Parallel restart tiers (why it matters on Raspberry Pi)

Old serial restart: ~68s (17 × 4s each). New parallel groups: ~16s.

| Tier | Services | Wait after |
|------|----------|-----------|
| 1 | openvibe-events | 2s |
| 2 | openvibe-network, openvibe-media, openvibe-realtime, openvibe-workers | 2s |
| 3 | all 12 product surfaces in parallel | — |

Pi-specific notes on why restarts are slow: SD card random I/O (Node.js `require()` does thousands of file reads on cold start — 10–50× slower than SSD), ARM CPU, no persistent require cache across restarts.

---

### 3. Seamless cross-domain auth for openvibe.community

**Problem:** `openvibe.community` and `openvibe.network` are different TLDs. The session cookie (`openvibe_token`) is set `Domain=.openvibe.network` — browsers never send it to `openvibe.community`. Result:
- Nav dropdown showed flat text chips (no dropdown, no avatar)
- `req.user` was always `null` on community for form POSTs → thread replies bounced with `?error=auth`
- `_forumShell` never loaded `openvibe.js` at all — forum pages had a hardcoded static "Sign in" link

#### Changes

**`services/openvibe-community/public/assets/openvibe.js`**
- Replaced flat-chip `hydrateNavSession()` with full dropdown matching openvibe.network
- Added `_navInitials(user)` — extracts initials from display_name/username
- Added `_navAvatarHtml(user)` — renders actual `avatar_url` as round img with gradient-initials fallback
- Added `_attachDropdown(target)` — shared toggle/outside-click handler for both auth states
- Three states: **signed-in** (avatar bubble + dropdown: My account, Sessions, Sign out), **anonymous** (generic icon + name + dropdown: Switch identity, Create account, Leave anonymous), **signed-out** (Anonymous + Sign in buttons)
- After getting a valid session, fires `GET /api/v1/session/sync` with the bearer token to set a same-domain cookie (see below)

**`services/openvibe-community/server/index.js`**
- Added `GET /api/v1/session/sync` endpoint (runs after `optionalOpenVibeAuth`)
- Reads the raw bearer token from `Authorization` header, validates it via the existing auth middleware (`req.user` populated = valid), sets `httpOnly` `openvibe_token` cookie for the `openvibe.community` domain
- This means form POSTs (thread replies, paste promote) carry auth credentials from that point on

**`services/openvibe-community/server/ssr-shared.js`**
- Added `.ov-nav-avatar` and `.ov-nav-initials` CSS to `_styles()` for the buddy icon rendering
- Fixed `_forumShell`: added `openvibe.js` script tag, replaced hardcoded "Sign in" link with `#ov-nav-session` div + `renderChrome` init script — forum routes now have full auth parity with the rest of community

#### Full auth flow (how it works)

1. User logs in on any `*.openvibe.network` surface → `openvibe_token` cookie set `Domain=.openvibe.network`
2. User navigates to `openvibe.community`
3. `openvibe.js` loads → `renderChrome('community')` → `hydrateNavSession()` → `exchangeNetworkSession()`
4. POSTs to `https://openvibe.network/api/v1/session/exchange` with `credentials: 'include'` (network has `cors({ origin: true, credentials: true })` — reflects origin, allows any surface)
5. Network validates cookie, returns `{ access_token, user: { ..., avatar_url } }`
6. Nav renders avatar/dropdown immediately
7. `fetch('/api/v1/session/sync', { Authorization: Bearer <token>, credentials: 'include' })` fires
8. Community sets `openvibe_token` cookie for `openvibe.community` domain
9. All subsequent form POSTs carry that cookie → `req.user` populated → replies, promotes, attribution all work

Token rotation: JWT expires every 2 hours, but each page load re-runs the exchange (using the network's 30-day refresh cookie) and re-syncs the community cookie. Transparent to the user.

---

### Files changed

| File | Change |
|------|--------|
| `deploy/nginx/live/openvibe-public.conf` | Added nginx-level CORS headers with `always` for community location block |
| `scripts/deploy/restart-all.sh` | New — production restart with parallel tiers, git pull + npm install flags |
| `scripts/deploy/start.sh` | Renamed/superseded — see start.sh at repo root |
| `start.sh` | New at repo root — single entry point, auto-detects prod/dev |
| `scripts/start-all-services.sh` | Deleted — broken Python port-check, replaced by start.sh |
| `services/openvibe-community/public/assets/openvibe.js` | Replaced hydrateNavSession with full dropdown + avatar + session sync call |
| `services/openvibe-community/server/index.js` | Added /api/v1/session/sync endpoint |
| `services/openvibe-community/server/ssr-shared.js` | Added avatar CSS; fixed _forumShell to load openvibe.js + use #ov-nav-session |
