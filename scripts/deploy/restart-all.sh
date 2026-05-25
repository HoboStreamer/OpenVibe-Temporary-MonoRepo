#!/usr/bin/env bash
# restart-all.sh — Pull latest code, reload nginx, and restart all OpenVibe services.
#
# Usage:
#   sudo bash scripts/deploy/restart-all.sh           # restart services + reload nginx
#   sudo bash scripts/deploy/restart-all.sh --pull    # git pull first, then restart
#   sudo bash scripts/deploy/restart-all.sh --install # also run npm install in each service
#   sudo bash scripts/deploy/restart-all.sh --pull --install
#
# Must be run as root (or with sudo) because systemctl restart requires it.

set -euo pipefail

OPENVIBE_ROOT="/opt/openvibe"
SERVICE_USER="jackewl"

OPT_PULL=0
OPT_INSTALL=0
for arg in "$@"; do
  case "$arg" in
    --pull)    OPT_PULL=1 ;;
    --install) OPT_INSTALL=1 ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

die()  { echo "ERROR: $*" >&2; exit 1; }
log()  { echo "[$(date '+%H:%M:%S')] $*"; }
ok()   { echo "  ✓ $*"; }
warn() { echo "  ! $*"; }

[[ "$EUID" -eq 0 ]] || die "Run with sudo: sudo bash scripts/deploy/restart-all.sh"
[[ -d "$OPENVIBE_ROOT" ]] || die "OPENVIBE_ROOT not found: $OPENVIBE_ROOT"

# ── Service list (ordered: infrastructure first, then product surfaces) ────────
SERVICES=(
  openvibe-events
  openvibe-network
  openvibe-media
  openvibe-realtime
  openvibe-workers
  openvibe-content
  openre-stream
  openvibe-live
  openvibe-chat
  openvibe-community
  openvibe-billing
  openvibe-ai
  openvibe-games
  openvibe-tips
  openvibe-tools
  openvibe-api
  openvibe-control
)

echo
echo "══════════════════════════════════════════════"
echo "  OpenVibe restart — $(date '+%Y-%m-%d %H:%M:%S')"
echo "══════════════════════════════════════════════"
echo

# ── 1. Git pull ────────────────────────────────────────────────────────────────
if [[ "$OPT_PULL" -eq 1 ]]; then
  log "Pulling latest code..."
  cd "$OPENVIBE_ROOT"
  su - "$SERVICE_USER" -c "cd $OPENVIBE_ROOT && git pull --ff-only" \
    && ok "git pull done" \
    || die "git pull failed — resolve conflicts manually first"
fi

# ── 2. npm install ─────────────────────────────────────────────────────────────
if [[ "$OPT_INSTALL" -eq 1 ]]; then
  log "Running npm install in each service..."
  NODE_BIN=$(find "/home/${SERVICE_USER}/.local/share/fnm/node-versions" \
                -name node -type f -perm /111 2>/dev/null | sort -V | tail -1 || true)
  [[ -z "$NODE_BIN" ]] && NODE_BIN=$(su - "$SERVICE_USER" -c 'command -v node 2>/dev/null' 2>/dev/null || true)
  [[ -z "$NODE_BIN" || ! -x "$NODE_BIN" ]] && die "Cannot find node binary for $SERVICE_USER"
  NPM_BIN="$(dirname "$NODE_BIN")/npm"

  for svc in "${SERVICES[@]}"; do
    svc_dir="$OPENVIBE_ROOT/services/$svc"
    if [[ -f "$svc_dir/package.json" ]]; then
      su - "$SERVICE_USER" -c "cd $svc_dir && $NPM_BIN install --production --silent" \
        && ok "$svc" \
        || warn "$svc npm install failed (continuing)"
    fi
  done
fi

# ── 3. Reload nginx ────────────────────────────────────────────────────────────
log "Testing nginx config..."
if nginx -t 2>/dev/null; then
  ok "nginx config valid"
  log "Reloading nginx..."
  systemctl reload nginx && ok "nginx reloaded" || warn "nginx reload failed"
else
  warn "nginx config test FAILED — skipping reload (services will still restart)"
  nginx -t  # print the error
fi

# ── 4. Restart services in parallel groups ────────────────────────────────────
# Group 1: event bus — everything depends on it, must be up first
TIER1=(openvibe-events)

# Group 2: core platform — start together once events is up
TIER2=(
  openvibe-network
  openvibe-media
  openvibe-realtime
  openvibe-workers
)

# Group 3: product surfaces — start together once core is up
TIER3=(
  openvibe-content
  openre-stream
  openvibe-live
  openvibe-chat
  openvibe-community
  openvibe-billing
  openvibe-ai
  openvibe-games
  openvibe-tips
  openvibe-tools
  openvibe-api
  openvibe-control
)

restart_group() {
  local label="$1"; shift
  local group=("$@")
  local pids=()
  local names=()

  log "Starting tier: $label (${#group[@]} services in parallel)..."
  for svc in "${group[@]}"; do
    if ! systemctl is-enabled "$svc" &>/dev/null; then
      warn "SKIP $svc (not installed)"
      continue
    fi
    systemctl restart "$svc" &
    pids+=("$!")
    names+=("$svc")
  done

  local i=0
  for pid in "${pids[@]}"; do
    if wait "$pid"; then
      ok "${names[$i]}"
    else
      warn "FAILED ${names[$i]}"
      FAILED+=("${names[$i]}")
    fi
    i=$((i + 1))
  done
}

FAILED=()
restart_group "tier-1 (events)"   "${TIER1[@]}"
sleep 2
restart_group "tier-2 (core)"     "${TIER2[@]}"
sleep 2
restart_group "tier-3 (surfaces)" "${TIER3[@]}"

# ── 5. Status summary ──────────────────────────────────────────────────────────
echo
log "Waiting 4s for services to settle..."
sleep 4
echo
echo "── Status ────────────────────────────────────"
printf "%-30s %s\n" "SERVICE" "STATE"
printf "%-30s %s\n" "-------" "-----"
for svc in "${SERVICES[@]}"; do
  if ! systemctl is-enabled "$svc" &>/dev/null; then
    continue
  fi
  state=$(systemctl is-active "$svc" 2>/dev/null || echo "unknown")
  if [[ "$state" == "active" ]]; then
    printf "%-30s ✓ running\n" "$svc"
  else
    printf "%-30s ✗ %s\n" "$svc" "$state"
  fi
done
echo

if [[ ${#FAILED[@]} -gt 0 ]]; then
  echo "Failed to restart: ${FAILED[*]}"
  echo "Check logs with:  journalctl -u <service-name> -n 50 --no-pager"
  exit 1
fi

log "Done. All services restarted."
