#!/usr/bin/env bash
# Logical backup of the Nashr database (custom format, compressed). Production also keeps the host's point-in-time
# recovery (RDS automated backups); this file is the copy we can restore anywhere. Usage: scripts/backup.sh [out-dir]
set -euo pipefail
: "${DATABASE_URL:?Set DATABASE_URL}"
out="${1:-backups}"; mkdir -p "$out"
file="$out/nashr-$(date -u +%Y%m%dT%H%M%SZ).dump"
pg_dump --format=custom --no-owner --no-privileges --file="$file" "$DATABASE_URL"
sha256sum "$file" > "$file.sha256"
echo "$file"
