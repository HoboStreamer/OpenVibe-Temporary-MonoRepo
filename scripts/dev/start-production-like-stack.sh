#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
PID_FILE="$ROOT_DIR/.stack.pids"
LOG_DIR="$ROOT_DIR/data/logs/stack"

if [ -f "$PID_FILE" ]; then
  echo "[stack:local:start] .stack.pids exists — stack may already be running. Run 'npm run stack:local:stop' first." >&2
  exit 1
fi

mkdir -p "$LOG_DIR"

# Load .env for user secrets (API keys, storage creds, etc.)
if [ -f "$ROOT_DIR/.env" ]; then
  set -a; source "$ROOT_DIR/.env"; set +a
fi

if [ ! -d "$ROOT_DIR/node_modules" ]; then
  echo "[stack:local:start] node_modules not found; running npm install first"
  npm install --prefix "$ROOT_DIR"
fi

# Infra defaults — override in .env if your local Postgres/Redis differ
DB_URL="${OPENVIBE_DATABASE_URL:-postgresql://openvibe:openvibe@localhost:5432/openvibe}"
REDIS_URL="${OPENVIBE_REDIS_URL:-redis://localhost:6379/0}"

check_postgres() {
  if command -v pg_isready >/dev/null 2>&1; then
    pg_isready -h localhost -p "${PGPORT:-5432}" -U "${PGUSER:-openvibe}" -q 2>/dev/null
  else
    node -e "
      const {Client}=require('pg');
      const c=new Client({connectionString:process.env.DB_URL});
      c.connect().then(()=>{c.end();process.exit(0)}).catch(()=>process.exit(1));
    " DB_URL="$DB_URL" 2>/dev/null
  fi
}

check_redis() {
  if command -v redis-cli >/dev/null 2>&1; then
    redis-cli -u "$REDIS_URL" ping >/dev/null 2>&1
  else
    node -e "
      const net=require('net');
      const u=new URL(process.env.REDIS_URL);
      const s=net.createConnection(parseInt(u.port)||6379,u.hostname,()=>{s.destroy();process.exit(0)});
      s.on('error',()=>process.exit(1));
    " REDIS_URL="$REDIS_URL" 2>/dev/null
  fi
}

echo "[stack:local:start] checking Postgres..."
if ! check_postgres; then
  echo "[stack:local:start] ERROR: Postgres is not reachable at $DB_URL" >&2
  echo "[stack:local:start] Start it with: sudo systemctl start postgresql  (or brew services start postgresql)" >&2
  exit 1
fi
echo "[stack:local:start] Postgres OK"

echo "[stack:local:start] checking Redis..."
if ! check_redis; then
  echo "[stack:local:start] ERROR: Redis is not reachable at $REDIS_URL" >&2
  echo "[stack:local:start] Start it with: sudo systemctl start redis  (or brew services start redis)" >&2
  exit 1
fi
echo "[stack:local:start] Redis OK"

# start_service <name> <npm-workspace> [KEY=VALUE ...]
start_service() {
  local name="$1"
  local workspace="$2"
  shift 2
  local log_file="$LOG_DIR/$name.log"
  env HOST=0.0.0.0 "$@" \
    npm run start --workspace="$workspace" \
    > "$log_file" 2>&1 &
  local pid=$!
  echo "$name $pid" >> "$PID_FILE"
  echo "[stack:local:start] $name started (pid=$pid) → logs: data/logs/stack/$name.log"
}

# ── Group 1: event bus ────────────────────────────────────────────────────────
start_service events @openvibe/events \
  PORT=4400 \
  OPENVIBE_PERSISTENCE_MODE=postgres \
  OPENVIBE_DATABASE_URL="$DB_URL" \
  OPENVIBE_STAGING_DATABASE_URL="$DB_URL" \
  OPENVIBE_REDIS_URL="$REDIS_URL"

sleep 2

# ── Group 2: realtime ─────────────────────────────────────────────────────────
start_service realtime @openvibe/realtime-service \
  PORT=5400 \
  OPENVIBE_REDIS_URL="$REDIS_URL" \
  OPENVIBE_EVENTS_URL=http://localhost:4400

sleep 1

# ── Group 3: network (gateway) ────────────────────────────────────────────────
start_service network @openvibe/network \
  PORT=4100 \
  OPENVIBE_PERSISTENCE_MODE=postgres \
  OPENVIBE_DATABASE_URL="$DB_URL" \
  OPENVIBE_STAGING_DATABASE_URL="$DB_URL" \
  OPENVIBE_REDIS_URL="$REDIS_URL" \
  OPENVIBE_EVENTS_URL=http://localhost:4400 \
  OPENVIBE_WORKERS_INTERNAL_URL=http://localhost:5300 \
  OPENVIBE_REALTIME_INTERNAL_URL=http://localhost:5400 \
  OPENVIBE_MEDIA_INTERNAL_URL=http://localhost:4500 \
  OPENVIBE_LIVE_INTERNAL_URL=http://localhost:4600 \
  OPENRE_STREAM_INTERNAL_URL=http://localhost:4700 \
  OPENVIBE_CHAT_INTERNAL_URL=http://localhost:4800 \
  OPENVIBE_COMMUNITY_INTERNAL_URL=http://localhost:4900 \
  OPENVIBE_BILLING_INTERNAL_URL=http://localhost:5000 \
  OPENVIBE_AI_INTERNAL_URL=http://localhost:5100 \
  OPENVIBE_GAMES_INTERNAL_URL=http://localhost:5200

sleep 2

# ── Group 4: parallel services (all depend on postgres, redis, events) ─────────
start_service media @openvibe/media \
  PORT=4500 \
  OPENVIBE_PERSISTENCE_MODE=postgres \
  OPENVIBE_DATABASE_URL="$DB_URL" \
  OPENVIBE_STAGING_DATABASE_URL="$DB_URL" \
  OPENVIBE_REDIS_URL="$REDIS_URL" \
  OPENVIBE_EVENTS_URL=http://localhost:4400 \
  OPENVIBE_NETWORK_INTERNAL_URL=http://localhost:4100 \
  OPENVIBE_MEDIA_USE_WORKERS=true

start_service live @openvibe/live \
  PORT=4600 \
  OPENVIBE_PERSISTENCE_MODE=sqlite \
  DB_PATH="$ROOT_DIR/services/openvibe-live/data/openvibe-live.db" \
  OPENVIBE_DATABASE_URL="$DB_URL" \
  OPENVIBE_STAGING_DATABASE_URL="$DB_URL" \
  OPENVIBE_REDIS_URL="$REDIS_URL" \
  OPENVIBE_EVENTS_URL=http://localhost:4400 \
  OPENVIBE_MEDIA_URL=http://localhost:4500 \
  OPENVIBE_COMMUNITY_URL=https://openvibe.community \
  OPENVIBE_CHAT_URL=https://openvibe.chat \
  OPENRE_STREAM_URL=https://openre.stream \
  OPENVIBE_HOBOSTREAMER_ROOT=/opt/hobostreamer

start_service openre-stream @openre/stream \
  PORT=4700 \
  OPENVIBE_PERSISTENCE_MODE=postgres \
  OPENVIBE_DATABASE_URL="$DB_URL" \
  OPENVIBE_STAGING_DATABASE_URL="$DB_URL" \
  OPENVIBE_REDIS_URL="$REDIS_URL" \
  OPENVIBE_EVENTS_URL=http://localhost:4400 \
  DB_PATH="$ROOT_DIR/services/openre-stream/data/openre-stream.db" \
  OPENVIBE_MEDIA_URL=http://localhost:4500 \
  OPENVIBE_LIVE_URL=http://localhost:4600

start_service chat @openvibe/chat \
  PORT=4800 \
  OPENVIBE_PERSISTENCE_MODE=postgres \
  OPENVIBE_DATABASE_URL="$DB_URL" \
  OPENVIBE_STAGING_DATABASE_URL="$DB_URL" \
  OPENVIBE_REDIS_URL="$REDIS_URL" \
  OPENVIBE_EVENTS_URL=http://localhost:4400 \
  DB_PATH="$ROOT_DIR/services/openvibe-chat/data/openvibe-chat.db"

start_service community @openvibe/community \
  PORT=4900 \
  OPENVIBE_PERSISTENCE_MODE=postgres \
  OPENVIBE_DATABASE_URL="$DB_URL" \
  OPENVIBE_STAGING_DATABASE_URL="$DB_URL" \
  OPENVIBE_REDIS_URL="$REDIS_URL" \
  OPENVIBE_EVENTS_URL=http://localhost:4400 \
  DB_PATH="$ROOT_DIR/services/openvibe-community/data/openvibe-community.db" \
  OPENVIBE_MEDIA_URL=http://localhost:4500 \
  OPENVIBE_CHAT_URL=http://localhost:4800

start_service billing @openvibe/billing \
  PORT=5000 \
  OPENVIBE_PERSISTENCE_MODE=postgres \
  OPENVIBE_DATABASE_URL="$DB_URL" \
  OPENVIBE_STAGING_DATABASE_URL="$DB_URL" \
  OPENVIBE_REDIS_URL="$REDIS_URL" \
  OPENVIBE_EVENTS_URL=http://localhost:4400

start_service ai @openvibe/ai \
  PORT=5100 \
  OPENVIBE_PERSISTENCE_MODE=postgres \
  OPENVIBE_DATABASE_URL="$DB_URL" \
  OPENVIBE_STAGING_DATABASE_URL="$DB_URL" \
  OPENVIBE_REDIS_URL="$REDIS_URL" \
  OPENVIBE_EVENTS_URL=http://localhost:4400

start_service games @openvibe/games \
  PORT=5200 \
  OPENVIBE_PERSISTENCE_MODE=postgres \
  OPENVIBE_DATABASE_URL="$DB_URL" \
  OPENVIBE_STAGING_DATABASE_URL="$DB_URL" \
  OPENVIBE_REDIS_URL="$REDIS_URL" \
  OPENVIBE_EVENTS_URL=http://localhost:4400

start_service workers @openvibe/workers \
  PORT=5300 \
  OPENVIBE_PERSISTENCE_MODE=postgres \
  OPENVIBE_DATABASE_URL="$DB_URL" \
  OPENVIBE_STAGING_DATABASE_URL="$DB_URL" \
  OPENVIBE_REDIS_URL="$REDIS_URL" \
  OPENVIBE_EVENTS_URL=http://localhost:4400 \
  OPENVIBE_MEDIA_URL=http://localhost:4500 \
  OPENVIBE_AI_URL=http://localhost:5100 \
  OPENVIBE_BILLING_INTERNAL_URL=http://localhost:5000 \
  OPENVIBE_CONTENT_INTERNAL_URL=http://localhost:5500 \
  OPENVIBE_NETWORK_INTERNAL_URL=http://localhost:4100 \
  OPENVIBE_MIGRATION_BUNDLE_DIR="$ROOT_DIR/data/migrations/hobo-production-staging/openvibe-target" \
  OPENVIBE_WORKER_BACKEND_MODE=auto \
  OPENVIBE_WORKER_ENABLE_PROCESSORS=true

sleep 2

# ── Group 5: services depending on ai/network/realtime ────────────────────────
start_service content @openvibe/content \
  PORT=5500 \
  OPENVIBE_PERSISTENCE_MODE=postgres \
  OPENVIBE_DATABASE_URL="$DB_URL" \
  OPENVIBE_STAGING_DATABASE_URL="$DB_URL" \
  OPENVIBE_REDIS_URL="$REDIS_URL" \
  OPENVIBE_AI_URL=http://localhost:5100 \
  OPENVIBE_NETWORK_URL=http://localhost:4100 \
  OPENVIBE_REALTIME_URL=http://localhost:5400

start_service tips @openvibe/tips \
  PORT=5600 \
  OPENVIBE_PERSISTENCE_MODE=postgres \
  OPENVIBE_DATABASE_URL="$DB_URL" \
  OPENVIBE_STAGING_DATABASE_URL="$DB_URL" \
  OPENVIBE_REDIS_URL="$REDIS_URL" \
  OPENVIBE_EVENTS_URL=http://localhost:4400 \
  OPENVIBE_NETWORK_URL=http://localhost:4100

echo ""
echo "[stack:local:start] all services started. PIDs saved to .stack.pids"
echo "[stack:local:start] next: npm run stack:local:wait"
echo "[stack:local:start] logs: data/logs/stack/<service>.log"
echo "[stack:local:start] stop: npm run stack:local:stop"
