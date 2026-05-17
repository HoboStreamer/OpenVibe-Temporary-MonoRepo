#!/usr/bin/env bash
# cloudflare-ddns.sh — Update Cloudflare DNS A records when home IP changes.
#
# Reads the Cloudflare API token from /etc/cloudflare/api-token (chmod 600).
# Caches zone IDs and last-known IP in /var/cache/cloudflare-ddns/ to minimise
# API calls. Logs to the systemd journal via logger.
#
# Run via the cloudflare-ddns.timer unit (every 5 minutes).

set -euo pipefail

CF_API="https://api.cloudflare.com/client/v4"
TOKEN_FILE="${CF_TOKEN_FILE:-/etc/cloudflare/api-token}"
CACHE_DIR="/var/cache/cloudflare-ddns"
LOG_TAG="cloudflare-ddns"

log()  { logger -t "$LOG_TAG" "$*";        echo    "$*"; }
warn() { logger -t "$LOG_TAG" "WARN: $*";  echo    "WARN: $*" >&2; }
die()  { logger -t "$LOG_TAG" "ERROR: $*"; echo   "ERROR: $*" >&2; exit 1; }

# ── Token ────────────────────────────────────────────────────────────────────
[[ -r "$TOKEN_FILE" ]] || die "Cannot read token from $TOKEN_FILE — run bootstrap-pi.sh first"
TOKEN=$(tr -d '[:space:]' < "$TOKEN_FILE")
[[ -n "$TOKEN" ]] || die "Token file is empty: $TOKEN_FILE"

# ── Dependencies ─────────────────────────────────────────────────────────────
command -v jq  >/dev/null 2>&1 || die "jq is required (apt install jq)"
command -v curl >/dev/null 2>&1 || die "curl is required"

mkdir -p "$CACHE_DIR"
chmod 700 "$CACHE_DIR"

# ── Public IP ────────────────────────────────────────────────────────────────
NEW_IP=$(curl -sf --max-time 10 https://api.ipify.org 2>/dev/null \
      || curl -sf --max-time 10 https://checkip.amazonaws.com 2>/dev/null \
      || curl -sf --max-time 10 https://ifconfig.me 2>/dev/null \
      | tr -d '[:space:]')

[[ "$NEW_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] \
  || die "Could not determine a valid public IPv4 address (got: '$NEW_IP')"

# ── Early exit if unchanged ───────────────────────────────────────────────────
LAST_IP_FILE="$CACHE_DIR/last-ip"
if [[ -f "$LAST_IP_FILE" && "$(cat "$LAST_IP_FILE")" == "$NEW_IP" ]]; then
  log "IP unchanged: $NEW_IP — nothing to do"
  exit 0
fi

log "Public IP changed → $NEW_IP (was: $(cat "$LAST_IP_FILE" 2>/dev/null || echo 'unknown'))"

# ── Cloudflare helpers ────────────────────────────────────────────────────────
_cf() {
  local method="$1" path="$2" data="${3:-}"
  local args=(-sf --max-time 20 -X "$method"
              -H "Authorization: Bearer $TOKEN"
              -H "Content-Type: application/json")
  [[ -n "$data" ]] && args+=(-d "$data")
  curl "${args[@]}" "$CF_API/$path"
}

get_zone_id() {
  local domain="$1"
  local cache="$CACHE_DIR/zone-${domain//\//_}"
  if [[ -f "$cache" ]]; then cat "$cache"; return 0; fi
  local id
  id=$(_cf GET "zones?name=${domain}&status=active" \
       | jq -r '.result[0].id // empty')
  [[ -n "$id" ]] || { warn "Zone not found in Cloudflare: $domain"; return 1; }
  echo "$id" > "$cache"
  chmod 600 "$cache"
  echo "$id"
}

# upsert_record <zone> <record-name> <proxied:true|false>
upsert_record() {
  local zone="$1" name="$2" proxied="$3"
  local zone_id
  zone_id=$(get_zone_id "$zone") || return 0  # skip zones not yet in CF

  # Look up existing A record
  local existing rec_id cur_ip
  existing=$(_cf GET "zones/${zone_id}/dns_records?type=A&name=${name}&per_page=1" \
             | jq -r '.result[0] | "\(.id)|\(.content)" // empty' 2>/dev/null || true)

  if [[ -z "$existing" ]]; then
    log "Creating  A $name → $NEW_IP (proxied=$proxied)"
    local result
    result=$(_cf POST "zones/${zone_id}/dns_records" \
               "{\"type\":\"A\",\"name\":\"$name\",\"content\":\"$NEW_IP\",\"ttl\":1,\"proxied\":$proxied}")
    if [[ "$(echo "$result" | jq -r '.success')" != "true" ]]; then
      warn "Failed to create $name: $(echo "$result" | jq -r '.errors[0].message // "unknown"')"
    fi
    return
  fi

  rec_id="${existing%%|*}"
  cur_ip="${existing##*|}"

  if [[ "$cur_ip" == "$NEW_IP" ]]; then
    log "Up-to-date A $name → $NEW_IP"
    return
  fi

  log "Updating  A $name: $cur_ip → $NEW_IP (proxied=$proxied)"
  local result
  result=$(_cf PATCH "zones/${zone_id}/dns_records/${rec_id}" \
             "{\"type\":\"A\",\"name\":\"$name\",\"content\":\"$NEW_IP\",\"ttl\":1,\"proxied\":$proxied}")
  if [[ "$(echo "$result" | jq -r '.success')" != "true" ]]; then
    warn "Failed to update $name: $(echo "$result" | jq -r '.errors[0].message // "unknown"')"
  fi
}

# ── Record table: "zone|record-name|proxied" ─────────────────────────────────
# proxied=false for DNS-only (grey cloud): openvibe.live, openre.stream, openvibe.media
# proxied=true  for orange cloud (Cloudflare edge): everything else

RECORDS=(
  # openvibe.network zone — wildcard covers all *.openvibe.network subdomains
  "openvibe.network|openvibe.network|true"
  "openvibe.network|*.openvibe.network|true"

  # Standalone TLD zones — orange cloud (web/API)
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

  # DNS-only (grey cloud) — streaming / large media
  "openvibe.live|openvibe.live|false"
  "openre.stream|openre.stream|false"
  "openvibe.media|openvibe.media|false"

  # openre.stream RTMP ingest subdomain (DNS-only)
  "openre.stream|ingest.openre.stream|false"

  # Legacy Hobo Network
  "alexfrison.net|alexfrison.net|true"
  "alexfrison.net|www.alexfrison.net|true"
  "hobostreamer.com|hobostreamer.com|false"
  "hobostreamer.com|www.hobostreamer.com|true"
  "hobo.tools|hobo.tools|true"
  "hobo.tools|*.hobo.tools|true"
  "hobo.quest|hobo.quest|true"
)

ERRORS=0
for entry in "${RECORDS[@]}"; do
  IFS='|' read -r zone name proxied <<< "$entry"
  upsert_record "$zone" "$name" "$proxied" || (( ERRORS++ ))
done

if (( ERRORS > 0 )); then
  warn "$ERRORS record(s) failed to update — check logs above"
  exit 1
fi

# Persist new IP on full success
echo "$NEW_IP" > "$LAST_IP_FILE"
chmod 600 "$LAST_IP_FILE"
log "All records updated successfully → $NEW_IP"

# Update MEDIASOUP_ANNOUNCED_IP in openvibe .env so WebRTC stays reachable
ENV_FILE="/opt/openvibe/.env"
if [[ -f "$ENV_FILE" ]]; then
  if grep -q "^MEDIASOUP_ANNOUNCED_IP=" "$ENV_FILE"; then
    sed -i "s|^MEDIASOUP_ANNOUNCED_IP=.*|MEDIASOUP_ANNOUNCED_IP=${NEW_IP}|" "$ENV_FILE"
  else
    echo "MEDIASOUP_ANNOUNCED_IP=${NEW_IP}" >> "$ENV_FILE"
  fi
  log "Updated MEDIASOUP_ANNOUNCED_IP=${NEW_IP}"
  # Gracefully restart openre-stream so it picks up the new announced IP
  if systemctl is-active --quiet openre-stream 2>/dev/null; then
    systemctl restart openre-stream
    log "Restarted openre-stream with new announced IP"
  fi
fi
