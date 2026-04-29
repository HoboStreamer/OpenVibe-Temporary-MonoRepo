# Cloudflare rules for OpenVibe

Use Cloudflare as an edge shield, not as the source of truth for identity, billing, or media state.

## Core assumptions

- Host-based routing stays authoritative at the origin and mirrors the native OpenVibe surface map.
- `CF-Connecting-IP` is trusted only after the origin also enables the Cloudflare real-IP config.
- `/socket.io/` traffic must bypass caching and preserve WebSocket upgrades.
- Auth, admin, billing, and other private APIs must be marked no-store.
- Public static GETs and safe public media GETs may use edge caching when the origin response is explicit.
