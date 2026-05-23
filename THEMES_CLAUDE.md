# OpenVibe Theme System

How themes work, how to add one, and what each field means. Written by Claude Code.

---

## How Themes Work

1. `BUILTIN_THEMES` in each service's `openvibe.js` holds the 6 built-in themes
2. On page load, `applySavedTheme()` reads `localStorage['openvibe.theme']` and applies it immediately (no flash)
3. After login, `loadSyncedThemePreference()` fetches the saved theme from the network service's user-modules API and re-applies it — this is how themes sync across domains for logged-in users
4. When a user clicks a swatch, `syncThemePreference(themeId)` applies the theme locally and saves it to both localStorage and the server

### Cross-domain sync

Themes sync across all OpenVibe services for **logged-in users** via the user-modules API on openvibe.network. Anonymous users get theme stored in `localStorage`, which is per-origin (i.e. picking a theme on openvibe.live won't automatically apply it on openvibe.network for anonymous sessions).

---

## The `BUILTIN_THEMES` Array

Defined at the top of `openvibe.js` in every service (they should be kept in sync). Each theme is an object:

```js
{
    id: 'my-theme',           // unique slug, used as localStorage key value
    name: 'My Theme',         // display name shown in the picker
    description: 'A sentence explaining the vibe of this theme.',
    accent: '#hex',           // primary accent (links, active states, highlights)
    accent2: '#hex',          // secondary accent (gradients, hover accents)
    bg: '#hex',               // main background color (opaque)
    bgSoft: 'rgba(...)',      // soft/panel background (usually semi-transparent)
    text: '#hex',             // primary text color
    textDim: '#hex',          // secondary/muted text color
    preview: 'linear-gradient(135deg, ...)',  // CSS gradient shown in the swatch
}
```

### What each field controls

| Field | Applied as CSS variable |
|---|---|
| `accent` | `--ov-accent` |
| `accent2` | `--ov-accent-2` |
| `bg` | `--ov-bg` and `--ov-nav-bg` |
| `bgSoft` | `--ov-bg-soft` |
| `text` | `--ov-text` |
| `textDim` | `--ov-text-dim` |

The `preview` gradient is only used in the theme picker swatch — it doesn't affect the live page. Make it representative of the theme's palette.

---

## Built-in Themes (as of 2026-05-23)

| ID | Name | Primary Accent | Secondary Accent | Character |
|---|---|---|---|---|
| `openvibe-dark` | OpenVibe Dark | `#8b5cf6` (violet) | `#22d3ee` (cyan) | Default neon night |
| `openvibe-dim` | OpenVibe Dim | `#2dd4bf` (teal) | `#60a5fa` (blue) | Softer, cooler contrast |
| `openvibe-light` | OpenVibe Light | `#5b3df0` (indigo) | `#0ea5e9` (sky) | Bright daytime mode |
| `sunset` | Sunset Broadcast | `#f97316` (orange) | `#fb7185` (pink) | Creator/warm vibes |
| `forest` | Forest Signal | `#22c55e` (green) | `#2dd4bf` (teal) | Calm operator feel |
| `cyberpunk` | Cyberpunk Relay | `#ec4899` (magenta) | `#22d3ee` (cyan) | Arcade energy |

---

## How to Add a Custom Theme

### Step 1 — Add the theme object

Open each `services/*/public/assets/openvibe.js` and add your theme to the `BUILTIN_THEMES` array. It must be added to **all 7 files** (the array is duplicated, not shared).

```js
const BUILTIN_THEMES = [
    // ... existing themes ...
    {
        id: 'my-theme',
        name: 'My Theme',
        description: 'One sentence about this theme.',
        accent: '#e11d48',
        accent2: '#f59e0b',
        bg: '#1a0a0a',
        bgSoft: 'rgba(38, 10, 10, 0.9)',
        text: '#fef2f2',
        textDim: '#fca5a5',
        preview: 'linear-gradient(135deg, #1a0a0a 0%, #3b0f1f 55%, #7c1d2a 100%)',
    },
];
```

### Step 2 — Test your theme

The theme picker shows up to 6 themes (`BUILTIN_THEMES.slice(0, 6)`). If you add a 7th, it will be hidden from the popup but still accessible via the themes page. To show it in the popup, either replace one of the existing six or increase the slice limit in `initThemePicker()`.

### Step 3 — Check accessibility

For each theme, verify:
- Text contrast ratio ≥ 4.5:1 (use a contrast checker: `bg` vs `text`)
- Links (accent color) readable against background
- The `textDim` color is still readable (aim for ≥ 3:1)

### Step 4 — Update all 7 service files

Services that need updating when you change `BUILTIN_THEMES`:
```
services/openvibe-network/public/assets/openvibe.js
services/openvibe-chat/public/assets/openvibe.js
services/openvibe-community/public/assets/openvibe.js
services/openvibe-live/public/assets/openvibe.js
services/openvibe-media/public/assets/openvibe.js
services/openvibe-games/public/assets/openvibe.js
services/openvibe-tools/public/assets/openvibe.js
```

---

## Theme Picker UI

The picker renders as a 2×3 swatch grid in a popup:

```
[ Dark  ] [ Dim    ]
[ Light ] [ Sunset ]
[ Forest] [Cyberpunk]
[ Explore more themes! ]
```

Each swatch shows:
- A gradient preview strip (`.ov-theme-swatch-preview` with the `preview` gradient as background)
- Two accent dots at the bottom-left corner (`.ov-theme-swatch-accent` — one for `accent`, one for `accent2`)
- The theme name below

The picker button (paint bucket icon) lives in `.ov-nav-end` on every service's nav bar.

---

## `applyTheme()` API

Available as `OpenVibe.applyTheme(themeId)` from any page:

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

| Store | What it holds | Scope |
|---|---|---|
| `localStorage['openvibe.theme']` | Last chosen theme ID | Per browser origin |
| Network user-modules API | `{ theme_id, updated_at, source }` | Per user account, cross-domain |

On page load, localStorage is read first (instant, no flash). The server value is fetched after session loads and re-applied if different. For logged-in users, this means the theme propagates across all OpenVibe domains within one page load.

---

## Future: Community Theme Submissions

The architecture is ready for community themes — they just need to be added to `BUILTIN_THEMES` and the themes page (`/themes` on openvibe.network). A community contribution workflow could look like:

1. Author submits a PR adding a theme object to `BUILTIN_THEMES` in all 7 `openvibe.js` files
2. Theme is reviewed for contrast and aesthetic
3. It ships as a built-in or gets a dedicated entry on the themes page

The `description` field is your elevator pitch for the theme. Make it evocative, not technical.
