#!/usr/bin/env bash
# Restore drill (see scripts/restore-drill.ts). Usage: DATABASE_URL=postgres://.../nashr scripts/restore-drill.sh
set -euo pipefail
: "${DATABASE_URL:?Set DATABASE_URL}"
cd "$(dirname "$0")/.."
exec npx tsx scripts/restore-drill.ts
