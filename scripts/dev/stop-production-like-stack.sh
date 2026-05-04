#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
PID_FILE="$ROOT_DIR/.stack.pids"

if [ ! -f "$PID_FILE" ]; then
  echo "[stack:local:stop] no .stack.pids file found; stack does not appear to be running"
  exit 0
fi

echo "[stack:local:stop] stopping services..."

while IFS=' ' read -r name pid; do
  [ -z "$pid" ] && continue
  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null && echo "[stack:local:stop] stopped $name (pid=$pid)" || echo "[stack:local:stop] failed to stop $name (pid=$pid)"
  else
    echo "[stack:local:stop] $name (pid=$pid) was not running"
  fi
done < "$PID_FILE"

rm -f "$PID_FILE"
echo "[stack:local:stop] done"
