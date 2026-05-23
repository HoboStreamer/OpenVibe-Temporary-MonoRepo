# OpenVibe Theme System

How themes work, how to add one, and what each field means. Written by Claude Code.

---

## How Themes Work

1. `BUILTIN_THEMES` in each service's `openvibe.js` holds all built-in themes
2. On page load, `applySavedTheme()` reads `localStorage['openvibe.theme']` and applies it immediately (no flash)
3. After login, `loadSyncedThemePreference()` fetches the saved theme from the network service's user-modules API and re-applies it — this is how themes sync across domains for logged-in users
4. When a user clicks a swatch, `syncThemePreference(themeId)` applies the theme locally and saves it to both localStorage and the server

### Cross-domain sync

Themes sync across all OpenVibe services for **logged-in users** via the user-modules API on openvibe.network. Anonymous users get theme stored in `localStorage`, which is per-origin (i.e. picking a theme on openvibe.live won't automatically apply it on openvibe.network for anonymous sessions).

---

## Two Theme Schemas

There are two variants of `BUILTIN_THEMES` across the 7 services:

### Schema 1 — Network + Chat (`bgSoft`, `preview`)

Used by: `openvibe-network`, `openvibe-chat`

```js
{
    id: 'my-theme',
    name: 'My Theme',
    description: 'One sentence about this theme.',
    accent: '#hex',
    accent2: '#hex',
    bg: '#hex',
    bgSoft: 'rgba(...)',       // panel/card background
    text: '#hex',
    textDim: '#hex',
    preview: 'linear-gradient(135deg, ...)',  // swatch preview gradient
}
```

| Field | CSS Variable |
|---|---|
| `accent` | `--ov-accent` |
| `accent2` | `--ov-accent-2` |
| `bg` | `--ov-bg`, `--ov-nav-bg` |
| `bgSoft` | `--ov-bg-soft` |
| `text` | `--ov-text` |
| `textDim` | `--ov-text-dim` |

### Schema 2 — Community / Live / Games / Media / Tools (`bgElev`, `border`, `shadow`)

Used by: `openvibe-community`, `openvibe-live`, `openvibe-games`, `openvibe-media`, `openvibe-tools`

```js
{
    id: 'my-theme',
    name: 'My Theme',
    description: 'One sentence about this theme.',
    accent: '#hex',
    accent2: '#hex',
    bg: '#hex',
    bgElev: 'rgba(...)',       // elevated surface (cards, modals)
    bgElev2: 'rgba(...)',      // double-elevated surface
    text: '#hex',
    textDim: '#hex',
    textFaint: '#hex',         // very muted text (captions, placeholders)
    border: 'rgba(...)',       // border/divider color
    shadow: '0 28px 90px ...', // card/modal shadow
}
```

| Field | CSS Variable |
|---|---|
| `accent` | `--ov-accent` |
| `accent2` | `--ov-accent-2` |
| `bg` | `--ov-bg`, `--ov-nav-bg` |
| `bgElev` | `--ov-bg-elev` |
| `bgElev2` | `--ov-bg-elev-2` |
| `text` | `--ov-text` |
| `textDim` | `--ov-text-dim` |
| `textFaint` | `--ov-text-faint` |
| `border` | `--ov-border` |
| `shadow` | `--ov-shadow` |

The `openvibe-live` schema also sets legacy aliases: `--accent`, `--accent-2`, `--bg`, `--panel`, `--panel-strong`, `--border`, `--text`, `--muted`, `--muted-strong`.

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

1. The base theme object from `BUILTIN_THEMES` is applied first (provides sensible defaults)
2. `applyTheme` then checks `themeId === 'custom'` and reads `localStorage['openvibe.theme.custom']`
3. Any saved colors override the CSS variables directly
4. Derived values are computed on the fly:
   - `bgSoft` / `bgElev` / `bgElev2` — derived from `bg` with added opacity
   - `border` — derived from `accent` at 0.18 opacity
   - `textFaint` — same as `textDim` (no separate field in custom)

### Themes page editor

`services/openvibe-network/public/themes.html` renders a color picker panel below the grid when the Custom Palette tile is selected. Five `<input type="color">` swatches update the page live on every `input` event and save to localStorage immediately.

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

1. Add the theme object to `BUILTIN_THEMES` in **all 7** `services/*/public/assets/openvibe.js` files using the correct schema for each group (Schema 1 for network/chat, Schema 2 for the other 5)
2. Themes after position 6 are automatically hidden from the popup — no code change needed
3. Check contrast: `bg` vs `text` ≥ 4.5:1, `bg` vs `textDim` ≥ 3:1

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

## Persistence

| Store | Key | Scope |
|---|---|---|
| localStorage | `openvibe.theme` | Per browser origin — the chosen theme ID |
| localStorage | `openvibe.theme.custom` | Per browser origin — custom palette colors JSON |
| Network user-modules API | `openvibe.theme` namespace | Per user account, cross-domain |

On page load, localStorage is read first (instant, no flash). The server value is fetched after session loads and re-applied if different. For logged-in users, this means the theme propagates across all OpenVibe domains within one page load. Custom palette colors are not synced to the server — they are browser-local only.
