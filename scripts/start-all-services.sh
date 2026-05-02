#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env"
  set +a
fi

LOG_DIR="$ROOT_DIR/logs"
LOG_FILE="$LOG_DIR/all-services.log"
mkdir -p "$LOG_DIR"
: > "$LOG_FILE"

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
)

SERVICE_PORTS=(
  4400
  4100
  4500
  5400
  5300
  5500
  4700
  4600
  4800
  4900
  5001
  5100
  5200
)

PIDS=()

read_port_from_env_file() {
  local file="$1"
  if [ ! -f "$file" ]; then
    return 1
  fi
  local line
  line=$(grep -E '^[[:space:]]*PORT[[:space:]]*=' "$file" | tail -n 1 || true)
  if [ -z "$line" ]; then
    return 1
  fi
  line=${line#*=}
  line=${line#\"}
  line=${line%\"}
  line=${line%%#*}
  line=${line//[[:space:]]/}
  if [[ "$line" =~ ^[0-9]+$ ]]; then
    echo "$line"
    return 0
  fi
  return 1
}

get_service_port() {
  local service_dir="$1"
  local port
  port=$(read_port_from_env_file "$service_dir/.env") || true
  if [ -n "$port" ]; then
    echo "$port"
    return 0
  fi
  return 1
}

is_port_in_use() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -ltn "sport = :$port" | grep -q LISTEN
    return $?
  fi
  if command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
    return $?
  fi
  python3 - <<'PY'
import socket
import sys
port = int(sys.argv[1])
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
try:
    s.bind(('0.0.0.0', port))
    s.close()
    sys.exit(1)
except OSError:
    sys.exit(0)
PY
  return $?
}

cleanup() {
  echo "\nStopping services..."
  for pid in "${PIDS[@]:-}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done
  wait
}
trap cleanup INT TERM EXIT

for i in "${!SERVICES[@]}"; do
  SERVICE="${SERVICES[$i]}"
  SERVICE_DIR="$ROOT_DIR/services/$SERVICE"
  if [ ! -d "$SERVICE_DIR" ]; then
    echo "Warning: service directory not found: $SERVICE_DIR" | tee -a "$LOG_FILE"
    continue
  fi

  PORT=$(get_service_port "$SERVICE_DIR" || true)
  if [ -z "$PORT" ]; then
    PORT="${SERVICE_PORTS[$i]}"
  fi

  if is_port_in_use "$PORT"; then
    printf "\n=== SKIPPING %s (port %s already in use) ===\n" "$SERVICE" "$PORT" | tee -a "$LOG_FILE"
    continue
  fi

  ( 
    cd "$SERVICE_DIR"
    printf "\n=== STARTING %s (port %s) ===\n" "$SERVICE" "$PORT" | tee -a "$LOG_FILE"
    export PORT="$PORT"
    stdbuf -oL -eL npm start 2>&1 | sed "s/^/[$SERVICE] /" | tee -a "$LOG_FILE"
  ) &

  PIDS+=("$!")
  sleep 0.2
done

if [ ${#PIDS[@]} -eq 0 ]; then
  echo "No services were started."
  exit 1
fi

wait
