# OpenVibe NGINX + Cloudflare deployment

The checked-in `deploy/nginx/` files are the baseline ingress templates for
the scalable runtime track.

## What is included

- `deploy/nginx/nginx.conf` — base worker/event/http config
- `deploy/nginx/conf.d/openvibe.conf` — upstreams and host routing for local
  OpenVibe surfaces
- `deploy/nginx/conf.d/rate-limits.conf` — starter request/connection zones
- `deploy/nginx/conf.d/cloudflare-real-ip.conf.example` — example real-IP
  extraction template for Cloudflare-fronted environments

## Deployment notes

- Prefer WebSocket transport for realtime surfaces so sticky sessions are not
  required by default.
- For large media uploads, prefer direct presigned uploads to storage instead
  of proxying giant request bodies through Cloudflare and NGINX.
- Keep `OPENVIBE_LEGACY_COMPAT_MODE=false` as the normal production posture.
- Treat Cloudflare R2 as hot edge storage only; Backblaze B2 remains the
  canonical byte store in the target architecture.

## Validation

- Use `node scripts/readiness/check-scalable-runtime.js --offline` to verify
  the ingress scaffolding exists in-repo.
- Validate the final generated NGINX configuration with `nginx -t` in the
  deployment environment before switching traffic.
