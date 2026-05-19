#!/usr/bin/env bash
# restore-data.sh — Restore OpenVibe production data on this Raspberry Pi.
#
# Restores:
#   1. .env from old-files backup
#   2. PostgreSQL database from pg_restore dump
#   3. Per-service SQLite databases from SQL backups
#   4. RSA keypair (copies from old-files or generates new keys)
#
# Usage: sudo bash scripts/deploy/restore-data.sh
#
# Prerequisites: PostgreSQL must be installed and running.

set -euo pipefail

OPENVIBE_ROOT="/opt/openvibe"
OLD_FILES="/opt/old-files"
OLD_ENV="$OLD_FILES/openvibe/.env"
SERVICE_USER="jackewl"
PG_HOST="127.0.0.1"
PG_PORT="5432"
PG_USER="openvibe"
PG_DB="openvibe"
PG_DB_STAGING="openvibe_staging"
PG_DUMP="$OLD_FILES/tmp/pg-openvibe-20260517.dump"
PG_DUMP_STAGING="$OLD_FILES/tmp/pg-openvibe-staging-20260517.dump"
PG_CLUSTER_SQL="$OLD_FILES/tmp/postgres-full-backup-20260517.sql"

die() { echo "ERROR: $*" >&2; exit 1; }
log() { echo "[$(date -Iseconds)] $*"; }
step() { echo; echo "══════════════════════════════════════"; echo "  $*"; echo "══════════════════════════════════════"; }

[[ "$EUID" -eq 0 ]] || die "Must run as root (sudo)"

# ── Step 1: Copy .env ─────────────────────────────────────────────────────────
step "1. Environment file"

if [[ -f "$OPENVIBE_ROOT/.env" ]]; then
  log ".env already exists — skipping copy (delete it to force overwrite)"
else
  [[ -f "$OLD_ENV" ]] || die "Old .env not found at $OLD_ENV"
  cp "$OLD_ENV" "$OPENVIBE_ROOT/.env"
  chown "${SERVICE_USER}:${SERVICE_USER}" "$OPENVIBE_ROOT/.env"
  chmod 640 "$OPENVIBE_ROOT/.env"
  log "Copied .env from $OLD_ENV"
fi

# Fix INTERNAL_API_KEY placeholder (security requirement — must not go live with default)
if grep -q "^INTERNAL_API_KEY=replace-me-before-production" "$OPENVIBE_ROOT/.env" 2>/dev/null; then
  NEW_INTERNAL_KEY=$(openssl rand -hex 32)
  sed -i "s|^INTERNAL_API_KEY=replace-me-before-production$|INTERNAL_API_KEY=${NEW_INTERNAL_KEY}|" "$OPENVIBE_ROOT/.env"
  log "Generated new INTERNAL_API_KEY (was placeholder)"
fi

# Set MEDIASOUP_ANNOUNCED_IP to current public IP (required for WebRTC to work)
PUBLIC_IP=$(curl -sf --max-time 10 https://api.ipify.org 2>/dev/null \
          || curl -sf --max-time 10 https://checkip.amazonaws.com 2>/dev/null \
          | tr -d '[:space:]')
if [[ "$PUBLIC_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  if grep -q "^MEDIASOUP_ANNOUNCED_IP=" "$OPENVIBE_ROOT/.env"; then
    sed -i "s|^MEDIASOUP_ANNOUNCED_IP=.*|MEDIASOUP_ANNOUNCED_IP=${PUBLIC_IP}|" "$OPENVIBE_ROOT/.env"
  else
    echo "MEDIASOUP_ANNOUNCED_IP=${PUBLIC_IP}" >> "$OPENVIBE_ROOT/.env"
  fi
  log "Set MEDIASOUP_ANNOUNCED_IP=${PUBLIC_IP}"
else
  log "WARN: Could not determine public IP — set MEDIASOUP_ANNOUNCED_IP manually in .env"
fi

# ── Step 2: PostgreSQL ────────────────────────────────────────────────────────
step "2. PostgreSQL"

command -v psql >/dev/null 2>&1 || die "PostgreSQL not installed. Run: sudo apt install postgresql postgresql-contrib"
command -v pg_restore >/dev/null 2>&1 || die "pg_restore not found"

PG_PASSWORD=$(grep "^OPENVIBE_DB_PASSWORD=" "$OLD_FILES/openvibe/.env.local-secrets" 2>/dev/null \
              | cut -d= -f2- | tr -d '[:space:]' \
              || grep "postgres://" "$OPENVIBE_ROOT/.env" | head -1 | sed 's|.*://[^:]*:\([^@]*\)@.*|\1|')

# Create user and databases if they don't exist
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='${PG_USER}'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE USER ${PG_USER} WITH PASSWORD '${PG_PASSWORD}';"

sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='${PG_DB}'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE DATABASE ${PG_DB} OWNER ${PG_USER};"

sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='${PG_DB_STAGING}'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE DATABASE ${PG_DB_STAGING} OWNER ${PG_USER};"

log "PostgreSQL user and databases ready"

# Restore main dump (PG17 custom-format dump preferred; fall back to plain cluster SQL on PG15)
PG_BIN_VER=$(pg_restore --version 2>/dev/null | awk '{print $3}' | cut -d. -f1)
if [[ -f "$PG_DUMP" && "${PG_BIN_VER:-0}" -ge 17 ]]; then
  log "Restoring production database from $PG_DUMP ..."
  PGPASSWORD="$PG_PASSWORD" pg_restore \
    -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DB" \
    --no-owner --no-privileges --if-exists --clean \
    "$PG_DUMP" 2>&1 | grep -v "^pg_restore:" || true
  log "Production database restored"
  if [[ -f "$PG_DUMP_STAGING" ]]; then
    log "Restoring staging database from $PG_DUMP_STAGING ..."
    PGPASSWORD="$PG_PASSWORD" pg_restore \
      -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DB_STAGING" \
      --no-owner --no-privileges --if-exists --clean \
      "$PG_DUMP_STAGING" 2>&1 | grep -v "^pg_restore:" || true
    log "Staging database restored"
  fi
elif [[ -f "$PG_CLUSTER_SQL" ]]; then
  log "pg_restore is v${PG_BIN_VER:-?} (< 17); restoring from plain cluster dump $PG_CLUSTER_SQL ..."
  log "(this drops and recreates openvibe + openvibe_staging databases)"
  sudo -u postgres psql -c "DROP DATABASE IF EXISTS ${PG_DB};" -c "DROP DATABASE IF EXISTS ${PG_DB_STAGING};" >/dev/null
  sudo -u postgres psql -v ON_ERROR_STOP=0 -q -f "$PG_CLUSTER_SQL" 2>&1 \
    | grep -E "^psql:.*ERROR" | grep -v "transaction_timeout\|already exists" || true
  log "Cluster dump restored (transaction_timeout warnings are expected on PG<17 and safe to ignore)"
else
  log "WARN: No usable Postgres dump found — skipping restore"
fi

# ── Step 3: SQLite databases ──────────────────────────────────────────────────
step "3. SQLite databases"

command -v sqlite3 >/dev/null 2>&1 || { log "sqlite3 not found, installing..."; apt-get install -y sqlite3; }

declare -A SQLITE_MAP=(
  [openvibe-network]="backup-_opt_openvibe_services_openvibe-network_data_openvibe-network.db.sql"
  [openvibe-live]="backup-_opt_openvibe_services_openvibe-live_data_openvibe-live.db.sql"
  [openvibe-chat]="backup-_opt_openvibe_services_openvibe-chat_data_openvibe-chat.db.sql"
  [openvibe-community]="backup-_opt_openvibe_services_openvibe-community_data_openvibe-community.db.sql"
  [openvibe-billing]="backup-_opt_openvibe_services_openvibe-billing_data_openvibe-billing.db.sql"
  [openvibe-games]="backup-_opt_openvibe_services_openvibe-games_data_openvibe-games.db.sql"
  [openvibe-media]="backup-_opt_openvibe_services_openvibe-media_data_openvibe-media.db.sql"
  [openre-stream]="backup-_opt_openvibe_services_openre-stream_data_openre-stream.db.sql"
)

for svc in "${!SQLITE_MAP[@]}"; do
  backup_file="$OLD_FILES/tmp/${SQLITE_MAP[$svc]}"
  svc_dir="$OPENVIBE_ROOT/services/$svc"
  db_file="$svc_dir/data/${svc}.db"

  if [[ ! -f "$backup_file" ]]; then
    log "SKIP $svc — backup not found: $backup_file"
    continue
  fi

  if [[ ! -d "$svc_dir" ]]; then
    log "SKIP $svc — service dir not found: $svc_dir"
    continue
  fi

  mkdir -p "$svc_dir/data"

  if [[ -f "$db_file" ]]; then
    log "SKIP $svc — $db_file already exists (delete to force restore)"
    continue
  fi

  log "Restoring $svc SQLite database..."
  sqlite3 "$db_file" < "$backup_file"
  chown -R "${SERVICE_USER}:${SERVICE_USER}" "$svc_dir/data"
  log "  OK: $db_file"
done

# ── Step 4: RSA keypair ───────────────────────────────────────────────────────
step "4. RSA keypair"

KEY_DIR="$OPENVIBE_ROOT/services/openvibe-network/data/keys"
PRIVATE_KEY="$KEY_DIR/openvibe-private.pem"
PUBLIC_KEY="$KEY_DIR/openvibe-public.pem"

mkdir -p "$KEY_DIR"

if [[ -f "$PRIVATE_KEY" && -f "$PUBLIC_KEY" ]]; then
  log "Keys already exist at $KEY_DIR — skipping"
else
  # Try to find keys in the letsencrypt backup (they're not there, but check openvibe data)
  OLD_KEY_DIR="$OLD_FILES/openvibe/services/openvibe-network/data/keys"
  if [[ -f "$OLD_KEY_DIR/openvibe-private.pem" ]]; then
    log "Copying RSA keys from old server backup..."
    cp "$OLD_KEY_DIR/openvibe-private.pem" "$PRIVATE_KEY"
    cp "$OLD_KEY_DIR/openvibe-public.pem"  "$PUBLIC_KEY"
    log "Keys copied from $OLD_KEY_DIR"
  else
    log "Old keys not found — generating new RSA-2048 keypair..."
    openssl genrsa -out "$PRIVATE_KEY" 2048
    openssl rsa -in "$PRIVATE_KEY" -pubout -out "$PUBLIC_KEY"
    log "New RSA keypair generated at $KEY_DIR"
    log "IMPORTANT: All existing JWT tokens from the old server will be invalid."
    log "Users will need to re-authenticate after deployment."
  fi
fi

chmod 600 "$PRIVATE_KEY"
chmod 644 "$PUBLIC_KEY"
chown -R "${SERVICE_USER}:${SERVICE_USER}" "$KEY_DIR"

# ── Step 5: Create required directories ───────────────────────────────────────
step "5. Directory structure"

MEDIA_SVC="$OPENVIBE_ROOT/services/openvibe-media"
mkdir -p \
  "$MEDIA_SVC/data/storage/hot" \
  "$MEDIA_SVC/data/storage/multipart" \
  "$OPENVIBE_ROOT/data" \
  "$OPENVIBE_ROOT/logs"

chown -R "${SERVICE_USER}:${SERVICE_USER}" "$OPENVIBE_ROOT/data" "$OPENVIBE_ROOT/logs"
[[ -d "$MEDIA_SVC" ]] && chown -R "${SERVICE_USER}:${SERVICE_USER}" "$MEDIA_SVC/data"

log "Directory structure ready"

# ── Step 6: Legacy Hobo SQLite databases ──────────────────────────────────────
step "6. Legacy Hobo SQLite databases"

declare -A LEGACY_DB_MAP=(
  ["hobostreamer"]="backup-_opt_hobostreamer_data_hobostreamer.db.sql|/opt/hobostreamer/data/hobostreamer.db"
  ["hobo-tools"]="backup-_opt_hobo_hobo-tools_data_hobo-tools.db.sql|/opt/hobo/hobo-tools/data/hobo-tools.db"
  ["hobo-quest"]="backup-_opt_hobo_hobo-quest_data_hobo-quest.db.sql|/opt/hobo/hobo-quest/data/hobo-quest.db"
)

for svc in "${!LEGACY_DB_MAP[@]}"; do
  IFS='|' read -r backup_fname db_path <<< "${LEGACY_DB_MAP[$svc]}"
  backup_file="$OLD_FILES/tmp/${backup_fname}"

  if [[ ! -f "$backup_file" ]]; then
    log "SKIP $svc — backup not found: $backup_file"
    continue
  fi

  if [[ -f "$db_path" ]]; then
    log "SKIP $svc — $db_path already exists"
    continue
  fi

  mkdir -p "$(dirname "$db_path")"
  log "Restoring $svc legacy database..."
  sqlite3 "$db_path" < "$backup_file"
  log "  OK: $db_path"
done

# ── Step 7: Legacy .env files ─────────────────────────────────────────────────
step "7. Legacy service .env files"

ENV_TAR="$OLD_FILES/tmp/env-files.tar.gz"
if [[ -f "$ENV_TAR" ]]; then
  TMP_ENV=$(mktemp -d)
  tar -xzf "$ENV_TAR" -C "$TMP_ENV" 2>/dev/null || true

  # Find and copy .env for each legacy service (tar may store as path or flat)
  for svc_path in /opt/hobostreamer /opt/hobo/hobo-tools /opt/hobo/hobo-quest \
                  /opt/hobo/hobo-audio /opt/hobo/hobo-img /opt/hobo/hobo-yt /opt/hobo/hobo-text; do
    svc_name=$(basename "$svc_path")
    # Look for the env file inside the tar extraction  
    env_candidate=$(find "$TMP_ENV" -name ".env" -path "*${svc_name}*" 2>/dev/null | head -1)
    if [[ -n "$env_candidate" && ! -f "${svc_path}/.env" ]]; then
      cp "$env_candidate" "${svc_path}/.env"
      log "  Copied .env for $svc_name"
    fi
  done
  rm -rf "$TMP_ENV"
else
  log "SKIP — env-files.tar.gz not found at $ENV_TAR"
fi

echo
log "Data restoration complete."
log "Next: run install-services.sh, then install-nginx.sh"
