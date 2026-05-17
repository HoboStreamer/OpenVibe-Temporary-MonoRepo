#!/usr/bin/env bash
# certbot-all-domains.sh — Obtain Let's Encrypt TLS certs for all OpenVibe domains.
#
# Uses the certbot-dns-cloudflare plugin (DNS-01 challenge) — no port 80 needed.
# Credentials file: /etc/cloudflare/certbot-credentials.ini (created by bootstrap-pi.sh)
#
# Re-running this script is safe — certbot skips certs that are already valid.
#
# Usage: sudo bash scripts/deploy/certbot-all-domains.sh

set -euo pipefail

CREDS="/etc/cloudflare/certbot-credentials.ini"
EMAIL="${CERTBOT_EMAIL:-}"

die() { echo "ERROR: $*" >&2; exit 1; }
log() { echo "[$(date -Iseconds)] $*"; }

command -v certbot >/dev/null 2>&1 || die "certbot not installed. Run: sudo snap install certbot --classic"

# Check DNS plugin
certbot plugins 2>/dev/null | grep -q dns_cloudflare \
  || die "certbot-dns-cloudflare plugin not installed. Run: sudo snap install certbot-dns-cloudflare"

[[ -r "$CREDS" ]] \
  || die "Cloudflare credentials not found at $CREDS — run bootstrap-pi.sh first"

if [[ -z "$EMAIL" ]]; then
  log "Enter your email for cert expiry notifications:"
  read -r EMAIL
  [[ -n "$EMAIL" ]] || die "Email is required for Let's Encrypt registration"
fi

BASE_ARGS=(
  certonly
  --dns-cloudflare
  --dns-cloudflare-credentials "$CREDS"
  --dns-cloudflare-propagation-seconds 30
  --non-interactive
  --agree-tos
  --email "$EMAIL"
  --keep-until-expiring
  --expand
)

cert() {
  local desc="$1"; shift
  log "Obtaining cert: $desc"
  certbot "${BASE_ARGS[@]}" "$@" && log "  OK: $desc" || log "  WARN: $desc failed (check certbot logs)"
}

# ── openvibe.network wildcard — covers all *.openvibe.network subdomains ──────
cert "openvibe.network wildcard" \
  -d "openvibe.network" \
  -d "*.openvibe.network"

# ── Standalone TLD certs ──────────────────────────────────────────────────────
# DNS-only domains (need publicly-trusted certs, direct TLS from browser)
cert "openvibe.live"      -d "openvibe.live"
cert "openre.stream"      -d "openre.stream"
cert "openvibe.media"     -d "openvibe.media"

# Proxied domains (Cloudflare terminates TLS at edge, but origin cert is still needed
# for Cloudflare ↔ origin "Full (strict)" SSL mode)
cert "openvibe.tools"     -d "openvibe.tools"
cert "openvibe.chat"      -d "openvibe.chat"
cert "openvibe.community" -d "openvibe.community"
cert "openvibe.games"     -d "openvibe.games"
cert "openvibe.codes"     -d "openvibe.codes"
cert "openvibe.blog"      -d "openvibe.blog"
cert "openvibe.wiki"      -d "openvibe.wiki"
cert "openvibe.news"      -d "openvibe.news"
cert "openvibe.reviews"   -d "openvibe.reviews"
cert "openvibe.deals"     -d "openvibe.deals"
cert "openvibe.coupons"   -d "openvibe.coupons"
cert "openvibe.trade"     -d "openvibe.trade"
cert "openvibe.vip"       -d "openvibe.vip"
cert "openvibe.host"      -d "openvibe.host"
cert "openvibe.tips"      -d "openvibe.tips"

# ── Legacy Hobo Network domains ───────────────────────────────────────────────
cert "alexfrison.net" \
  -d "alexfrison.net" \
  -d "www.alexfrison.net"

cert "hobostreamer.com" \
  -d "hobostreamer.com" \
  -d "www.hobostreamer.com"

cert "hobo.tools wildcard" \
  -d "hobo.tools" \
  -d "*.hobo.tools"

cert "hobo.quest" \
  -d "hobo.quest"

echo
log "Certificate provisioning complete."
log "Auto-renewal is handled by: systemctl status snap.certbot.renew.timer"
log "Test renewal with: sudo certbot renew --dry-run"
