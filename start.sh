#!/usr/bin/env bash
# start.sh — Single entry point to start or restart the entire OpenVibe platform.
#
# PRODUCTION (VPS, run as root):
#   sudo bash start.sh             # restart all services + reload nginx
#   sudo bash start.sh --pull      # git pull first, then restart
#   sudo bash start.sh --install   # also run npm install (after adding packages)
#
# DEVELOPMENT (local machine, run as normal user):
#   bash start.sh                  # start all services (requires Postgres + Redis)
#   bash start.sh --stop           # stop the dev stack
#   bash start.sh --install        # reinstall node_modules first

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

# ── Parse flags ────────────────────────────────────────────────────────────────
OPT_PULL=0
OPT_INSTALL=0
OPT_STOP=0
for arg in "$@"; do
  case "$arg" in
    --pull)    OPT_PULL=1 ;;
    --install) OPT_INSTALL=1 ;;
    --stop)    OPT_STOP=1 ;;
    --help|-h)
      sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "Unknown flag: $arg  (try --help)" >&2; exit 1 ;;
  esac
done

# ── Helpers ────────────────────────────────────────────────────────────────────
log()  { echo "[$(date '+%H:%M:%S')] $*"; }
ok()   { echo "  ✓ $*"; }
warn() { echo "  ! $*"; }
die()  { echo "ERROR: $*" >&2; exit 1; }
hr()   { echo "──────────────────────────────────────────────"; }

# ── Detect mode ────────────────────────────────────────────────────────────────
# Prod mode: running as root AND systemd is available AND at least one unit is installed
is_prod() {
  [[ "$EUID" -eq 0 ]] && \
  command -v systemctl &>/dev/null && \
  systemctl is-enabled openvibe-network &>/dev/null 2>&1
}

# ══════════════════════════════════════════════════════════════════════════════
#  PRODUCTION MODE
# ══════════════════════════════════════════════════════════════════════════════
if is_prod; then
  OPENVIBE_ROOT="/opt/openvibe"
  SERVICE_USER="jackewl"

  ALL_SERVICES=(
    openvibe-events openvibe-network openvibe-media openvibe-realtime
    openvibe-workers openvibe-content openre-stream openvibe-live
    openvibe-chat openvibe-community openvibe-billing openvibe-ai
    openvibe-games openvibe-tips openvibe-tools openvibe-api openvibe-control
  )

  echo
  hr
  echo "  OpenVibe — production restart  $(date '+%Y-%m-%d %H:%M:%S')"
  hr
  echo

  # ── 1. Git pull ──────────────────────────────────────────────────────────────
  if [[ "$OPT_PULL" -eq 1 ]]; then
    log "Pulling latest code..."
    [[ -d "$OPENVIBE_ROOT/.git" ]] || die "$OPENVIBE_ROOT is not a git repo"
    su - "$SERVICE_USER" -c "cd $OPENVIBE_ROOT && git pull --ff-only" \
      && ok "git pull done" \
      || die "git pull failed — resolve merge conflicts manually first"
  fi

  # ── 2. npm install ───────────────────────────────────────────────────────────
  if [[ "$OPT_INSTALL" -eq 1 ]]; then
    log "Running npm install..."
    NODE_BIN=$(find "/home/${SERVICE_USER}/.local/share/fnm/node-versions" \
                  -name node -type f -perm /111 2>/dev/null | sort -V | tail -1 || true)
    [[ -z "$NODE_BIN" ]] && \
      NODE_BIN=$(su - "$SERVICE_USER" -c 'command -v node 2>/dev/null' 2>/dev/null || true)
    [[ -x "$NODE_BIN" ]] || die "Cannot find node binary for $SERVICE_USER"
    NPM_BIN="$(dirname "$NODE_BIN")/npm"
    su - "$SERVICE_USER" -c "cd $OPENVIBE_ROOT && $NPM_BIN install --silent" \
      && ok "npm install done" \
      || die "npm install failed"
  fi

  # ── 3. Nginx config test + reload ────────────────────────────────────────────
  log "Checking nginx..."
  if nginx -t 2>/dev/null; then
    systemctl reload nginx && ok "nginx reloaded" || warn "nginx reload failed"
  else
    warn "nginx config invalid — skipping reload (check: nginx -t)"
  fi

  # ── 4. Restart services in parallel groups ──────────────────────────────────
  # Tier 1: event bus first
  # Tier 2: core platform in parallel
  # Tier 3: all product surfaces in parallel
  declare -a TIER1=(openvibe-events)
  declare -a TIER2=(openvibe-network openvibe-media openvibe-realtime openvibe-workers)
  declare -a TIER3=(openvibe-content openre-stream openvibe-live openvibe-chat
                    openvibe-community openvibe-billing openvibe-ai openvibe-games
                    openvibe-tips openvibe-tools openvibe-api openvibe-control)

  FAILED=()
  restart_group() {
    local label="$1"; shift; local grp=("$@"); local pids=(); local names=()
    log "Restarting: $label (${#grp[@]} in parallel)..."
    for svc in "${grp[@]}"; do
      if ! systemctl is-enabled "$svc" &>/dev/null; then
        warn "SKIP $svc (not installed — run: sudo bash scripts/deploy/install-services.sh)"
        continue
      fi
      systemctl restart "$svc" & pids+=("$!"); names+=("$svc")
    done
    local i=0
    for pid in "${pids[@]}"; do
      if wait "$pid"; then ok "${names[$i]}"; else warn "FAILED ${names[$i]}"; FAILED+=("${names[$i]}"); fi
      i=$((i+1))
    done
  }

  restart_group "tier-1 (events)"   "${TIER1[@]}"
  sleep 2
  restart_group "tier-2 (core)"     "${TIER2[@]}"
  sleep 2
  restart_group "tier-3 (surfaces)" "${TIER3[@]}"

  # ── 5. Status summary ────────────────────────────────────────────────────────
  echo
  log "Waiting 4s for services to settle..."
  sleep 4
  echo
  hr
  printf "  %-28s %s\n" "SERVICE" "STATUS"
  hr
  for svc in "${ALL_SERVICES[@]}"; do
    systemctl is-enabled "$svc" &>/dev/null || continue
    state=$(systemctl is-active "$svc" 2>/dev/null || echo "unknown")
    if [[ "$state" == "active" ]]; then
      printf "  %-28s ✓ running\n" "$svc"
    else
      printf "  %-28s ✗ %s\n" "$svc" "$state"
    fi
  done
  echo

  if [[ ${#FAILED[@]} -gt 0 ]]; then
    echo "Failed: ${FAILED[*]}"
    echo "Diagnose with:  journalctl -u <service> -n 50 --no-pager"
    exit 1
  fi

  log "Done."
  exit 0
fi

# ══════════════════════════════════════════════════════════════════════════════
#  DEVELOPMENT MODE
# ══════════════════════════════════════════════════════════════════════════════
[[ "$EUID" -eq 0 ]] && die "Don't run dev mode as root"

DEV_SCRIPT="$ROOT_DIR/scripts/dev/start-production-like-stack.sh"
STOP_SCRIPT="$ROOT_DIR/scripts/dev/stop-production-like-stack.sh"
PID_FILE="$ROOT_DIR/.stack.pids"

echo
hr
echo "  OpenVibe — development mode  $(date '+%Y-%m-%d %H:%M:%S')"
hr
echo

# ── Stop ──────────────────────────────────────────────────────────────────────
if [[ "$OPT_STOP" -eq 1 ]]; then
  if [[ ! -f "$PID_FILE" ]]; then
    echo "Stack is not running (.stack.pids not found)"
    exit 0
  fi
  bash "$STOP_SCRIPT"
  exit 0
fi

# ── Install node_modules ──────────────────────────────────────────────────────
if [[ "$OPT_INSTALL" -eq 1 ]] || [[ ! -d "$ROOT_DIR/node_modules" ]]; then
  log "Installing node_modules..."
  npm install --prefix "$ROOT_DIR" \
    && ok "npm install done" \
    || die "npm install failed"
fi

# ── Stop any existing stack before starting fresh ─────────────────────────────
if [[ -f "$PID_FILE" ]]; then
  log "Stopping existing dev stack..."
  bash "$STOP_SCRIPT" 2>/dev/null || true
  sleep 1
fi

# ── Kill anything holding our ports (common after a crash) ───────────────────
PORTS=(4100 4200 4300 4400 4500 4600 4700 4800 4900 5000 5001 5100 5200 5300 5400 5500 5600 5700)
KILLED=0
for port in "${PORTS[@]}"; do
  pid=$(ss -ltnp 2>/dev/null | awk -v p=":$port " '$4 ~ p {match($6,/pid=([0-9]+)/,a); print a[1]}' | head -1 || true)
  if [[ -n "$pid" && "$pid" -gt 0 ]]; then
    kill "$pid" 2>/dev/null || true
    KILLED=$((KILLED + 1))
  fi
done
[[ "$KILLED" -gt 0 ]] && log "Cleared $KILLED stale process(es) on service ports"

# ── Load .env ─────────────────────────────────────────────────────────────────
if [[ -f "$ROOT_DIR/.env" ]]; then
  set -a; source "$ROOT_DIR/.env"; set +a
  ok "loaded .env"
fi

# ── Check infra ───────────────────────────────────────────────────────────────
DB_URL="${OPENVIBE_DATABASE_URL:-postgresql://openvibe:openvibe@localhost:5432/openvibe}"
REDIS_URL="${OPENVIBE_REDIS_URL:-redis://localhost:6379/0}"

log "Checking Postgres..."
if ! node -e "
  const {Client}=require('pg');
  const c=new Client({connectionString:'$DB_URL'});
  c.connect().then(()=>{c.end();process.exit(0)}).catch(()=>process.exit(1));
" 2>/dev/null; then
  echo
  echo "  Postgres is not reachable at: $DB_URL"
  echo "  Start it:  sudo systemctl start postgresql"
  echo "             brew services start postgresql@16"
  echo
  exit 1
fi
ok "Postgres reachable"

log "Checking Redis..."
if ! node -e "
  const net=require('net');
  const u=new URL('$REDIS_URL');
  const s=net.createConnection(parseInt(u.port)||6379,u.hostname,()=>{s.destroy();process.exit(0)});
  s.on('error',()=>process.exit(1));
" 2>/dev/null; then
  echo
  echo "  Redis is not reachable at: $REDIS_URL"
  echo "  Start it:  sudo systemctl start redis"
  echo "             brew services start redis"
  echo
  exit 1
fi
ok "Redis reachable"

# ── Start ─────────────────────────────────────────────────────────────────────
echo
log "Starting all services..."
bash "$DEV_SCRIPT"

echo
log "Stack is up. Useful commands:"
echo "  Logs:       tail -f data/logs/stack/<service>.log"
echo "  All logs:   tail -f data/logs/stack/*.log"
echo "  Stop:       bash start.sh --stop"
