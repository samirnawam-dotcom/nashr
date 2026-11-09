#!/usr/bin/env bash
# Deploys the Nashr demo to one Ubuntu/Debian VPS: PostgreSQL 16, Node 22 and the API under systemd.
# - On a Plesk server, the site, nginx and the Let's Encrypt certificate are set up through Plesk.
# - On a plain server, it installs nginx and certbot itself.
# Safe to run again: later runs pull the latest code, rebuild, migrate and restart, and keep the data.
#
#   curl -fsSL https://raw.githubusercontent.com/samirnawam-dotcom/nashr/claude/zealous-wright-qlxrhi/scripts/deploy-vps.sh -o /root/deploy-nashr.sh
#   DOMAIN=nashr.restbits.online bash /root/deploy-nashr.sh
#
# Demo mode: the fake payment provider is used (no real money moves) until Stripe is connected (task B5).
set -euo pipefail

# Everything is inside main, so nothing (apt, needrestart) can eat the script when it is piped into bash.
main() {
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
export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a NEEDRESTART_SUSPEND=1
APT() { apt-get -y -qq -o Dpkg::Options::=--force-confold "$@" < /dev/null; }
PLESK=0; command -v plesk >/dev/null && PLESK=1

say "System packages"
APT update || true
APT install curl git rsync ca-certificates gnupg openssl postgresql-common >/dev/null
if [ "$PLESK" = 0 ]; then APT install nginx certbot python3-certbot-nginx >/dev/null; fi

say "PostgreSQL 16 (Nashr's own instance)"
if [ ! -x /usr/lib/postgresql/16/bin/postgres ]; then
  /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y < /dev/null >/dev/null
  APT install postgresql-16 >/dev/null
fi
# A dedicated cluster, so an existing PostgreSQL (Plesk's, or anyone's) and its passwords are never touched.
if ! pg_lsclusters -h | awk '$1 == "16" && $2 == "nashr"' | grep -q .; then
  pg_createcluster 16 nashr --start-conf=auto < /dev/null >/dev/null
fi
systemctl enable postgresql@16-nashr >/dev/null 2>&1 || true
systemctl start postgresql@16-nashr
PGPORT="$(pg_lsclusters -h | awk '$1 == "16" && $2 == "nashr" {print $3}')"
PSQL() { runuser -u postgres -- env -u PGHOST -u PGPASSWORD psql -h /var/run/postgresql -p "$PGPORT" "$@" < /dev/null; }
echo "PostgreSQL 16 cluster 'nashr' on port $PGPORT"

say "Node.js 22"
if ! node -v 2>/dev/null | grep -q '^v2[2-9]'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - < /dev/null >/dev/null
  APT install nodejs >/dev/null
fi
node -v

say "App user, folders and database"
id nashr >/dev/null 2>&1 || useradd --system --home "$DATA" --shell /usr/sbin/nologin nashr
mkdir -p "$DATA/files" && chown -R nashr:nashr "$DATA"
if [ ! -f "$ENVF" ]; then
  PORT=3300; while ss -ltn | grep -q ":$PORT "; do PORT=$((PORT + 1)); done
  DBPASS="$(openssl rand -hex 24)"
  cat > "$ENVF" <<EOF
DATABASE_URL=postgres://nashr:${DBPASS}@127.0.0.1:${PGPORT}/nashr
PORT=${PORT}
TRUST_PROXY=1
LOG_REQUESTS=1
FILES_DIR=${DATA}/files
EOF
  chmod 600 "$ENVF"
  PSQL -qc "create role nashr login password '${DBPASS}'" 2>/dev/null || PSQL -qc "alter role nashr password '${DBPASS}'"
fi
PORT="$(grep '^PORT=' "$ENVF" | cut -d= -f2)"
grep -q '^SITE_URL=' "$ENVF" || echo "SITE_URL=https://${DOMAIN}" >> "$ENVF"   # canonical address for the sitemap
# Nightly backups (kept 14 days) and a weekly restore drill; the app alerts staff if either fails or stops.
grep -q '^BACKUP_DIR=' "$ENVF" || printf 'BACKUP_DIR=/var/backups/nashr\nBACKUP_KEEP_DAYS=14\n' >> "$ENVF"
mkdir -p /var/backups/nashr && chown nashr:nashr /var/backups/nashr && chmod 700 /var/backups/nashr
PSQL -qc "alter role nashr createdb"   # the restore drill restores into a new database, then drops it
PSQL -tAc "select 1 from pg_database where datname='nashr'" | grep -q 1 || runuser -u postgres -- env -u PGHOST createdb -h /var/run/postgresql -p "$PGPORT" -O nashr nashr

say "Code ($BRANCH)"
git config --global --get-all safe.directory 2>/dev/null | grep -qx "$APP" || git config --global --add safe.directory "$APP"
if [ -d "$APP/.git" ]; then
  git -C "$APP" fetch -q origin "$BRANCH" && git -C "$APP" checkout -q -B "$BRANCH" "origin/$BRANCH"
else
  git clone -q --branch "$BRANCH" "$REPO" "$APP"
fi
chown -R nashr:nashr "$APP"
asapp() { runuser -u nashr -- env HOME="$DATA" $(grep -v '^#' "$ENVF" | xargs) "$@" < /dev/null; }

say "Install and build"
cd "$APP"
asapp npm ci --no-audit --no-fund --loglevel=error
asapp env VITE_SITE_URL="https://$DOMAIN" npm run -s build:web

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

say "Service (API on 127.0.0.1:$PORT)"
cat > /etc/systemd/system/nashr.service <<EOF
[Unit]
Description=Nashr API and background jobs
After=network.target postgresql@16-nashr.service
Requires=postgresql@16-nashr.service

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
for job in backup restore-drill; do
  cat > /etc/systemd/system/nashr-${job}.service <<EOF
[Unit]
Description=Nashr ${job}
After=postgresql@16-nashr.service

[Service]
Type=oneshot
User=nashr
WorkingDirectory=${APP}
EnvironmentFile=${ENVF}
Environment=PATH=/usr/lib/postgresql/16/bin:/usr/local/bin:/usr/bin:/bin
Environment=HOME=${DATA}
ExecStart=/usr/bin/bash ${APP}/scripts/${job}.sh
EOF
done
cat > /etc/systemd/system/nashr-backup.timer <<EOF
[Unit]
Description=Nightly Nashr backup

[Timer]
OnCalendar=*-*-* 03:10 Asia/Dubai
Persistent=true
RandomizedDelaySec=10m

[Install]
WantedBy=timers.target
EOF
cat > /etc/systemd/system/nashr-restore-drill.timer <<EOF
[Unit]
Description=Weekly Nashr restore drill

[Timer]
OnCalendar=Sun *-*-* 04:20 Asia/Dubai
Persistent=true

[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable nashr >/dev/null
systemctl restart nashr
systemctl enable --now nashr-backup.timer nashr-restore-drill.timer >/dev/null
# A first backup now, so the watch has one to count from.
[ -n "$(ls -A /var/backups/nashr 2>/dev/null)" ] || systemctl start nashr-backup.service || echo "First backup failed: journalctl -u nashr-backup"

PROXY="
  location ^~ /api/ {
    proxy_pass http://127.0.0.1:${PORT};
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_read_timeout 120s;
    proxy_request_buffering off;
    client_max_body_size 100m;
  }
  # The live sitemap (every outlet) comes from the app.
  location = /sitemap.xml {
    proxy_pass http://127.0.0.1:${PORT}/api/sitemap.xml;
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }"

if [ "$PLESK" = 1 ]; then plesk_site; else plain_site; fi

say "Health check"
for i in $(seq 1 30); do curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 && break; sleep 1; done
curl -sS "http://127.0.0.1:$PORT/api/health" || { echo "The API is not answering. Logs: journalctl -u nashr -n 50"; }
echo

echo
echo "Nashr is deployed: https://${DOMAIN}"
if [ "$FIRST_SEED" = 1 ]; then
  echo "Demo sign-ins: demo@northwind.ae (buyer), sales@skyline.ae (publisher), ops@nashr.ae / omar@nashr.ae (staff)"
  cat "$DATA/demo-credentials.txt"
  echo "(Saved in $DATA/demo-credentials.txt, readable by root only.)"
elif [ -f "$DATA/demo-credentials.txt" ]; then
  echo "Demo sign-in details: cat $DATA/demo-credentials.txt"
fi
echo "Backups: /var/backups/nashr (nightly, 14 days; set BACKUP_RSYNC in $ENVF to copy them off this server). Restore drill: weekly."
echo "Logs: journalctl -u nashr -f      Update later: run this same script again."
}

# Plesk owns nginx, the vhost and certificates: add the site through Plesk, copy the built web app
# into its document root, and add the /api proxy as additional nginx directives.
plesk_site() {
  say "Plesk site $DOMAIN"
  local PARENT="${DOMAIN#*.}" WWW="${DOMAIN}"
  if ! plesk bin site --info "$DOMAIN" >/dev/null 2>&1 && ! plesk bin domain --info "$DOMAIN" >/dev/null 2>&1; then
    plesk bin domain --info "$PARENT" >/dev/null 2>&1 || { echo "Plesk has no domain $PARENT. Add it in Plesk first, then run again."; exit 1; }
    plesk bin site --create "$DOMAIN" -webspace-name "$PARENT" -www-root "$WWW" < /dev/null
  fi
  local ROOT
  ROOT="$(plesk db -Ne "select h.www_root from hosting h join domains d on d.id = h.dom_id where d.name = '$DOMAIN'" 2>/dev/null | tail -1)"
  [ -n "$ROOT" ] && [ -d "$ROOT" ] || ROOT="/var/www/vhosts/$PARENT/$WWW"
  [ -d "$ROOT" ] || { echo "Could not find the document root of $DOMAIN in Plesk."; exit 1; }
  local OWNER; OWNER="$(stat -c %U "$ROOT")"
  rsync -a --delete --chown="$OWNER:psacln" "$APP/dist/web/" "$ROOT/"
  echo "Web app copied to $ROOT"

  # Plesk includes this per-site file in the site's nginx config (it is what "Additional nginx directives" writes).
  local CONF="/var/www/vhosts/system/$DOMAIN/conf/vhost_nginx.conf"
  [ -d "$(dirname "$CONF")" ] || { echo "Plesk has no config folder for $DOMAIN ($(dirname "$CONF"))."; exit 1; }
  # Real page addresses (/directory/gulf-news): a pre-rendered page if there is one, otherwise the app shell.
  printf '%s\n  location ~ ^/(?!api/|assets/|\\.well-known/)[^.]*$ { root "%s"; try_files $uri.html $uri/index.html /app.html; }\n' "$PROXY" "$ROOT" > "$CONF"
  plesk sbin httpdmng --reconfigure-domain "$DOMAIN" < /dev/null >/dev/null
  if ! nginx -t -q; then
    rm -f "$CONF"; plesk sbin httpdmng --reconfigure-domain "$DOMAIN" < /dev/null >/dev/null
    echo "nginx refused the /api settings, so they were removed and your other sites are unaffected. Paste the nginx -t output above."; exit 1
  fi
  systemctl reload nginx
  echo "nginx: /api is proxied to the API"

  # Skip Let's Encrypt when the site already serves a certificate for this name (for example a Cloudflare Origin one).
  local IP CRT; IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
  CRT="$(echo | openssl s_client -connect "${IP:-127.0.0.1}:443" -servername "$DOMAIN" 2>/dev/null | openssl x509 2>/dev/null || true)"
  if [ -n "$CRT" ] && echo "$CRT" | openssl x509 -noout -checkhost "$DOMAIN" | grep -q 'does match' && echo "$CRT" | openssl x509 -noout -checkend 2592000 >/dev/null; then
    echo "HTTPS: the site already has a valid certificate for $DOMAIN"
  elif [ ! -f "$DATA/.cert-plesk" ]; then
    say "HTTPS certificate (Plesk Let's Encrypt)"
    local M=(); [ -n "$EMAIL" ] && M=(-m "$EMAIL")
    plesk bin extension --exec letsencrypt cli.php -d "$DOMAIN" "${M[@]}" < /dev/null && touch "$DATA/.cert-plesk" \
      || echo "Certificate failed. Check the DNS A record for $DOMAIN, or issue it in Plesk: Websites & Domains > $DOMAIN > SSL/TLS Certificates."
  fi
  plesk bin site --update "$DOMAIN" -ssl-redirect true < /dev/null >/dev/null 2>&1 \
    || plesk bin domain --update "$DOMAIN" -ssl-redirect true < /dev/null >/dev/null 2>&1 || true
}

plain_site() {
  say "nginx"
  cat > /etc/nginx/sites-available/nashr <<EOF
server {
  listen 80;
  listen [::]:80;
  server_name ${DOMAIN};
  root ${APP}/dist/web;

  add_header X-Content-Type-Options nosniff always;
  add_header Referrer-Policy same-origin always;
  add_header Content-Security-Policy "default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; frame-ancestors 'none'" always;
${PROXY}
  location /assets/ { expires 1y; add_header Cache-Control "public, immutable"; try_files \$uri =404; }
  location / { try_files \$uri \$uri.html \$uri/index.html /app.html; }
}
EOF
  ln -sf /etc/nginx/sites-available/nashr /etc/nginx/sites-enabled/nashr
  nginx -t -q && systemctl reload nginx
  if command -v ufw >/dev/null && ufw status | grep -q 'Status: active'; then ufw allow 'Nginx Full' >/dev/null; fi

  say "HTTPS certificate for $DOMAIN"
  local HERE THERE
  HERE="$(curl -fsS4 https://api.ipify.org || true)"
  THERE="$(getent ahostsv4 "$DOMAIN" | awk 'NR==1{print $1}')"
  if [ -n "$HERE" ] && [ "$HERE" != "$THERE" ]; then
    echo "DNS for $DOMAIN points to '${THERE:-nothing}', but this server is $HERE."
    echo "Add an A record: $DOMAIN -> $HERE, wait a few minutes, then run this script again."
  elif [ ! -d "/etc/letsencrypt/live/$DOMAIN" ]; then
    local M; if [ -n "$EMAIL" ]; then M=(-m "$EMAIL"); else M=(--register-unsafely-without-email); fi
    certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --redirect "${M[@]}" < /dev/null || echo "Certificate failed; the site still answers on http. Fix and run again."
  else
    certbot install --nginx --cert-name "$DOMAIN" --non-interactive --redirect < /dev/null >/dev/null 2>&1 || echo "Run: certbot install --nginx --cert-name $DOMAIN"
  fi
}

main "$@"
