#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/deploy/compose/docker-compose.local.yml"
LEGACY_PROJECT_NAME="compose"

resolve_docker_cmd() {
  if docker info >/dev/null 2>&1; then
    echo "docker"
    return 0
  fi
  if sudo -n docker info >/dev/null 2>&1; then
    echo "sudo -n docker"
    return 0
  fi
  return 1
}

compose_for_project() {
  local project_name="$1"
  shift
  COMPOSE_PROJECT_NAME="$project_name" $DOCKER_CMD compose -f "$COMPOSE_FILE" "$@"
}

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required to start the local production-like stack" >&2
  exit 1
fi

if ! DOCKER_CMD="$(resolve_docker_cmd)"; then
  echo "docker is installed but this shell cannot access the daemon; ensure docker group access or passwordless sudo for docker" >&2
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

if [[ "$COMPOSE_PROJECT_NAME" != "$LEGACY_PROJECT_NAME" ]]; then
  echo "[stack:local:start] cleaning legacy compose project '$LEGACY_PROJECT_NAME' to avoid port conflicts"
  compose_for_project "$LEGACY_PROJECT_NAME" down --remove-orphans >/dev/null 2>&1 || true
fi

echo "[stack:local:start] starting compose stack from $COMPOSE_FILE"
compose_for_project "$COMPOSE_PROJECT_NAME" up -d --remove-orphans

echo "[stack:local:start] stack started; next run: npm run stack:local:wait"
