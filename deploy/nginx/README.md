# OpenVibe NGINX bundle

This folder is a repo-local NGINX configuration bundle for host-based OpenVibe routing.

## Local validation

If `nginx` is installed locally, validate with:

- `nginx -t -p $(pwd)/deploy/nginx -c $(pwd)/deploy/nginx/nginx.conf`

The checked-in config uses repo-relative includes so the command above can lint the bundle without copying files into `/etc/nginx` first.

## Notes

- `/socket.io/` must preserve WebSocket upgrades and bypass cache.
- auth, admin, billing, and private APIs should be no-store.
- public static and safe public media GETs may opt into cache once the origin emits clear cache headers.
- Cloudflare real-IP handling lives in `conf.d/cloudflare-real-ip.conf.example`.
