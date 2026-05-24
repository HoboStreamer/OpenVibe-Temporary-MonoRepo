# OpenVibe Styling Guide

How the shared CSS system works across all OpenVibe services. Written by Claude Code.

---

## CSS Variable System

Every surface applies its visual identity through CSS custom properties (variables) set on `<html>`. The JavaScript `applyTheme()` function in each service's `openvibe.js` sets these at runtime.

### Theme variables (set by `applyTheme()` from `theme.vars`)

All of these are stamped into every theme's `vars` object in `packages/openvibe-themes/themes.json` and applied wholesale by `applyTheme()` via `Object.entries(theme.vars || {}).forEach(([k, v]) => root.style.setProperty(k, v))`. Every theme sets every variable — there is no longer a split between "network vars" and "community vars".

| Variable | Purpose | Example (dark) |
|---|---|---|
| `--ov-accent` | Primary accent (links, buttons, highlights) | `#8b5cf6` |
| `--ov-accent-2` | Secondary accent (gradients, hover states) | `#22d3ee` |
| `--ov-bg` | Page background | `#060917` |
| `--ov-nav-bg` | Nav bar background | `#060917` |
| `--ov-bg-soft` | Soft panel background (network/chat) | `rgba(11, 16, 33, 0.84)` |
| `--ov-bg-elev` | Elevated surface (cards, modals) | `rgba(15, 23, 45, 0.88)` |
| `--ov-bg-elev-2` | Double-elevated surface | `rgba(21, 31, 60, 0.94)` |
| `--ov-text` | Primary text | `#eef4ff` |
| `--ov-text-dim` | Secondary/muted text | `#a7b5d2` |
| `--ov-text-faint` | Very muted text (captions, placeholders) | `#6d7c98` |
| `--ov-border` | Border/divider color | `rgba(148, 163, 184, 0.14)` |
| `--ov-shadow` | Card/modal shadow | `0 28px 90px rgba(2, 8, 23, 0.42)` |
| `--accent` | Legacy alias → `--ov-accent` (live SSR) | same |
| `--accent-2` | Legacy alias → `--ov-accent-2` (live SSR) | same |
| `--bg` | Legacy alias → `--ov-bg` (live SSR) | same |
| `--panel` | Legacy alias → `--ov-bg-elev` (live SSR) | same |
| `--panel-strong` | Legacy alias → `--ov-bg-elev-2` (live SSR) | same |
| `--border` | Legacy alias → `--ov-border` (live SSR) | same |
| `--text` | Legacy alias → `--ov-text` (live SSR) | same |
| `--muted` | Legacy alias → `--ov-text-faint` (live SSR) | same |
| `--muted-strong` | Legacy alias → `--ov-text-dim` (live SSR) | same |

The legacy aliases (`--accent`, `--bg`, `--panel`, etc.) exist because the openvibe-live SSR templates reference them directly. All other services use the `--ov-*` names.

### Static variables (set in CSS `:root`, not by themes)

| Variable | Purpose |
|---|---|
| `--ov-warn` | Warning color |
| `--ov-danger` | Destructive/error color |
| `--ov-ok` | Success color |
| `--ov-radius` | Card/panel border radius |
| `--ov-radius-sm` | Small border radius (buttons, chips) |
| `--ov-font` | Body font stack |
| `--ov-mono` | Monospace font stack |
| `--ov-max` | Max content width |

---

## CSS File Locations

Each service has its own `openvibe.css`. They share the same base structure but may diverge for service-specific components.

```
services/
  openvibe-network/public/assets/openvibe.css   — Full styles + theme grid
  openvibe-chat/public/assets/openvibe.css      — Full styles
  openvibe-community/public/assets/openvibe.css — Community-specific extras
  openvibe-live/public/assets/openvibe.css
  openvibe-media/public/assets/openvibe.css
  openvibe-games/public/assets/openvibe.css
  openvibe-tools/public/assets/openvibe.css
```

**Rule:** If you add a component that appears on all services (like the theme picker button), add the CSS to all service CSS files. They don't auto-share.

---

## Shared Component Classes

These classes are present across all services:

### Navigation
- `.ov-nav` — sticky nav bar wrapper
- `.ov-nav-inner` — flex row inside nav (brand + links + end)
- `.ov-nav-links` — horizontal link list; `margin-left: auto` on some services pushes it right
- `.ov-nav-end` — flex wrapper for right-side nav items (theme button, session)
- `.ov-brand` — logo + name link

### Buttons
- `.ov-btn` — base button style
- `.ov-btn-primary` — accent-colored primary action
- `.ov-btn-ghost` — transparent/subtle variant

### Chips / Tags
- `.ov-chip` — small badge (neutral)
- `.ov-chip.ok` / `.ov-chip.warn` / `.ov-chip.soft` / `.ov-chip.primary` — status variants
- `.ov-tag` — similar to chip, used for taxonomy labels

### Panels and Layout
- `.ov-shell` — max-width content wrapper with horizontal padding
- `.ov-section` — top-margin section block
- `.ov-grid` — CSS grid for cards (auto-fill with minmax)
- `.ov-panel` — card/panel with padding and border

### Themes Page (`themes.html` only)

**Built-in grid:**
- `.theme-grid` — auto-fill grid of built-in theme tiles
- `.theme-tile` — individual tile (button, all: unset)
- `.theme-tile--active` — selected state (accent border + glow)
- `.theme-tile-preview` — 130px gradient preview strip
- `.theme-tile-accents` — two small accent-color dots (bottom-right of preview)
- `.theme-tile-dot` — individual dot
- `.theme-tile-name` — name label below preview

**Custom palette editor:**
- `.cp-header` / `.cp-sub` — section title and subtitle
- `.cp-grid` — auto-fill grid of color swatches
- `.cp-field` / `.cp-label` / `.cp-swatch` — color picker field
- `.cp-meta` — column flex wrapper for Name input + Description textarea
- `.cp-actions` — row flex wrapper for action buttons
- `.cp-btn` — base button style
- `.cp-btn--apply` — "Apply to me" (solid accent background)
- `.cp-btn--submit` — "Submit Theme" (accent → accent-2 gradient)
- `.cp-status` — inline status message below buttons
- `.cp-status--ok` — success state (green)
- `.cp-status--err` — error state (red)

**Community themes section:**
- `.community-section` — wrapper (hidden when no themes exist)
- `.community-grid` — same auto-fill grid as `.theme-grid`
- `.theme-tile-author` — small author byline below `.theme-tile-name` (community tiles only)

### Theme Picker (all services after 2026-05-23)
- `.ov-theme-btn-wrap` — `position: relative` wrapper
- `.ov-theme-btn` — circular icon button (34×34px)
- `.ov-theme-popup` — dropdown popup, `position: absolute`
- `.ov-theme-swatches` — 2-column grid of swatch buttons
- `.ov-theme-swatch` — individual swatch button
- `.ov-theme-swatch--active` — active swatch state
- `.ov-theme-swatch-preview` — gradient preview strip (`display: flex; align-items: flex-end`)
- `.ov-theme-swatch-accent` — small colored dot inside preview
- `.ov-theme-swatch-name` — theme name label
- `.ov-theme-explore` — "Explore more themes" link at bottom of popup

### Anonymous / Account Menu
- `.ov-anon-menu` — wrapper
- `.ov-anon-trigger` — pill-shaped trigger button with anon ID label
- `.ov-anon-trigger-name` — text span inside trigger
- `.ov-anon-dropdown` — dropdown panel
- `.ov-anon-dropdown-item` — individual item link
- `.ov-anon-dropdown-item--danger` — red destructive item

---

## Color Scheme Toggle

Themes declare a color scheme via `applyTheme()`:
```js
root.style.setProperty('color-scheme', theme.colorScheme || (theme.id === 'openvibe-light' ? 'light' : 'dark'));
```

The `color-scheme` property tells the browser to use light or dark system UI colors for scrollbars, form elements, etc. Themes declare this via the `colorScheme` field in `themes.json` (`"light"` or `"dark"`). The fallback `theme.id === 'openvibe-light'` check handles any theme object that predates the field.

---

## Dark vs Light CSS Pitfalls

- Use `rgba(255,255,255,0.X)` for subtle white overlays — these work on dark backgrounds
- Use `var(--ov-border)` instead of hardcoded border colors — the variable changes per theme
- Avoid hardcoding `#0b0d12` as a background; use `var(--ov-bg)`
- Semi-transparent navbars use `backdrop-filter: saturate(140%) blur(8px)` — keep `--ov-nav-bg` set so the blur has a color to work from

---

## Responsive Breakpoints

Community/live/media/games/tools share these breakpoints (defined in `@media` queries):

| Breakpoint | Target |
|---|---|
| `max-width: 768px` | Mobile: collapse nav links, single-column grids |
| `max-width: 480px` | Small mobile: shrink padding |

The network service CSS has additional breakpoints for the theme grid and service card grid.

---

## Writing Service-Specific CSS

When adding styles that only apply to one service, add them to that service's `openvibe.css`. Use descriptive class names with a service prefix if they could conflict:

```css
/* Bad: generic name that might clash */
.stream-grid { ... }

/* Better: scoped name */
.ov-live-stream-grid { ... }
```

New shared components (visible in the nav or footer on all services) must be added to **all 7 service CSS files**.
