#!/usr/bin/env bash
# bootstrap-pi.sh — Full OpenVibe Raspberry Pi setup orchestrator.
#
# Run each phase in order. Phases are idempotent — re-running is safe.
# Each phase can also be run individually by calling its script directly.
#
# Usage:
#   sudo bash scripts/deploy/bootstrap-pi.sh [--phase N] [--email user@example.com]
#
# Options:
#   --phase N    Run only phase N (1–8)
#   --email E    Email for Let's Encrypt certs (required in phase 4)
#   --token T    Cloudflare API token (writes to /etc/cloudflare/api-token)
#
# Prerequisites (must be done manually before running):
#   1. Router port forwarding: 80 → Pi, 443 → Pi
#   2. Pi has a static LAN IP (via router DHCP reservation or nmcli)
#   3. Node.js 20 installed via fnm for user jackewl

set -euo pipefail

OPENVIBE_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPTS_DEPLOY="$OPENVIBE_ROOT/scripts/deploy"
CF_TOKEN_FILE="/etc/cloudflare/api-token"
CF_CREDS_FILE="/etc/cloudflare/certbot-credentials.ini"
ONLY_PHASE=""
CF_TOKEN="${CF_TOKEN:-}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-}"

die()  { echo "ERROR: $*" >&2; exit 1; }
log()  { echo "[$(date -Iseconds)] $*"; }
step() { echo; echo "╔══════════════════════════════════════════╗"
               echo "║  $*"
               echo "╚══════════════════════════════════════════╝"; }

[[ "$EUID" -eq 0 ]] || die "Must run as root: sudo bash scripts/deploy/bootstrap-pi.sh"

# ── Parse args ────────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --phase) ONLY_PHASE="$2"; shift 2 ;;
    --email) CERTBOT_EMAIL="$2"; shift 2 ;;
    --token) CF_TOKEN="$2"; shift 2 ;;
    *) die "Unknown argument: $1" ;;
  esac
done

run_phase() {
  local n="$1" name="$2"
  [[ -z "$ONLY_PHASE" || "$ONLY_PHASE" == "$n" ]] || return 0
  step "Phase $n: $name"
}

# ══════════════════════════════════════════════════════════════════════════════
# Phase 1 — System prerequisites
# ══════════════════════════════════════════════════════════════════════════════
run_phase 1 "System prerequisites" && {
  log "Updating apt and installing required packages..."
  apt-get update -qq
  apt-get install -y \
    postgresql postgresql-contrib \
    redis-server \
    nginx \
    sqlite3 \
    jq \
    curl \
    openssl \
    build-essential \
    python3 \
    python3-pip 2>&1 | tail -5

  # Enable Postgres + Redis on boot
  systemctl enable --now postgresql redis-server
  log "PostgreSQL: $(systemctl is-active postgresql)"
  log "Redis:      $(systemctl is-active redis-server)"

  # Install certbot + DNS plugin via snap
  if ! command -v certbot >/dev/null 2>&1; then
    snap install certbot --classic
    snap set certbot trust-plugin-with-root=ok
    snap install certbot-dns-cloudflare
    log "certbot installed via snap"
  else
    log "certbot already installed"
  fi
}

# ══════════════════════════════════════════════════════════════════════════════
# Phase 2 — Cloudflare credentials
# ══════════════════════════════════════════════════════════════════════════════
run_phase 2 "Cloudflare credentials" && {
  mkdir -p /etc/cloudflare
  chmod 700 /etc/cloudflare

  if [[ ! -f "$CF_TOKEN_FILE" ]]; then
    if [[ -n "$CF_TOKEN" ]]; then
      echo "$CF_TOKEN" > "$CF_TOKEN_FILE"
    else
      log "Paste your Cloudflare API token (will be stored in $CF_TOKEN_FILE):"
      read -r -s CF_TOKEN
      echo "$CF_TOKEN" > "$CF_TOKEN_FILE"
    fi
  fi
  chmod 600 "$CF_TOKEN_FILE"
  log "API token stored: $CF_TOKEN_FILE"

  # Certbot credentials file (different format required by certbot-dns-cloudflare)
  if [[ ! -f "$CF_CREDS_FILE" ]]; then
    echo "dns_cloudflare_api_token = $(cat "$CF_TOKEN_FILE")" > "$CF_CREDS_FILE"
    chmod 600 "$CF_CREDS_FILE"
  fi
  log "Certbot credentials stored: $CF_CREDS_FILE"

  # Test token
  log "Verifying token..."
  result=$(curl -sf --max-time 10 \
    -H "Authorization: Bearer $(tr -d '[:space:]' < "$CF_TOKEN_FILE")" \
    "https://api.cloudflare.com/client/v4/user/tokens/verify" | jq -r '.success')
  [[ "$result" == "true" ]] || die "Token verification failed — check the token is correct"
  log "Token verified OK"
}

# ══════════════════════════════════════════════════════════════════════════════
# Phase 3 — npm install
# ══════════════════════════════════════════════════════════════════════════════
run_phase 3 "npm install + rebuild native modules" && {
  cd "$OPENVIBE_ROOT"

  # Run npm install as the service user (not root)
  sudo -u jackewl bash -c "cd '$OPENVIBE_ROOT' && npm install"
  sudo -u jackewl bash -c "cd '$OPENVIBE_ROOT' && npm rebuild better-sqlite3 --build-from-source"
  log "npm install and native rebuild complete"
}

# ══════════════════════════════════════════════════════════════════════════════
# Phase 4 — Restore data (.env, Postgres, SQLite, keys)
# ══════════════════════════════════════════════════════════════════════════════
run_phase 4 "Data restoration" && {
  bash "$SCRIPTS_DEPLOY/restore-data.sh"
}

# ══════════════════════════════════════════════════════════════════════════════
# Phase 5 — Cloudflare DNS + DDNS setup
# ══════════════════════════════════════════════════════════════════════════════
run_phase 5 "Cloudflare DNS + DDNS timer" && {
  # Point all domains to current IP
  CF_TOKEN_FILE="$CF_TOKEN_FILE" bash "$SCRIPTS_DEPLOY/setup-cloudflare-dns.sh"

  # Install + enable DDNS timer
  cp "$SCRIPTS_DEPLOY/cloudflare-ddns.service" /etc/systemd/system/cloudflare-ddns.service
  cp "$SCRIPTS_DEPLOY/cloudflare-ddns.timer"   /etc/systemd/system/cloudflare-ddns.timer
  chmod 644 /etc/systemd/system/cloudflare-ddns.{service,timer}
  chmod +x "$SCRIPTS_DEPLOY/cloudflare-ddns.sh"
  mkdir -p /var/cache/cloudflare-ddns
  chmod 700 /var/cache/cloudflare-ddns

  systemctl daemon-reload
  systemctl enable --now cloudflare-ddns.timer
  log "DDNS timer enabled: $(systemctl is-active cloudflare-ddns.timer)"
}

# ══════════════════════════════════════════════════════════════════════════════
# Phase 6 — TLS certificates
# ══════════════════════════════════════════════════════════════════════════════
run_phase 6 "TLS certificates (Let's Encrypt via DNS challenge)" && {
  [[ -n "$CERTBOT_EMAIL" ]] || {
    log "Enter email for Let's Encrypt notifications:"
    read -r CERTBOT_EMAIL
  }
  export CERTBOT_EMAIL
  bash "$SCRIPTS_DEPLOY/certbot-all-domains.sh"
}

# ══════════════════════════════════════════════════════════════════════════════
# Phase 7 — nginx
# ══════════════════════════════════════════════════════════════════════════════
run_phase 7 "nginx production config" && {
  bash "$SCRIPTS_DEPLOY/install-nginx.sh"
}

# ══════════════════════════════════════════════════════════════════════════════
# Phase 8 — systemd service units
# ══════════════════════════════════════════════════════════════════════════════
run_phase 8 "systemd service units" && {
  bash "$SCRIPTS_DEPLOY/install-services.sh"

  log "Starting core services..."
  systemctl start \
    openvibe-network \
    openvibe-events \
    openvibe-media \
    openvibe-realtime \
    openvibe-workers \
    openvibe-content \
    openre-stream \
    openvibe-live \
    openvibe-chat \
    openvibe-community \
    openvibe-billing \
    openvibe-ai \
    openvibe-games \
    openvibe-tips \
    openvibe-tools \
    openvibe-api \
    openvibe-control 2>/dev/null || true

  sleep 3

  log "Service status:"
  systemctl status openvibe-network openvibe-live openre-stream --no-pager -l 2>&1 | tail -20
}

# ══════════════════════════════════════════════════════════════════════════════
echo
log "══════════════════════════════════════════════"
log "Bootstrap complete."
log ""
log "Verify:"
log "  systemctl status openvibe-network openvibe-live"
log "  systemctl status cloudflare-ddns.timer"
log "  curl -sf https://openvibe.network/health | jq ."
log ""
log "Logs:"
log "  journalctl -fu openvibe-network"
log "  journalctl -u cloudflare-ddns"
log "══════════════════════════════════════════════"
