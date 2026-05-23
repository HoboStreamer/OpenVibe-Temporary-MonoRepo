# OpenVibe Styling Guide

How the shared CSS system works across all OpenVibe services. Written by Claude Code.

---

## CSS Variable System

Every surface applies its visual identity through CSS custom properties (variables) set on `<html>`. The JavaScript `applyTheme()` function in each service's `openvibe.js` sets these at runtime.

### Core variables

| Variable | Purpose | Example (dark) |
|---|---|---|
| `--ov-bg` | Page background | `#060917` |
| `--ov-bg-soft` | Soft/elevated background (panels, cards) | `rgba(11, 16, 33, 0.84)` |
| `--ov-nav-bg` | Nav bar background | same as `--ov-bg` |
| `--ov-text` | Primary text | `#eef4ff` |
| `--ov-text-dim` | Secondary/muted text | `#a7b5d2` |
| `--ov-accent` | Primary accent (links, buttons, highlights) | `#8b5cf6` |
| `--ov-accent-2` | Secondary accent (gradients, hover states) | `#22d3ee` |

These are set by each theme and are the only variables you should change to theme a surface.

### Additional variables (set in CSS `:root`, not by themes)

| Variable | Purpose |
|---|---|
| `--ov-bg-elev` | Elevated background for cards |
| `--ov-bg-elev-2` | Double-elevated background |
| `--ov-border` | Default border color |
| `--ov-warn` | Warning color |
| `--ov-danger` | Destructive/error color |
| `--ov-ok` | Success color |
| `--ov-radius` | Card/panel border radius |
| `--ov-radius-sm` | Small border radius (buttons, chips) |
| `--ov-shadow` | Default box shadow |
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
root.style.setProperty('color-scheme', theme.id === 'openvibe-light' ? 'light' : 'dark');
```

The `color-scheme` property tells the browser to use light or dark system UI colors for scrollbars, form elements, etc. Only the `openvibe-light` theme sets `light`; all others use `dark`.

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
