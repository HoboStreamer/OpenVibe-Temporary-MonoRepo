#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/deploy/compose/docker-compose.local.yml"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required to start the local production-like stack" >&2
  exit 1
fi

cd "$ROOT_DIR"

if [ ! -d "$ROOT_DIR/node_modules" ]; then
  echo "[stack:local:start] node_modules not found; running npm install first"
  npm install
else
  echo "[stack:local:start] using existing root node_modules"
fi

export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-openvibe-local}"

echo "[stack:local:start] starting compose stack from $COMPOSE_FILE"
docker compose -f "$COMPOSE_FILE" up -d --remove-orphans

echo "[stack:local:start] stack started; next run: npm run stack:local:wait"
