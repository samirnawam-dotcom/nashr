#!/usr/bin/env bash
# Restore drill (launch checklist F2): back up, restore into a brand-new database, prove the copy matches.
# Usage: DATABASE_URL=postgres://.../nashr scripts/restore-drill.sh   (needs a role that can create databases)
set -euo pipefail
: "${DATABASE_URL:?Set DATABASE_URL}"
started=$(date +%s)
file=$(scripts/backup.sh "${BACKUP_DIR:-backups}")
sha256sum --check --quiet "$file.sha256"
target="nashr_restore_$(date -u +%Y%m%d%H%M%S)"
restore_url="${DATABASE_URL%/*}/$target"
psql "$DATABASE_URL" -q -c "create database $target"
pg_restore --no-owner --no-privileges --exit-on-error --dbname="$restore_url" "$file"
SOURCE_URL="$DATABASE_URL" RESTORE_URL="$restore_url" npx tsx scripts/verify-restore.ts
echo "Restore drill passed in $(( $(date +%s) - started ))s: $file -> $target"
[ "${KEEP_RESTORE:-0}" = 1 ] || psql "$DATABASE_URL" -q -c "drop database $target"
