# Claud Log

A running record of changes made by Claude Code sessions. Newest entries at the top.

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
