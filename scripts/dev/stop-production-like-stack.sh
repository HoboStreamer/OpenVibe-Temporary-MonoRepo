#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/deploy/compose/docker-compose.local.yml"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required to stop the local production-like stack" >&2
  exit 1
fi

cd "$ROOT_DIR"
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-openvibe-local}"

echo "[stack:local:stop] stopping compose stack from $COMPOSE_FILE"
docker compose -f "$COMPOSE_FILE" down --remove-orphans "$@"
