#!/usr/bin/env bash
# install-nginx.sh — Install OpenVibe production nginx config on this Pi.
#
# - Copies the production nginx vhost config to /etc/nginx/conf.d/
# - Installs the Cloudflare real-IP trust config
# - Adjusts the main nginx.conf to include the production includes
# - Tests the config and reloads nginx
#
# Usage: sudo bash scripts/deploy/install-nginx.sh

set -euo pipefail

OPENVIBE_ROOT="/opt/openvibe"
NGINX_CONF_D="/etc/nginx/conf.d"
NGINX_SITES_ENABLED="/etc/nginx/sites-enabled"

die() { echo "ERROR: $*" >&2; exit 1; }
log() { echo "[$(date -Iseconds)] $*"; }

[[ "$EUID" -eq 0 ]] || die "Must run as root (sudo)"
command -v nginx >/dev/null 2>&1 || die "nginx not installed (apt install nginx)"

# ── 1. WebSocket upgrade map ─────────────────────────────────────────────────
log "Installing WebSocket upgrade map..."

cat > "$NGINX_CONF_D/websocket-upgrade.conf" <<'EOF'
# WebSocket connection upgrade map — required by all proxy configs that use
# proxy_set_header Connection $connection_upgrade;
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}
EOF

log "WebSocket upgrade map installed"

# ── 3. Cloudflare real-IP config ──────────────────────────────────────────────
log "Installing Cloudflare real-IP config..."

cat > "$NGINX_CONF_D/cloudflare-realip.conf" <<'EOF'
# Cloudflare real-IP trust — trust CF-Connecting-IP header from CF edge IPs.
# Ranges kept current as of 2026. Update when CF publishes new ranges:
# https://www.cloudflare.com/ips/

real_ip_header CF-Connecting-IP;
real_ip_recursive on;

# IPv4
set_real_ip_from 173.245.48.0/20;
set_real_ip_from 103.21.244.0/22;
set_real_ip_from 103.22.200.0/22;
set_real_ip_from 103.31.4.0/22;
set_real_ip_from 141.101.64.0/18;
set_real_ip_from 108.162.192.0/18;
set_real_ip_from 190.93.240.0/20;
set_real_ip_from 188.114.96.0/20;
set_real_ip_from 197.234.240.0/22;
set_real_ip_from 198.41.128.0/17;
set_real_ip_from 162.158.0.0/15;
set_real_ip_from 104.16.0.0/13;
set_real_ip_from 104.24.0.0/14;
set_real_ip_from 172.64.0.0/13;
set_real_ip_from 131.0.72.0/22;

# IPv6
set_real_ip_from 2400:cb00::/32;
set_real_ip_from 2606:4700::/32;
set_real_ip_from 2803:f800::/32;
set_real_ip_from 2405:b500::/32;
set_real_ip_from 2405:8100::/32;
set_real_ip_from 2a06:98c0::/29;
set_real_ip_from 2c0f:f248::/32;
EOF

log "Cloudflare real-IP config installed"

# ── 4. Production vhost config ────────────────────────────────────────────────
log "Installing OpenVibe production nginx vhost config..."

PROD_CONF="$OPENVIBE_ROOT/deploy/nginx/conf.d/openvibe-production.conf"
[[ -f "$PROD_CONF" ]] || die "Production nginx config not found: $PROD_CONF"

ln -sf "$PROD_CONF" "$NGINX_CONF_D/openvibe.conf"
log "Symlinked $PROD_CONF → $NGINX_CONF_D/openvibe.conf"

# Symlink legacy Hobo config (only if cert exists to avoid nginx startup failure)
LEGACY_CONF="$OPENVIBE_ROOT/deploy/nginx/conf.d/legacy-hobo.conf"
if [[ -f "$LEGACY_CONF" ]]; then
  if [[ -f /etc/letsencrypt/live/hobostreamer.com/fullchain.pem ]]; then
    ln -sf "$LEGACY_CONF" "$NGINX_CONF_D/legacy-hobo.conf"
    log "Symlinked legacy-hobo.conf"
  else
    log "SKIP legacy-hobo.conf — TLS certs not yet issued (run certbot-all-domains.sh first)"
  fi
fi

# Symlink alexfrison.net config (only if cert exists)
AF_CONF="$OPENVIBE_ROOT/deploy/nginx/conf.d/alexfrison.conf"
if [[ -f "$AF_CONF" ]]; then
  if [[ -f /etc/letsencrypt/live/alexfrison.net/fullchain.pem ]]; then
    ln -sf "$AF_CONF" "$NGINX_CONF_D/alexfrison.conf"
    log "Symlinked alexfrison.conf"
  else
    log "SKIP alexfrison.conf — TLS certs not yet issued (run certbot-all-domains.sh first)"
  fi
fi

# ── 5. Disable default nginx site ────────────────────────────────────────────────
if [[ -f "$NGINX_SITES_ENABLED/default" ]]; then
  rm -f "$NGINX_SITES_ENABLED/default"
  log "Removed default nginx site"
fi

# ── 6. Remove redundant check (upgrade map now installed as conf.d file) ───────
MAIN_CONF="/etc/nginx/nginx.conf"
if ! grep -q 'http_upgrade' "$NGINX_CONF_D/websocket-upgrade.conf" 2>/dev/null; then
  log "WARN: websocket-upgrade.conf may be missing — re-run this script to fix"
fi

# ── 7. Test + reload ──────────────────────────────────────────────────────────
log "Testing nginx configuration..."
if nginx -t 2>&1; then
  log "Config OK — reloading nginx..."
  systemctl reload nginx
  log "nginx reloaded"
else
  die "nginx config test FAILED — fix errors above before proceeding"
fi

log "nginx installation complete."
