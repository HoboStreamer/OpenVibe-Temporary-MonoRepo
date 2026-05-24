# SSR Reference — OpenVibe MonoRepo

Generated: 2026-05-24  
Purpose: Quick reference for all server-side rendered (SSR) files — what they render, how big they are, and what routes/domains they serve.

---

## Summary Table

| Service | File(s) | Lines | Size | Domain(s) | Dev Port |
|---|---|---|---|---|---|
| openvibe-community | `server/ssr.js` + 7 files | — | ~62 KB total | openvibe.community | 4900 |
| openvibe-live | `server/ssr.js` + 6 files | — | ~244 KB total | openvibe.live | 4600 |
| openvibe-content | `server/ssr.js` + 10 files | — | ~80 KB total | openvibe.codes / .blog / .wiki / .news / .reviews / .deals / .coupons / .trade / .host | 5500 |
| openre-stream | `server/ssr.js` | 608 | 48 KB | openre.stream | 4700 |
| openvibe-control | `server/ssr.js` | 349 | 16 KB | (internal admin, no public domain) | 4300 |

---

## 1. openvibe-community — `services/openvibe-community/server/`

**Domain:** `https://openvibe.community`  
**Dev port:** 4900

### File structure

| File | Size | Role |
|---|---|---|
| `ssr-shared.js` | 22 KB | Constants, utilities, CSS, HTML shells, card partials |
| `ssr-threads.js` | 12 KB | `renderThreadsPage` + `renderThreadDetailPage` |
| `ssr-pastes.js` | 12 KB | `renderPastesPage` + `renderPasteViewPage` |
| `ssr-pulse.js` | 1.5 KB | `renderPulsePage` |
| `ssr-chat.js` | 1.9 KB | `renderChatPage` |
| `ssr-pages.js` | 5.1 KB | `renderPagesPage` + `renderSubmitPage` |
| `ssr-forum.js` | 7.0 KB | `renderForumHomePage` + `renderForumSpacePage` + `renderForumThreadPage` |
| `ssr.js` | 0.8 KB | Aggregator — re-exports all 11 functions, `index.js` untouched |

### Pages rendered

| Function | File | Route | Description |
|---|---|---|---|
| `renderPulsePage` | ssr-pulse.js | `GET /pulse` | Combined feed of recent threads + pastes |
| `renderThreadsPage` | ssr-threads.js | `GET /threads` | Thread list with live filter + favourites |
| `renderThreadDetailPage` | ssr-threads.js | `GET /threads/:idOrSlug` | BBS-style thread view with paste OP + replies |
| `renderPastesPage` | ssr-pastes.js | `GET /pastes` | Paste list with sort and live filter |
| `renderPasteViewPage` | ssr-pastes.js | `GET /p/:slug` | Single paste viewer, copy button, more-pastes strip |
| `renderChatPage` | ssr-chat.js | `GET /chat` | Discord relay message feed |
| `renderForumHomePage` | ssr-forum.js | `GET /forum` | Forum home — spaces + recent discussions |
| `renderForumSpacePage` | ssr-forum.js | `GET /forum/s/:slug` | Single forum space thread list |
| `renderForumThreadPage` | ssr-forum.js | `GET /forum/t/:id` | Forum thread with posts + reply gate |
| `renderPagesPage` | ssr-pages.js | `GET /pages`, `GET /pages/:slug` | Community pages registry |
| `renderSubmitPage` | ssr-pages.js | `GET /pages/submit` | How to submit a community page |

### `ssr-shared.js` exports

```
COMMUNITY_URLS          — { live, chat, network, community } resolved origins
SIGN_IN_URL             — network bridge sign-in URL
ANON_URL                — anonymous session URL
escapeHtml(value)
timeAgo(value)
pasteLanguageLabel(lang)
_styles()               — shared inline CSS (CSS variables throughout)
_nav(active)            — community top nav
_head({ title, description, canonical })
_shell({ title, description, canonical, active, bodyHtml })
_threadCard(thread)     — reusable thread card partial
_pasteCard(paste)       — reusable paste card partial
_forumNav(active)       — forum nav (different set of links)
_forumShell({ title, description, active, bodyHtml })
```

### Auth / theme notes

- `_shell()` mounts `#ov-nav-session` and runs deferred `OpenVibe.primeEnvironment()` + `renderChrome('community')` after openvibe.js loads.
- `_forumShell()` has a plain sign-in link only (no openvibe.js integration yet).
- All CSS uses `var(--bg)`, `var(--panel)`, `var(--text)`, `var(--border)`, `var(--accent)`, `var(--muted)` with `color-mix()` for opacity — themes apply immediately.

---

## 2. openvibe-live — `services/openvibe-live/server/`

**Domain:** `https://openvibe.live`  
**Dev port:** 4600

### File structure

| File | Size | Role |
|---|---|---|
| `ssr-shared.js` | 107 KB | Constants, utilities, CSS, scripts, nav/footer/renderPage, all UI partials |
| `ssr-golive.js` | 71 KB | `renderGoLivePage` — 934 lines, includes its own inline styles + script |
| `ssr-media.js` | 38 KB | `renderStreamPage`, `renderMediaDetailPage`, `renderCustomMediaPlayer`, `renderCollectionPage`, `renderMissingMediaPage` |
| `ssr-channel.js` | 14 KB | `renderChannelPage`, `renderChannelsPage`, `renderOfflinePage` |
| `ssr-home.js` | 11 KB | `renderHomePage` |
| `ssr-updates.js` | 1.9 KB | `renderUpdatesPage` |
| `ssr.js` | 1.1 KB | Aggregator — re-exports all 11 functions |

### Pages rendered

| Function | File | Route | Description |
|---|---|---|---|
| `renderHomePage` | ssr-home.js | `GET /` | Main home — live channels, trending, VODs, clips, chat, community section |
| `renderChannelsPage` | ssr-channel.js | `GET /channels` | All channels grid with featured + categories |
| `renderChannelPage` | ssr-channel.js | `GET /@:slug`, `GET /c/:slug` | Individual streamer channel page |
| `renderStreamPage` | ssr-media.js | `GET /@:slug/s/:streamId`, `GET /c/:slug/s/:streamId` | Individual stream/VOD player page |
| `renderCollectionPage` | ssr-media.js | `GET /vods` + `GET /clips` | VOD and clips list pages |
| `renderMediaDetailPage` | ssr-media.js | `GET /vod/:id`, `GET /clip/:id` | VOD/clip detail + player |
| `renderGoLivePage` | ssr-golive.js | `GET /go-live` | Go-live setup wizard (auth-gated) |
| `renderUpdatesPage` | ssr-updates.js | `GET /updates` | Release notes / changelog |
| `renderOfflinePage` | ssr-channel.js | `GET /@:slug` (404) | Shown when channel is offline |
| `renderMissingMediaPage` | ssr-media.js | `GET /vod/:id` (404) | Shown when VOD/clip not found |
| `renderCustomMediaPlayer` | ssr-media.js | (internal util) | Embeddable standalone player shell |

### `ssr-shared.js` exports

```
LIVE_NETWORK_URLS        — { restream, chat, community, network } resolved origins
BUILD_UPDATES            — built-in release notes array
GO_LIVE_TRACKS           — go-live track descriptions array
MISSION_PILLARS          — mission copy array
VOD_ENABLED              — process.env.ENABLE_VOD === 'true'
escapeHtml, absoluteUrl, formatNumber, formatCompactNumber
formatDurationSeconds, formatDateTime, formatShortDate, timeAgo
initialsFrom, labelizeKey, normalizeCreatorSlug, sanitizeStreamTitle
channelPath, streamPath, canRenderImageUrl
renderPage({ title, description, canonical, ogType, ogImage, activeNav, bodyHtml, baseUrl, extraStyles, extraScripts })
renderNav(activeNav), renderFooter()
renderPill, renderMediaThumb, renderVideoCard, renderStreamerGroupCard
renderStreamCard, renderChannelCard, renderSection, renderSignalCard
```

### Notes

- `ssr-shared.js` is 107 KB — contains all CSS (theme variables), both `_shellStyles()` and the live `_shellScript()`.
- The original file had a dead duplicate `renderChannelCard` (lines 2244–2457) that was excluded from the split — only the live version is in `ssr-shared.js`.
- All CSS uses CSS variables — themes apply visually.

---

## 3. openvibe-content — `services/openvibe-content/server/`

**Domains:** 9 separate domains, all served by the same Node.js process on port 5500.  
**Dev port:** 5500

### File structure

The content SSR is split into 11 files:

| File | Size | Role |
|---|---|---|
| `ssr-shared.js` | 15 KB | Shared rendering engine used by all 9 surfaces |
| `ssr-codes.js` | 6.6 KB | openvibe.codes surface data + wrapper |
| `ssr-blog.js` | 5.3 KB | openvibe.blog surface data + wrapper |
| `ssr-wiki.js` | 9.5 KB | openvibe.wiki surface data + wrapper |
| `ssr-news.js` | 6.2 KB | openvibe.news surface data + wrapper |
| `ssr-reviews.js` | 6.1 KB | openvibe.reviews surface data + wrapper |
| `ssr-deals.js` | 5.6 KB | openvibe.deals surface data + wrapper |
| `ssr-coupons.js` | 4.5 KB | openvibe.coupons surface data + wrapper |
| `ssr-trade.js` | 6.2 KB | openvibe.trade surface data + wrapper |
| `ssr-host.js` | 9.3 KB | openvibe.host surface data + wrapper |
| `ssr.js` | 1.8 KB | Aggregator — dispatches by surfaceId, public API unchanged |

### How it works

1. `routes.js` calls `renderRequest({ config, surfaceId, routePath })` from `./ssr`
2. `ssr.js` (aggregator) maps `surfaceId` → the right surface module and calls its `renderRequest({ config, routePath })`
3. Each surface module calls `sharedRenderRequest({ config, surface: buildSurface(config), routePath })` from `ssr-shared.js`
4. `ssr-shared.js` handles all HTML/XML generation — surfaces just supply their data object

### Pages rendered (all surfaces)

Every surface exposes the same 7 route types via `renderRequest`:

| Route | Output | Description |
|---|---|---|
| `GET /` | HTML | Surface home page — hero + entry grid |
| `GET /:path` | HTML | Individual entry (article, review, deal, etc.) |
| `GET /feed.xml` | RSS XML | RSS feed of entries |
| `GET /atom.xml` | Atom XML | Atom feed of entries |
| `GET /sitemap.xml` | Sitemap XML | URL sitemap |
| `GET /robots.txt` | Text | Robots directives (noindex if not indexable) |
| `GET /:unknown` | HTML 404 | "Page not found" |

### Surface registry

| Surface ID | Domain | Indexable | Entries | Notes |
|---|---|---|---|---|
| `codes` | openvibe.codes | yes | 5 | Platform docs, API reference, WHIP guide, self-hosting |
| `blog` | openvibe.blog | yes | 4 | Platform announcements, engineering notes |
| `wiki` | openvibe.wiki | yes | 7 | RTMP, WHIP, HLS, OVC, OBS, stream key security, readiness gates |
| `news` | openvibe.news | no (draft) | 4 | Creator economy news — noindex until editorial policy finalised |
| `reviews` | openvibe.reviews | yes | 4 | Gear reviews: Elgato HD60X, SM7B, OBS, Hetzner CX22 |
| `deals` | openvibe.deals | yes | 4 | Hetzner credit, OBS free upgrade, Cloudflare free tier, Bitwarden |
| `coupons` | openvibe.coupons | yes | 3 | DO $200 credit, Streamlabs Ultra trial, Cloudflare R2 |
| `trade` | openvibe.trade | no (draft) | 4 | Gear classifieds guides — noindex until moderation policy live |
| `host` | openvibe.host | no (yellow) | 6 | VPS setup, nginx, Hetzner review — pending editorial review |

### `ssr-shared.js` exports

```
escapeHtml, formatBytes, toIsoDate
navItems(config)              — cross-surface nav links
surfaceStatusNote(surface)    — returns deferReason string or null
surfaceKicker(surface)        — "published" / "draft / noindex" label
pageForPath(surface, path)    — finds entry by path
buildJsonLd(surface, url, entry) — Schema.org JSON-LD
renderLayout({ config, surface, ... }) — full HTML document
renderHome({ config, surface })
renderEntry({ config, surface, entry })
renderNotFound({ config, surface, routePath })
buildFeedXml(surface)
buildAtomXml(surface)
buildSitemapXml(surface)
buildRobotsTxt(surface)
renderRequest({ config, surface, routePath }) — unified dispatch
```

### Each surface file exports

```
buildSurface(config)             — returns the surface object
renderRequest({ config, routePath }) — thin wrapper around shared renderRequest
```

### `ssr.js` (aggregator) exports

```
buildSurfaceCatalog(config)     — aggregates all 9 buildSurface() calls
hostStatuses(config)            — used by /api/v1/content/hosts
renderRequest({ config, surfaceId, routePath }) — dispatches to surface module
formatBytes, buildFeedXml, buildAtomXml, buildSitemapXml, buildRobotsTxt — re-exported from shared
```

### Adding a new entry to a surface

Edit only the relevant surface file (e.g. `ssr-wiki.js`) — add an object to `entries[]` with `path`, `title`, `summary`, `publishedAt`, `kind`, and `sections[]`. No other file needs changing.

### Adding a new surface

1. Create `ssr-{surface}.js` — `buildSurface(config)` + `renderRequest` wrapper
2. Add it to `SURFACE_MODULES` in `ssr.js`
3. Add it to `navItems()` in `ssr-shared.js`
4. Add the surface URL to `config.surfaces` in `config.js`

---

## 4. openre-stream — `services/openre-stream/server/ssr.js`

**Domain:** `https://openre.stream`  
**Dev port:** 4700  
**Lines:** 608 | **Size:** 48 KB

### Pages rendered

| Function | Route | Description |
|---|---|---|
| `renderDashboard` | `GET /dashboard` (authenticated) | Stream management dashboard — channels, destinations, live streams, outputs, ingest config |
| `renderDashboardAuthGate` | `GET /dashboard` (unauthenticated) | Auth gate / sign-in prompt |

### Internal helpers

- `_styles()` — inline CSS
- `_shell({ title, bodyHtml, user, extraScripts })` — HTML shell
- `esc(value)` — HTML escape util
- `timeAgo(value)` — relative time formatter
- `pill(label, tone)` — status pill partial

### Notes

- Only two pages — authenticated dashboard and its auth gate.
- Shows RTMP ingest config, destination management, active stream status, and output controls.

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
- `statusDot(ok)` — green/red status indicator

### Notes

- All routes gated behind `adminOnly` middleware.
- No public domain; accessible only internally.
- Smallest SSR in the repo at 349 lines.

---

## Services without an ssr.js

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
