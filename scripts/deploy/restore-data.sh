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

die() { echo "ERROR: $*" >&2; exit 1; }
log() { echo "[$(date -Iseconds)] $*"; }
step() { echo; echo "══════════════════════════════════════"; echo "  $*"; echo "══════════════════════════════════════"; }

[[ "$EUID" -eq 0 ]] || die "Must run as root (sudo)"

# ── Step 1: Copy .env ─────────────────────────────────────────────────────────
step "1. Environment file"

if [[ -f "$OPENVIBE_ROOT/.env" ]]; then
  log ".env already exists — skipping (delete it to force overwrite)"
else
  [[ -f "$OLD_ENV" ]] || die "Old .env not found at $OLD_ENV"
  cp "$OLD_ENV" "$OPENVIBE_ROOT/.env"
  chown "${SERVICE_USER}:${SERVICE_USER}" "$OPENVIBE_ROOT/.env"
  chmod 640 "$OPENVIBE_ROOT/.env"
  log "Copied .env from $OLD_ENV"
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

# Restore main dump
if [[ -f "$PG_DUMP" ]]; then
  log "Restoring production database from $PG_DUMP ..."
  PGPASSWORD="$PG_PASSWORD" pg_restore \
    -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DB" \
    --no-owner --no-privileges --if-exists --clean \
    "$PG_DUMP" 2>&1 | grep -v "^pg_restore:" || true
  log "Production database restored"
else
  log "WARN: Postgres dump not found at $PG_DUMP — skipping"
fi

# Restore staging dump
if [[ -f "$PG_DUMP_STAGING" ]]; then
  log "Restoring staging database from $PG_DUMP_STAGING ..."
  PGPASSWORD="$PG_PASSWORD" pg_restore \
    -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DB_STAGING" \
    --no-owner --no-privileges --if-exists --clean \
    "$PG_DUMP_STAGING" 2>&1 | grep -v "^pg_restore:" || true
  log "Staging database restored"
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

echo
log "Data restoration complete."
log "Next: run install-services.sh, then install-nginx.sh"
