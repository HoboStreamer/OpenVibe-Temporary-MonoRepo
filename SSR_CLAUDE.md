# SSR Reference — OpenVibe MonoRepo

Generated: 2026-05-24  
Purpose: Quick reference for all server-side rendered (SSR) files — what they render, how big they are, and what routes/domains they serve.

---

## Summary Table

| Service | File | Lines | Size | Domain(s) | Dev Port |
|---|---|---|---|---|---|
| openvibe-community | `services/openvibe-community/server/ssr.js` | 1051 | 64 KB | openvibe.community | 4900 |
| openvibe-live | `services/openvibe-live/server/ssr.js` | 4503 | 252 KB | openvibe.live | 4600 |
| openvibe-content | `services/openvibe-content/server/ssr.js` | 1062 | 76 KB | openvibe.codes, openvibe.blog, openvibe.wiki, openvibe.news, openvibe.reviews, openvibe.deals, openvibe.coupons, openvibe.trade, openvibe.host | 5500 |
| openre-stream | `services/openre-stream/server/ssr.js` | 608 | 48 KB | openre.stream | 4700 |
| openvibe-control | `services/openvibe-control/server/ssr.js` | 349 | 16 KB | (internal admin panel, no public domain) | 4300 |

---

## 1. openvibe-community — `services/openvibe-community/server/ssr.js`

**Domain:** `https://openvibe.community`  
**Dev port:** 4900  
**Lines:** 1051 | **Size:** 64 KB

### Pages rendered

| Function | Route | Description |
|---|---|---|
| `renderPulsePage` | `GET /pulse` | Combined feed of recent threads + pastes |
| `renderThreadsPage` | `GET /threads` | List of all community threads |
| `renderThreadDetailPage` | `GET /threads/:idOrSlug` | Single thread view with posts/replies |
| `renderPastesPage` | `GET /pastes` | List of all pastes |
| `renderPasteViewPage` | `GET /p/:slug` | Single paste viewer with syntax highlight |
| `renderChatPage` | `GET /chat` | Discord relay message feed |
| `renderForumHomePage` | `GET /forum` | Forum home, lists spaces + recent threads |
| `renderForumSpacePage` | `GET /forum/s/:slug` | Single forum space (category) |
| `renderForumThreadPage` | `GET /forum/t/:id` | Thread inside a forum space |
| `renderPagesPage` | `GET /pages`, `GET /pages/:slug` | Static community pages registry |
| `renderSubmitPage` | `GET /pages/submit` | Submit a new community page |

### Internal helpers

- `_styles()` — all inline CSS (uses CSS variables: `--bg`, `--panel`, `--text`, `--border`, `--accent`, `--muted`)
- `_nav(active)` — top nav bar with active link highlight
- `_head({ title, description, canonical })` — `<head>` block
- `_shell({ title, description, canonical, active, bodyHtml })` — full HTML shell; mounts `#ov-nav-session` and runs deferred `renderChrome('community')`
- `_forumNav(active)`, `_forumShell(...)` — separate shell variant for forum pages
- `_threadCard(thread)`, `_pasteCard(paste)` — reusable card partials

### Auth / theme notes

- Deferred `OpenVibe.primeEnvironment()` + `OpenVibe.renderChrome('community')` runs after openvibe.js loads.
- `#ov-nav-session` is the mount point for the buddy icon dropdown.
- Theme variables applied via `applySavedTheme()` at openvibe.js load time; CSS uses `var(--bg)`, `color-mix()`, etc.

---

## 2. openvibe-live — `services/openvibe-live/server/ssr.js`

**Domain:** `https://openvibe.live`  
**Dev port:** 4600  
**Lines:** 4503 | **Size:** 252 KB  
**(Largest SSR in the repo)**

### Pages rendered

| Function | Route | Description |
|---|---|---|
| `renderHomePage` | `GET /` | Main home — live channels, trending, VODs, clips, chat, community section |
| `renderChannelsPage` | `GET /channels` | All channels grid with featured + categories |
| `renderChannelPage` | `GET /@:slug`, `GET /c/:slug` | Individual streamer channel page |
| `renderStreamPage` | `GET /@:slug/s/:streamId`, `GET /c/:slug/s/:streamId` | Individual stream/VOD player page |
| `renderCollectionPage` | `GET /vods` | All VODs list |
| `renderCollectionPage` | `GET /clips` | All clips list |
| `renderMediaDetailPage` | `GET /vod/:id` | VOD detail + player |
| `renderMediaDetailPage` | `GET /clip/:id` | Clip detail + player |
| `renderGoLivePage` | `GET /go-live` | Go-live setup wizard (auth-gated) |
| `renderUpdatesPage` | `GET /updates` | Release notes / changelog |
| `renderOfflinePage` | `GET /@:slug` (404) | Shown when channel exists but is offline |
| `renderMissingMediaPage` | `GET /vod/:id` (404) | Shown when VOD/clip not found |
| `renderCustomMediaPlayer` | (internal util) | Embeddable standalone player shell |

### Internal helpers

- `_shellStyles()` — all inline CSS; uses `var(--bg)`, `var(--panel)`, `color-mix()` for theme support
- `_shellScript()` — client-side hydration bootstrap (appears twice — legacy and new variant at line 1057/1674)
- `_meta(...)` — OG/meta tags with title, description, canonical, og:image
- `renderPage(...)` — master layout wrapper used by all pages
- `renderNav(activeNav)`, `renderFooter()` — shared nav/footer partials
- `renderPill`, `renderMediaThumb`, `renderVideoCard`, `renderStreamerGroupCard`, `renderStreamCard`, `renderChannelCard`, `renderSection`, `renderSignalCard` — reusable UI partials

### Notes

- This file is by far the biggest SSR at 252 KB / 4503 lines. Contains two `_shellScript()` function definitions (old and new variant).
- `renderGoLivePage` is a large standalone function (~924 lines, lines 3483–4407) with its own internal styles and script.

---

## 3. openvibe-content — `services/openvibe-content/server/ssr.js`

**Domains (all served by this one SSR):**
- `https://openvibe.codes` — developer codes / snippets
- `https://openvibe.blog` — blog posts
- `https://openvibe.wiki` — wiki / docs
- `https://openvibe.news` — news articles
- `https://openvibe.reviews` — reviews
- `https://openvibe.deals` — deals
- `https://openvibe.coupons` — coupons
- `https://openvibe.trade` — trade listings
- `https://openvibe.host` — hosting content

**Dev port:** 5500 (all surfaces share the same process)  
**Lines:** 1062 | **Size:** 76 KB

### Pages rendered

| Function | Route | Description |
|---|---|---|
| `renderRequest` | `GET *` (catch-all router) | Main entry point — resolves surface from hostname, then calls `renderHome`, `renderEntry`, or `renderNotFound` |
| `renderHome` | `/` | Surface home page (listing of content items) |
| `renderEntry` | `/:path` | Individual content item (article, review, deal, etc.) |
| `renderNotFound` | (404 fallback) | 404 page matching the active surface's theme |

### Internal helpers

- `renderLayout(...)` — master layout with nav, footer, meta; shared across all surfaces
- `navItems(config)` — builds surface-specific nav links
- `buildSurfaceCatalog(config)` — constructs the full catalog of items per surface
- `surfaceStatusNote`, `surfaceKicker` — surface-specific labels/badges
- `pageForPath(surface, routePath)` — maps a URL path to a content item
- `buildJsonLd(...)` — JSON-LD structured data for SEO
- `buildFeedXml`, `buildAtomXml`, `buildSitemapXml`, `buildRobotsTxt` — machine-readable feeds (not HTML)
- `hostStatuses(config)` — health check for all surface hosts

### Notes

- Single service, single port, multiple production domains — the surface is determined from the incoming `Host` header.
- `renderRequest` is the single exported entry point called by `routes.js` for all `GET *` requests.
- Non-SSR exports: `buildSurfaceCatalog`, `buildRobotsTxt`, `buildSitemapXml`, `buildFeedXml`, `buildAtomXml`, `formatBytes`, `hostStatuses`.

---

## 4. openre-stream — `services/openre-stream/server/ssr.js`

**Domain:** `https://openre.stream`  
**Dev port:** 4700  
**Lines:** 608 | **Size:** 48 KB

### Pages rendered

| Function | Route | Description |
|---|---|---|
| `renderDashboard` | `GET /dashboard` (authenticated) | Stream management dashboard — channels, destinations, live streams, outputs, ingest config |
| `renderDashboardAuthGate` | `GET /dashboard` (unauthenticated) | Auth gate / sign-in prompt shown when not logged in |

### Internal helpers

- `_styles()` — inline CSS
- `_shell({ title, bodyHtml, user, extraScripts })` — HTML shell
- `esc(value)` — HTML escape util
- `timeAgo(value)` — relative time formatter
- `pill(label, tone)` — status pill partial

### Notes

- Very focused SSR — only two pages (authenticated dashboard + its auth gate).
- The streamer dashboard shows RTMP ingest config, destination management, active stream status, and output controls.

---

## 5. openvibe-control — `services/openvibe-control/server/ssr.js`

**Domain:** Internal admin panel only (no public-facing domain)  
**Dev port:** 4300  
**Lines:** 349 | **Size:** 16 KB

### Pages rendered

| Function | Route | Description |
|---|---|---|
| `renderDashboard` | `GET /` (admin only) | Overview dashboard — system stats, event counts, stream stats |
| `renderUnauthorized` | (403 response) | Shown when non-admin accesses any route |
| `renderEventsPage` | `GET /events` (admin only) | Events log viewer |
| `renderStreamsPage` | `GET /streams` (admin only) | Active streams overview |
| `renderRealtimePage` | `GET /realtime` (admin only) | Realtime system stats |
| `renderCommunityPage` | `GET /community` (admin only) | Community-related admin stats |
| `renderServicesPage` | `GET /services` (admin only) | Service health overview |
| `renderEcosystemPage` | `GET /ecosystem` (admin only) | Ecosystem/partner view |

### Internal helpers

- `shell(title, content, userEmail)` — shared HTML shell for all admin pages
- `escHtml(v)` — HTML escape util
- `statusDot(ok)` — green/red status indicator dot

### Notes

- All routes are gated behind `adminOnly` middleware — non-admins get `renderUnauthorized()`.
- No public domain; accessible only internally or via VPN/SSH tunnel.
- Smallest SSR in the repo at 349 lines.

---

## Services without an ssr.js

These services serve pages through other mechanisms:

| Service | Domain | How pages are served |
|---|---|---|
| openvibe-network | openvibe.network, my.openvibe.network | Static `public/index.html` — fully client-side SPA |
| openvibe-tools | openvibe.tools | Per-tool route handlers with inline HTML templates |
| openvibe-tips | openvibe.tips | Route handlers with inline HTML |
| openvibe-media | openvibe.media | API-only service (no browser pages) |
| openvibe-ai | ai.openvibe.network | API-only service |
| openvibe-games | openvibe.games | Client-side app |
| openvibe-billing | billing.openvibe.network | Route handlers |
| openvibe-chat | (internal) | WebSocket service, no HTML pages |
| openvibe-realtime | realtime.openvibe.network | WebSocket service, no HTML pages |
| openvibe-workers | (internal) | Background job worker, no pages |
