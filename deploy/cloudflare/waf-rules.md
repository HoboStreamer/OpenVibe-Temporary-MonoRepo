# Cloudflare WAF and rate-limit guidance

## Recommended protections

- basic bot management on public unauthenticated hosts
- rate limits on `/oauth/token`, `/oauth/authorize`, `/api/v1/session/bridge`, and admin write endpoints
- body size and request burst controls for upload init/complete APIs
- moderation-sensitive routes monitored for abuse spikes

## Cautions

- Do not block WebSocket upgrade traffic on `/socket.io/`.
- Do not treat internal service actor traffic as browser traffic.
- WAF rules should fail closed for private APIs but remain observable in logs before aggressive enforcement.
