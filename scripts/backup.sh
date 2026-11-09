#!/usr/bin/env bash
# Logical backup of the Nashr database (custom format, compressed) with a SHA-256 checksum. On the server a nightly timer runs
# it (scripts/deploy-vps.sh) and keeps BACKUP_KEEP_DAYS of copies; BACKUP_RSYNC copies each one off the server.
# Each run is recorded in ops_runs, so staff are alerted when a backup fails or stops happening.
# Usage: scripts/backup.sh [out-dir]
set -euo pipefail
: "${DATABASE_URL:?Set DATABASE_URL}"
out="${1:-${BACKUP_DIR:-backups}}"; mkdir -p "$out"
file="$out/nashr-$(date -u +%Y%m%dT%H%M%SZ).dump"
record() { echo "insert into ops_runs (kind, ok, detail) values ('backup', :'ok', :'detail')" | psql "$DATABASE_URL" -qtA -v ok="$1" -v detail="$2" >/dev/null 2>&1 || true; }
trap 'record false "backup failed at line $LINENO"' ERR
pg_dump --format=custom --no-owner --no-privileges --file="$file" "$DATABASE_URL"
sha256sum "$file" > "$file.sha256"
if [ -n "${BACKUP_RSYNC:-}" ]; then rsync -a "$file" "$file.sha256" "$BACKUP_RSYNC/"; fi   # e.g. backup@other-host:/srv/nashr
if [ -n "${BACKUP_KEEP_DAYS:-}" ]; then find "$out" -name 'nashr-*.dump*' -mtime +"$BACKUP_KEEP_DAYS" -delete; fi
record true "$(basename "$file") $(du -h "$file" | cut -f1)"
echo "$file"
