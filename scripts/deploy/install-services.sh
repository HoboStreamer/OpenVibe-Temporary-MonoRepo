#!/usr/bin/env bash
# install-services.sh — Generate and install systemd service units for all
# OpenVibe services on this Raspberry Pi.
#
# - Detects the Node.js binary from fnm for user jackewl
# - Creates /etc/systemd/system/openvibe-<svc>.service for each service
# - Reloads systemd and enables all units (does not start them)
#
# Usage: sudo bash scripts/deploy/install-services.sh
#
# To start all services after installing:
#   sudo systemctl start openvibe-network openvibe-events openvibe-media ...

set -euo pipefail

OPENVIBE_ROOT="/opt/openvibe"
SERVICE_USER="jackewl"
SERVICE_GROUP="jackewl"
ENV_FILE="$OPENVIBE_ROOT/.env"

die() { echo "ERROR: $*" >&2; exit 1; }
log() { echo "[$(date -Iseconds)] $*"; }

[[ "$EUID" -eq 0 ]] || die "Must run as root (sudo)"
[[ -f "$ENV_FILE" ]] || die ".env not found at $ENV_FILE — copy it first (see restore-data.sh)"

# ── Detect Node binary ────────────────────────────────────────────────────────
log "Detecting Node.js binary for $SERVICE_USER..."

NODE_BIN=$(find "/home/${SERVICE_USER}/.local/share/fnm/node-versions" \
              -name node -type f -perm /111 2>/dev/null \
           | sort -V | tail -1 || true)

if [[ -z "$NODE_BIN" ]]; then
  # Fallback: ask the user's login shell
  NODE_BIN=$(su - "$SERVICE_USER" -c 'command -v node 2>/dev/null' 2>/dev/null || true)
fi

if [[ -z "$NODE_BIN" || ! -x "$NODE_BIN" ]]; then
  die "Could not find node binary for $SERVICE_USER. Install Node 20 via fnm first."
fi

log "Using Node: $NODE_BIN ($(${NODE_BIN} --version))"

# ── Service definitions: name | port ─────────────────────────────────────────
declare -A SERVICES=(
  [openvibe-network]=4100
  [openvibe-api]=4200
  [openvibe-control]=4300
  [openvibe-events]=4400
  [openvibe-media]=4500
  [openvibe-live]=4600
  [openre-stream]=4700
  [openvibe-chat]=4800
  [openvibe-community]=4900
  [openvibe-billing]=5001
  [openvibe-ai]=5100
  [openvibe-games]=5200
  [openvibe-workers]=5300
  [openvibe-realtime]=5400
  [openvibe-content]=5500
  [openvibe-tips]=5600
  [openvibe-tools]=5700
)

declare -A DESCRIPTIONS=(
  [openvibe-network]="OpenVibe Network — identity, registries, control plane"
  [openvibe-api]="OpenVibe API — public API gateway"
  [openvibe-control]="OpenVibe Control — control plane helper"
  [openvibe-events]="OpenVibe Events — event bus"
  [openvibe-media]="OpenVibe Media — media storage and transcoding"
  [openvibe-live]="OpenVibe Live — public streaming surface"
  [openre-stream]="OpenRe Stream — HoboStreamer native bridge"
  [openvibe-chat]="OpenVibe Chat — real-time chat"
  [openvibe-community]="OpenVibe Community — communities and feeds"
  [openvibe-billing]="OpenVibe Billing — subscriptions and payments"
  [openvibe-ai]="OpenVibe AI — AI features gateway"
  [openvibe-games]="OpenVibe Games — SourceVibe game platform"
  [openvibe-workers]="OpenVibe Workers — background job processor"
  [openvibe-realtime]="OpenVibe Realtime — Socket.IO real-time bridge"
  [openvibe-content]="OpenVibe Content — CMS and content surfaces"
  [openvibe-tips]="OpenVibe Tips — creator tipping and monetization"
  [openvibe-tools]="OpenVibe Tools — utility tools surface"
)

INSTALLED=0
SKIPPED=0

for svc in "${!SERVICES[@]}"; do
  port="${SERVICES[$svc]}"
  desc="${DESCRIPTIONS[$svc]:-OpenVibe $svc}"
  svc_dir="$OPENVIBE_ROOT/services/$svc"
  entry_point="$svc_dir/server/index.js"

  if [[ ! -f "$entry_point" ]]; then
    log "SKIP $svc — $entry_point not found"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  unit_file="/etc/systemd/system/${svc}.service"
  log "Installing $svc (port $port) → $unit_file"

  cat > "$unit_file" <<UNIT
[Unit]
Description=$desc
After=network.target postgresql.service redis-server.service
Wants=postgresql.service redis-server.service

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_GROUP
WorkingDirectory=$svc_dir
EnvironmentFile=$ENV_FILE
Environment=NODE_ENV=production
Environment=PORT=$port
Environment=HOST=127.0.0.1
ExecStart=$NODE_BIN $entry_point
Restart=on-failure
RestartSec=3
StandardOutput=journal
StandardError=journal
SyslogIdentifier=$svc

NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=false
ReadWritePaths=$svc_dir/data $OPENVIBE_ROOT/data $OPENVIBE_ROOT/logs

[Install]
WantedBy=multi-user.target
UNIT

  chmod 644 "$unit_file"
  INSTALLED=$((INSTALLED + 1))
done

# ── Ensure data/logs dirs exist ───────────────────────────────────────────────
mkdir -p "$OPENVIBE_ROOT/data" "$OPENVIBE_ROOT/logs"
chown "${SERVICE_USER}:${SERVICE_GROUP}" "$OPENVIBE_ROOT/data" "$OPENVIBE_ROOT/logs"

for svc in "${!SERVICES[@]}"; do
  svc_dir="$OPENVIBE_ROOT/services/$svc"
  if [[ -d "$svc_dir" ]]; then
    mkdir -p "$svc_dir/data"
    chown -R "${SERVICE_USER}:${SERVICE_GROUP}" "$svc_dir/data"
  fi
done

# ── Reload + enable ───────────────────────────────────────────────────────────
log "Reloading systemd..."
systemctl daemon-reload

log "Enabling $INSTALLED service(s)..."
for svc in "${!SERVICES[@]}"; do
  [[ -f "/etc/systemd/system/${svc}.service" ]] && systemctl enable "$svc" 2>/dev/null || true
done

echo
log "Installed: $INSTALLED service(s), skipped: $SKIPPED"
log "Start all services with:"
log "  sudo systemctl start openvibe-network openvibe-events openvibe-media \\"
log "    openvibe-live openre-stream openvibe-chat openvibe-community \\"
log "    openvibe-billing openvibe-ai openvibe-games openvibe-workers \\"
log "    openvibe-realtime openvibe-content openvibe-tips openvibe-tools \\"
log "    openvibe-api openvibe-control"
