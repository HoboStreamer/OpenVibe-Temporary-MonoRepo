#!/bin/bash
# Generates and installs systemd units for all openvibe-* services.
# Sources environment from /opt/openvibe/.env (single source of truth) and
# overrides PORT per-service so they can co-exist on one host.
set -euo pipefail

ROOT=/opt/openvibe
USER_NAME=ubuntu
GROUP_NAME=ubuntu
NODE_BIN=/home/ubuntu/.nvm/versions/node/v20.20.1/bin/node
ENV_FILE="$ROOT/.env"

# service-name port  description
SERVICES=(
  "openvibe-events|4400|OpenVibe Events Bus"
  "openvibe-network|4100|OpenVibe Network — identity, registries, control plane"
  "openvibe-media|4500|OpenVibe Media — uploads, vods, clips, thumbnails"
  "openvibe-live|4600|OpenVibe Live — public streaming surface"
  "openre-stream|4700|OpenRE Stream — ingest + restream"
  "openvibe-chat|4800|OpenVibe Chat"
  "openvibe-community|4900|OpenVibe Community — pastes, comments"
  "openvibe-billing|5001|OpenVibe Billing — credits, tips, subscriptions"
  "openvibe-ai|5100|OpenVibe AI"
  "openvibe-games|5200|OpenVibe Games"
  "openvibe-workers|5300|OpenVibe Workers"
  "openvibe-realtime|5400|OpenVibe Realtime — websockets/socket.io"
  "openvibe-content|5500|OpenVibe Content — codes/blog/wiki/news/reviews/deals/coupons/trade"
)

UNIT_DIR=/etc/systemd/system
TMP=$(mktemp -d)

for entry in "${SERVICES[@]}"; do
  IFS='|' read -r name port desc <<<"$entry"
  unit="$TMP/${name}.service"
  cat >"$unit" <<UNIT
[Unit]
Description=${desc}
After=network.target postgresql.service redis-server.service
Wants=postgresql.service redis-server.service

[Service]
Type=simple
User=${USER_NAME}
Group=${GROUP_NAME}
WorkingDirectory=${ROOT}/services/${name}
EnvironmentFile=${ENV_FILE}
Environment=NODE_ENV=production
Environment=PORT=${port}
Environment=HOST=127.0.0.1
ExecStart=${NODE_BIN} ${ROOT}/services/${name}/server/index.js
Restart=on-failure
RestartSec=3
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${name}

NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=false
ReadWritePaths=${ROOT}/services/${name}/data ${ROOT}/data ${ROOT}/logs

[Install]
WantedBy=multi-user.target
UNIT
  sudo install -m 0644 "$unit" "$UNIT_DIR/${name}.service"
  echo "wrote $UNIT_DIR/${name}.service (port $port)"
done

sudo systemctl daemon-reload
echo "Reloaded systemd. Services NOT yet enabled or started."
