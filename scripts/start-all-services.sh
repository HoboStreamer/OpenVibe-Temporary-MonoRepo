#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

LOG_DIR="$ROOT_DIR/logs"
LOG_FILE="$LOG_DIR/all-services.log"
mkdir -p "$LOG_DIR"
: > "$LOG_FILE"

SERVICES=(
  openvibe-events
  openvibe-network
  openvibe-media
  openre-stream
  openvibe-live
  openvibe-chat
  openvibe-community
  openvibe-billing
  openvibe-ai
  openvibe-games
)

PIDS=()

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

for SERVICE in "${SERVICES[@]}"; do
  SERVICE_DIR="$ROOT_DIR/services/$SERVICE"
  if [ ! -d "$SERVICE_DIR" ]; then
    echo "Warning: service directory not found: $SERVICE_DIR"
    continue
  fi

  ( 
    cd "$SERVICE_DIR"
    printf "\n=== STARTING %s ===\n" "$SERVICE" | tee -a "$LOG_FILE"
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
