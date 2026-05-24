# OpenVibe Theme System

How themes work, how to add one, and what each field means. Written by Claude Code.

---

## Single Source of Truth

All built-in themes live in one place:

```
packages/openvibe-themes/themes.json
```

To propagate a change to all 7 services, run:

```bash
node scripts/sync-themes.js
```

That script finds the `// <openvibe-themes-generated>` … `// </openvibe-themes-generated>` marker comments in each `services/*/public/assets/openvibe.js` and replaces the `BUILTIN_THEMES` constant between them.

---

## How Themes Work

1. `BUILTIN_THEMES` in each service's `openvibe.js` holds all built-in themes (stamped in by `sync-themes.js`)
2. On page load, `applySavedTheme()` reads `localStorage['openvibe.theme']` and applies it immediately (no flash)
3. After login, `loadSyncedThemePreference()` fetches the saved theme from the network service's user-modules API and re-applies it — this is how themes sync across domains for logged-in users
4. When a user clicks a swatch, `syncThemePreference(themeId)` applies the theme locally and saves it to both localStorage and the server

### Cross-domain sync

Themes sync across all OpenVibe services for **logged-in users** via the user-modules API on openvibe.network. Anonymous users get theme stored in `localStorage`, which is per-origin.

---

## Theme Schema (unified)

All themes use a single unified schema. Each theme has:

```json
{
    "id": "my-theme",
    "name": "My Theme",
    "description": "One sentence about this theme.",
    "colorScheme": "dark",
    "accent": "#hex",
    "accent2": "#hex",
    "preview": "linear-gradient(135deg, ...)",
    "vars": {
        "--ov-accent": "#hex",
        "--ov-accent-2": "#hex",
        "--ov-bg": "#hex",
        "--ov-nav-bg": "#hex",
        "--ov-bg-soft": "rgba(...)",
        "--ov-bg-elev": "rgba(...)",
        "--ov-bg-elev-2": "rgba(...)",
        "--ov-text": "#hex",
        "--ov-text-dim": "#hex",
        "--ov-text-faint": "#hex",
        "--ov-border": "rgba(...)",
        "--ov-shadow": "0 28px ...",
        "--accent": "#hex",
        "--accent-2": "#hex",
        "--bg": "#hex",
        "--panel": "rgba(...)",
        "--panel-strong": "rgba(...)",
        "--border": "rgba(...)",
        "--text": "#hex",
        "--muted": "#hex",
        "--muted-strong": "#hex"
    }
}
```

The `vars` object is applied wholesale via `Object.entries(theme.vars || {}).forEach(([k, v]) => root.style.setProperty(k, v))` — no per-service schema differences. The `--ov-*` variables are the primary set; `--accent`, `--bg`, `--panel`, etc. are legacy aliases kept for SSR-rendered HTML that uses them directly.

| vars key | Used by |
|---|---|
| `--ov-accent`, `--ov-accent-2` | All services |
| `--ov-bg`, `--ov-nav-bg` | All services |
| `--ov-bg-soft` | Network, Chat |
| `--ov-bg-elev`, `--ov-bg-elev-2` | Community, Games, Live, Media, Tools |
| `--ov-text`, `--ov-text-dim`, `--ov-text-faint` | All services |
| `--ov-border`, `--ov-shadow` | Community, Games, Live, Media, Tools |
| `--accent`, `--accent-2`, `--bg`, `--panel`, `--panel-strong`, `--border`, `--text`, `--muted`, `--muted-strong` | Live (SSR legacy) |

---

## Built-in Themes (as of 2026-05-23)

| ID | Name | Accent | Accent 2 | Notes |
|---|---|---|---|---|
| `openvibe-dark` | OpenVibe Dark | `#8b5cf6` violet | `#22d3ee` cyan | Default — shown first in popup |
| `openvibe-dim` | OpenVibe Dim | `#2dd4bf` teal | `#60a5fa` blue | Softer, cooler |
| `openvibe-light` | OpenVibe Light | `#5b3df0` indigo | `#0ea5e9` sky | Light mode |
| `sunset` | Sunset Broadcast | `#f97316` orange | `#fb7185` pink | Creator/warm |
| `forest` | Forest Signal | `#22c55e` green | `#2dd4bf` teal | Calm operator |
| `cyberpunk` | Cyberpunk Relay | `#ec4899` magenta | `#22d3ee` cyan | Arcade energy |
| `hobostreamer` | HoboStreamer | `#c0965c` amber | `#dbb077` gold | Campfire on near-black; themes page only |
| `custom` | Custom Palette | user-set | user-set | Configured on themes page; colors in localStorage |

**Popup picker shows first 6** (`BUILTIN_THEMES.slice(0, 6)`). HoboStreamer and Custom are themes-page only.

---

## Custom Palette

The `custom` theme allows users to pick their own 5 colors on the themes page. Colors are stored in `localStorage['openvibe.theme.custom']` as:

```json
{ "bg": "#060917", "accent": "#8b5cf6", "accent2": "#22d3ee", "text": "#eef4ff", "textDim": "#a7b5d2" }
```

### How `applyTheme('custom')` works

1. The base `custom` theme's `vars` are applied first (provides sensible defaults)
2. `applyTheme` then checks `themeId === 'custom'` and reads `localStorage['openvibe.theme.custom']`
3. Any saved colors override the CSS variables directly
4. Derived values are computed on the fly:
   - `--ov-bg-soft` / `--ov-bg-elev` / `--ov-bg-elev-2` — derived from `bg` with added opacity
   - `--ov-border` — derived from `accent` at 0.18 opacity
   - `--ov-text-faint` — same as `textDim` (no separate field in custom)

### Themes page editor

`services/openvibe-network/public/themes.html` renders a color picker panel below the grid when the Custom Palette tile is selected:

- Five `<input type="color">` swatches — color changes preview live (CSS vars set directly, nothing saved yet)
- **Name** text input + **Description** textarea for submission metadata
- **"Apply to me"** button — saves to `localStorage['openvibe.theme.custom']`, applies via `applyTheme('custom')`, syncs to user account via `syncThemePreference('custom')`
- **"Submit Theme"** button — posts to `POST /api/v1/themes/community` to share the theme publicly (see Community Themes below)

---

## Community Themes

Users can submit custom themes from the themes page. Submitted themes appear in a **Community Themes** section below the built-ins, visible to everyone.

### Submission flow

1. User opens the Custom Palette panel on the themes page
2. Picks 5 colors (live preview on the page)
3. Fills in a Theme Name (required, max 80 chars) and optional Description
4. Clicks **Submit Theme** → `POST /api/v1/themes/community`
5. Server derives the full `vars` object + preview gradient and saves to `community_themes` table
6. The community section refreshes immediately showing the new tile

### API

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/themes/community` | public | List community themes, newest first. Supports `?limit=` and `?offset=`. Returns `{ items: [...] }` |
| `POST` | `/api/v1/themes/community` | required | Submit a theme. Body: `{ name, description?, palette: { bg, accent, accent2, text, textDim } }`. All palette values must be 6-digit hex. Returns `{ id, name, accent, accent2, preview, vars, author_name }` |

### Database

`community_themes` table in the network SQLite/Postgres DB:

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID |
| `user_id` | TEXT | Submitting user's ID |
| `author_name` | TEXT | Display name at submission time |
| `name` | TEXT | Theme name |
| `description` | TEXT | Optional |
| `accent` | TEXT | Hex color |
| `accent2` | TEXT | Hex color |
| `preview` | TEXT | CSS gradient string |
| `vars_json` | TEXT | Full vars object (JSON) |
| `created_at` | DATETIME | Auto |

### Server-side vars derivation

`services/openvibe-network/server/api/community-themes.js` derives the full `vars` object from the 5 palette colors:

- `--ov-bg-soft` — bg at 0.85 opacity
- `--ov-bg-elev` — bg at 0.88 opacity
- `--ov-bg-elev-2` — bg+8 channels at 0.94 opacity
- `--panel`, `--panel-strong` — same as elev/elev-2
- `--ov-border`, `--border` — accent at 0.18 opacity
- `--ov-text-faint`, `--muted`, `--muted-strong` — textDim

### Applying a community theme

Clicking a community tile on the themes page applies it by iterating `Object.entries(vars)` directly — no `BUILTIN_THEMES` lookup needed since the full `vars` object is embedded in the tile's `data-vars` attribute.

---

## Theme Picker UI

The popup shows up to 6 themes:

```
[ Dark  ] [ Dim    ]
[ Light ] [ Sunset ]
[ Forest] [Cyberpunk]
[ Explore more themes! ]  ← links to themes.openvibe.network
```

The themes page (`/themes` on openvibe.network) shows all themes including HoboStreamer and Custom Palette, plus the custom color editor when Custom is selected.

---

## How to Add a Theme

1. Edit `packages/openvibe-themes/themes.json` — add a new theme object following the unified schema above
2. Run `node scripts/sync-themes.js` — this stamps the updated `BUILTIN_THEMES` into all 7 service files
3. Themes after position 6 are automatically hidden from the popup — no code change needed
4. Check contrast: `--ov-bg` vs `--ov-text` ≥ 4.5:1, `--ov-bg` vs `--ov-text-dim` ≥ 3:1

**No manual edits to any openvibe.js file are needed** — the sync script handles everything.

---

## `applyTheme()` API

```js
// Apply a theme by ID (also saves to localStorage)
OpenVibe.applyTheme('cyberpunk');

// Apply without saving to localStorage
OpenVibe.applyTheme('sunset', { persistLocal: false });

// Sync to server (also applies locally)
OpenVibe.syncThemePreference('forest');
```

---

## `GET /api/v1/themes`

Returns all built-in themes as JSON (served from openvibe.network):

```json
{
    "items": [ /* array of all theme objects from themes.json */ ]
}
```

This is the foundation for the future theme builder UI — the page can fetch this, render swatches, and allow editing without touching code.

---

## Persistence

| Store | Key | Scope |
|---|---|---|
| localStorage | `openvibe.theme` | Per browser origin — the chosen theme ID |
| localStorage | `openvibe.theme.custom` | Per browser origin — custom palette colors JSON |
| Network user-modules API | `openvibe.theme` namespace | Per user account, cross-domain |

On page load, localStorage is read first (instant, no flash). The server value is fetched after session loads and re-applied if different. For logged-in users, this means the theme propagates across all OpenVibe domains within one page load. Custom palette colors are not synced to the server — they are browser-local only.

---

## Architecture (Phase 1)

This is Phase 1 of a planned theme builder system:

- **Phase 1 (done)**: Single source of truth in `themes.json`, sync script, unified `vars` schema, `GET /api/v1/themes` endpoint
- **Phase 2 (future)**: Full no-code theme builder on the themes page — pick colors, backgrounds, fonts, border radius, etc. and generate a theme JSON that can be contributed back

The `vars` object is deliberately flat and complete so Phase 2 can generate it directly without knowing about service-specific schema differences.
