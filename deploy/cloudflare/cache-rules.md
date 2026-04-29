# Cloudflare cache rules

## Cacheable

- versioned static assets
- public HTML for indexable content hosts when the origin emits cache-safe headers
- public media GETs that do not require signed URLs

## Never cache

- `/oauth/*`
- `/api/v1/session*`
- `/api/v1/*` write routes
- `/admin*`
- `/billing*`
- `/socket.io/*`
- any signed download/upload URLs

## Notes

- Treat draft/noindex content pages as cacheable only if the origin explicitly marks them as safe and no secrets are embedded.
- Avoid cache rules that ignore query strings for signed URLs.
