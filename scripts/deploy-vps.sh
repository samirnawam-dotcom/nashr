#!/usr/bin/env bash
# Deploys the Nashr demo to one Ubuntu/Debian VPS: PostgreSQL 16, Node 22, the API under systemd,
# nginx serving the web app and proxying /api, and a Let's Encrypt certificate.
# Safe to run again: later runs pull the latest code, rebuild, migrate and restart, and keep the data.
#
#   curl -fsSL https://raw.githubusercontent.com/samirnawam-dotcom/nashr/claude/zealous-wright-qlxrhi/scripts/deploy-vps.sh | DOMAIN=nashr.restbits.online bash
#
# Demo mode: the fake payment provider is used (no real money moves) until Stripe is connected (task B5).
set -euo pipefail

DOMAIN="${DOMAIN:-nashr.restbits.online}"
BRANCH="${BRANCH:-claude/zealous-wright-qlxrhi}"
REPO="${REPO:-https://github.com/samirnawam-dotcom/nashr.git}"
EMAIL="${EMAIL:-}"            # optional: certificate expiry notices from Let's Encrypt
APP=/opt/nashr
DATA=/var/lib/nashr
ENVF=/etc/nashr.env

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
[ "$(id -u)" = 0 ] || { echo "Run as root."; exit 1; }
command -v apt-get >/dev/null || { echo "This script needs Ubuntu or Debian (apt)."; exit 1; }
export DEBIAN_FRONTEND=noninteractive

say "System packages"
apt-get update -qq
apt-get install -y -qq curl git ca-certificates gnupg nginx certbot python3-certbot-nginx postgresql-common >/dev/null

say "PostgreSQL 16"
if ! command -v /usr/lib/postgresql/16/bin/postgres >/dev/null; then
  /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y >/dev/null
  apt-get install -y -qq postgresql-16 >/dev/null
fi
systemctl enable --now postgresql >/dev/null

say "Node.js 22"
if ! node -v 2>/dev/null | grep -q '^v2[2-9]'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
node -v

say "App user, folders and database"
id nashr >/dev/null 2>&1 || useradd --system --home "$APP" --shell /usr/sbin/nologin nashr
mkdir -p "$DATA/files" && chown -R nashr:nashr "$DATA"
if [ ! -f "$ENVF" ]; then
  DBPASS="$(openssl rand -hex 24)"
  cat > "$ENVF" <<EOF
DATABASE_URL=postgres://nashr:${DBPASS}@127.0.0.1:5432/nashr
PORT=3000
TRUST_PROXY=1
LOG_REQUESTS=1
FILES_DIR=${DATA}/files
EOF
  chmod 600 "$ENVF"
  runuser -u postgres -- psql -qc "create role nashr login password '${DBPASS}'" 2>/dev/null \
    || runuser -u postgres -- psql -qc "alter role nashr password '${DBPASS}'"
fi
runuser -u postgres -- psql -tAc "select 1 from pg_database where datname='nashr'" | grep -q 1 \
  || runuser -u postgres -- createdb -O nashr nashr

say "Code ($BRANCH)"
git config --global --get-all safe.directory | grep -qx "$APP" || git config --global --add safe.directory "$APP"
if [ -d "$APP/.git" ]; then
  git -C "$APP" fetch -q origin "$BRANCH" && git -C "$APP" checkout -q -B "$BRANCH" "origin/$BRANCH"
else
  git clone -q --branch "$BRANCH" "$REPO" "$APP"
fi
chown -R nashr:nashr "$APP"
asapp() { runuser -u nashr -- env HOME="$DATA" $(grep -v '^#' "$ENVF" | xargs) "$@"; }

say "Install and build"
cd "$APP"
asapp npm ci --no-audit --no-fund --loglevel=error
asapp npm run -s build:web

say "Database migrations"
asapp npx tsx server/core/migrate.ts

FIRST_SEED=0
if [ ! -f "$DATA/.seeded" ]; then
  say "Demo data (first run only)"
  asapp npm run -s seed > "$DATA/seed.log" 2>&1 || { cat "$DATA/seed.log"; exit 1; }
  rm -f "$DATA/seed.log"
  asapp npx tsx scripts/demo-credentials.ts > "$DATA/demo-credentials.txt"
  chmod 600 "$DATA/demo-credentials.txt"
  touch "$DATA/.seeded"; FIRST_SEED=1
fi

say "Service"
cat > /etc/systemd/system/nashr.service <<EOF
[Unit]
Description=Nashr API and background jobs
After=network.target postgresql.service
Requires=postgresql.service

[Service]
User=nashr
WorkingDirectory=${APP}
EnvironmentFile=${ENVF}
ExecStart=${APP}/node_modules/.bin/tsx server/main.ts
Restart=always
RestartSec=3
KillSignal=SIGTERM
TimeoutStopSec=30
NoNewPrivileges=true
ProtectSystem=full
ReadWritePaths=${DATA}

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable nashr >/dev/null
systemctl restart nashr

say "nginx"
cat > /etc/nginx/sites-available/nashr <<EOF
server {
  listen 80;
  listen [::]:80;
  server_name ${DOMAIN};
  root ${APP}/dist/web;
  client_max_body_size 100m;

  add_header X-Content-Type-Options nosniff always;
  add_header Referrer-Policy same-origin always;
  add_header Content-Security-Policy "default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; frame-ancestors 'none'" always;

  location /api/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_read_timeout 120s;
    proxy_request_buffering off;
  }
  location /assets/ { expires 1y; add_header Cache-Control "public, immutable"; try_files \$uri =404; }
  location / { try_files \$uri /index.html; }
}
EOF
ln -sf /etc/nginx/sites-available/nashr /etc/nginx/sites-enabled/nashr
nginx -t -q && systemctl reload nginx

if command -v ufw >/dev/null && ufw status | grep -q 'Status: active'; then ufw allow 'Nginx Full' >/dev/null; fi

say "HTTPS certificate for $DOMAIN"
HERE="$(curl -fsS4 https://api.ipify.org || true)"
THERE="$(getent ahostsv4 "$DOMAIN" | awk 'NR==1{print $1}')"
if [ -n "$HERE" ] && [ "$HERE" != "$THERE" ]; then
  echo "DNS for $DOMAIN points to '${THERE:-nothing}', but this server is $HERE."
  echo "Add an A record: $DOMAIN -> $HERE, wait a few minutes, then run this script again."
elif [ ! -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  if [ -n "$EMAIL" ]; then M=(-m "$EMAIL"); else M=(--register-unsafely-without-email); fi
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --redirect "${M[@]}" || echo "Certificate failed; the site still answers on http. Fix and run again."
else
  certbot install --nginx --cert-name "$DOMAIN" --non-interactive --redirect >/dev/null 2>&1 || echo "Could not reattach the certificate; run: certbot install --nginx --cert-name $DOMAIN"
fi

say "Health check"
for i in $(seq 1 20); do curl -fsS http://127.0.0.1:3000/api/health >/dev/null 2>&1 && break; sleep 1; done
curl -sS http://127.0.0.1:3000/api/health; echo
systemctl --no-pager --lines=0 status nashr | head -3

echo
echo "Nashr is deployed: https://${DOMAIN}"
if [ "$FIRST_SEED" = 1 ]; then
  echo "Demo sign-ins: demo@northwind.ae (buyer), sales@skyline.ae (publisher), ops@nashr.ae / omar@nashr.ae (staff)"
  cat "$DATA/demo-credentials.txt"
  echo "(Saved in $DATA/demo-credentials.txt, readable by root only.)"
fi
echo "Logs: journalctl -u nashr -f      Update later: run this same command again."
