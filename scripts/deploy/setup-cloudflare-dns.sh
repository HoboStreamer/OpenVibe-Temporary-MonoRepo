#!/usr/bin/env bash
# setup-cloudflare-dns.sh — One-shot Cloudflare DNS provisioning.
#
# Creates A records for all OpenVibe domains pointing to the current public IP.
# Run once during initial setup. The cloudflare-ddns.timer keeps them current.
#
# Usage:
#   sudo bash scripts/deploy/setup-cloudflare-dns.sh
#   CF_TOKEN_FILE=/path/to/token sudo -E bash scripts/deploy/setup-cloudflare-dns.sh

set -euo pipefail

CF_API="https://api.cloudflare.com/client/v4"
TOKEN_FILE="${CF_TOKEN_FILE:-/etc/cloudflare/api-token}"
LOG_TAG="cf-dns-setup"

log()  { echo "[$(date -Iseconds)] $*"; }
die()  { echo "[$(date -Iseconds)] ERROR: $*" >&2; exit 1; }

command -v jq   >/dev/null 2>&1 || die "jq required (apt install jq)"
command -v curl >/dev/null 2>&1 || die "curl required"

# ── Token ────────────────────────────────────────────────────────────────────
if [[ ! -r "$TOKEN_FILE" ]]; then
  log "Token file not found at $TOKEN_FILE — creating from env or prompt"
  if [[ -n "${CF_TOKEN:-}" ]]; then
    mkdir -p "$(dirname "$TOKEN_FILE")"
    echo "$CF_TOKEN" > "$TOKEN_FILE"
    chmod 600 "$TOKEN_FILE"
    log "Token written to $TOKEN_FILE"
  else
    log "Paste your Cloudflare API token and press Enter (it will be stored in $TOKEN_FILE):"
    read -r -s CF_TOKEN
    [[ -n "$CF_TOKEN" ]] || die "No token provided"
    mkdir -p "$(dirname "$TOKEN_FILE")"
    echo "$CF_TOKEN" > "$TOKEN_FILE"
    chmod 600 "$TOKEN_FILE"
    log "Token stored in $TOKEN_FILE"
  fi
fi

TOKEN=$(tr -d '[:space:]' < "$TOKEN_FILE")
[[ -n "$TOKEN" ]] || die "Token file is empty"

# ── Public IP ────────────────────────────────────────────────────────────────
log "Detecting current public IP..."
PUBLIC_IP=$(curl -sf --max-time 10 https://api.ipify.org 2>/dev/null \
         || curl -sf --max-time 10 https://checkip.amazonaws.com 2>/dev/null \
         | tr -d '[:space:]')

[[ "$PUBLIC_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] \
  || die "Could not determine valid public IPv4 (got: '$PUBLIC_IP')"
log "Public IP: $PUBLIC_IP"

# ── Helpers ───────────────────────────────────────────────────────────────────
_cf() {
  local method="$1" path="$2" data="${3:-}"
  local args=(-sf --max-time 30 -X "$method"
              -H "Authorization: Bearer $TOKEN"
              -H "Content-Type: application/json")
  [[ -n "$data" ]] && args+=(-d "$data")
  curl "${args[@]}" "$CF_API/$path"
}

# Returns zone ID or empty string if not found
get_zone_id() {
  local domain="$1"
  _cf GET "zones?name=${domain}&status=active" | jq -r '.result[0].id // empty'
}

# upsert_a_record <zone-id> <name> <ip> <proxied>
upsert_a_record() {
  local zone_id="$1" name="$2" ip="$3" proxied="$4"

  local existing
  existing=$(_cf GET "zones/${zone_id}/dns_records?type=A&name=${name}&per_page=1" \
             | jq -r '.result[0].id // empty')

  local payload
  payload="{\"type\":\"A\",\"name\":\"$name\",\"content\":\"$ip\",\"ttl\":1,\"proxied\":$proxied}"

  if [[ -z "$existing" ]]; then
    local result
    result=$(_cf POST "zones/${zone_id}/dns_records" "$payload")
    if [[ "$(echo "$result" | jq -r '.success')" == "true" ]]; then
      log "  CREATED  A $name → $ip (proxied=$proxied)"
    else
      log "  FAILED   A $name: $(echo "$result" | jq -r '.errors[0].message // "unknown"')"
      return 1
    fi
  else
    local result
    result=$(_cf PUT "zones/${zone_id}/dns_records/${existing}" "$payload")
    if [[ "$(echo "$result" | jq -r '.success')" == "true" ]]; then
      log "  UPDATED  A $name → $ip (proxied=$proxied)"
    else
      log "  FAILED   A $name: $(echo "$result" | jq -r '.errors[0].message // "unknown"')"
      return 1
    fi
  fi
}

# ── Zone → records config ─────────────────────────────────────────────────────
# Format: "zone|record-name|proxied"
# proxied=false → grey cloud (DNS-only) for streaming
# proxied=true  → orange cloud for everything else

RECORDS=(
  "openvibe.network|openvibe.network|true"
  "openvibe.network|*.openvibe.network|true"
  "openvibe.tools|openvibe.tools|true"
  "openvibe.chat|openvibe.chat|true"
  "openvibe.community|openvibe.community|true"
  "openvibe.games|openvibe.games|true"
  "openvibe.codes|openvibe.codes|true"
  "openvibe.blog|openvibe.blog|true"
  "openvibe.wiki|openvibe.wiki|true"
  "openvibe.news|openvibe.news|true"
  "openvibe.reviews|openvibe.reviews|true"
  "openvibe.deals|openvibe.deals|true"
  "openvibe.coupons|openvibe.coupons|true"
  "openvibe.trade|openvibe.trade|true"
  "openvibe.vip|openvibe.vip|true"
  "openvibe.host|openvibe.host|true"
  "openvibe.tips|openvibe.tips|true"
  # DNS-only (grey cloud) — direct TCP, large media, streaming
  "openvibe.live|openvibe.live|false"
  "openre.stream|openre.stream|false"
  "openvibe.media|openvibe.media|false"

  # openre.stream RTMP ingest subdomain (DNS-only — direct TCP port 1935)
  "openre.stream|ingest.openre.stream|false"

  # alexfrison.net — personal resume site hosted on the Pi
  "alexfrison.net|alexfrison.net|true"
  "alexfrison.net|www.alexfrison.net|true"
  # NOTE: hobostreamer.com, hobo.tools, hobo.quest intentionally NOT managed here.
  # Those domains point to GitHub Pages explaining the shutdown — leave as-is.
)

ERRORS=0
for entry in "${RECORDS[@]}"; do
  IFS='|' read -r zone name proxied <<< "$entry"
  log "Processing zone: $zone → record: $name"
  zone_id=$(get_zone_id "$zone")
  if [[ -z "$zone_id" ]]; then
    log "  SKIP — zone $zone not found in this Cloudflare account"
    continue
  fi
  upsert_a_record "$zone_id" "$name" "$PUBLIC_IP" "$proxied" || (( ERRORS++ ))
done

echo
if (( ERRORS > 0 )); then
  log "Done with $ERRORS error(s). Fix above failures then re-run."
  exit 1
fi
log "All DNS records provisioned successfully → $PUBLIC_IP"
log "DDNS timer will keep them updated automatically."
