# Nashr

UAE media-booking marketplace. Spec: [SPEC.md](SPEC.md) · Plan: [tasks/plan.md](tasks/plan.md) · Tasks: [tasks/todo.md](tasks/todo.md) · Prototype (reference only): `index.html`.

## Develop

Needs Node 22 and PostgreSQL 16 with a role that can create databases (default `postgres://nashr:nashr@localhost:5432`).

```bash
npm ci
npm test           # builds a fresh nashr_test database each run
npm run typecheck
npm start          # API on :3000 + background jobs (fake payment provider outside production)
npm run seed       # demo data (refuses to run in production); buyer demo@northwind.ae / seller sales@skyline.ae, password nashr-demo-2026
npm run dev:web    # web app on :5173, proxies /api to :3000
npm run e2e        # buyer, seller and admin journeys in a real browser (re-seed and restart the API first)
```

Staff accounts (ops@nashr.ae, omar@nashr.ae) need an authenticator code; the seed prints the development key to add to an authenticator app.
Set `DATABASE_URL` for `start`, `seed` and `e2e` (e.g. `postgres://nashr:nashr@localhost:5432/nashr`). Uploaded files go to `FILES_DIR` (default `.files/`, git-ignored).
Set `TEST_DATABASE_URL` to use another test database. `npm run db:migrate` applies migrations to `DATABASE_URL`.

## Layout

```
server/core/          db, money, settings (with history), audit log, market calendar
server/catalog/       placements and slot generation
server/marketplace/   bidding, buy-now, quick sale, booking state machine, sweeper (all timers)
server/payments/      provider interface (+ fake), ledger, charge, release, refunds, cancellations, disputes, webhooks
server/fulfilment/    booking brief, creative, proof checklist, report an issue, pre-run check
server/files/         file storage interface (local disk in development)
server/auth/          access requests, invites, passwords, TOTP 2FA, sessions
server/api/           HTTP routes per role, response shapes, permission checks
server/documents/     receipts, publisher invoices (generated or uploaded), commission invoices, credit notes, payout statement
server/migrations/    SQL migrations
web/src/              React app. Buyer: calendar, bid drawer, directory, campaigns, bookings, documents. Seller (web/src/seller): dashboard,
                      calendar, inbox, deals, earnings, listings, profile. Admin (web/src/admin): overview, access, accounts, deals,
                      disputes, funds, payouts, directory, reports, audit, settings. Shared: bell, sign in, request access, invite
e2e/                  browser checks of whole journeys
```

## Demo server

`scripts/deploy-vps.sh` sets up the demo on one Ubuntu or Debian VPS: PostgreSQL 16, Node 22 and the API under systemd. On a Plesk server it adds the site, the /api proxy and the Let's Encrypt certificate through Plesk; otherwise it installs nginx and certbot. Run it as root; run it again to update.

```bash
curl -fsSL https://raw.githubusercontent.com/samirnawam-dotcom/nashr/claude/zealous-wright-qlxrhi/scripts/deploy-vps.sh -o /root/deploy-nashr.sh
DOMAIN=nashr.restbits.online bash /root/deploy-nashr.sh
```

It uses the fake payment provider (no real money) until Stripe is connected. On first run it loads the demo data and replaces the published demo password and staff key with new ones, printed once and kept in `/var/lib/nashr/demo-credentials.txt`.

To give the four demo accounts one password you choose (staff still need their authenticator code; real accounts are not touched):

```bash
read -rsp "Demo password (12+ characters): " P; echo; cd /opt/nashr && runuser -u nashr -- env $(xargs < /etc/nashr.env) DEMO_PASSWORD="$P" node_modules/.bin/tsx scripts/demo-credentials.ts; unset P
```

To give someone their own staff account (for example the owner, as founder), run on the server:

```bash
cd /opt/nashr && runuser -u nashr -- env $(xargs < /etc/nashr.env) node_modules/.bin/tsx scripts/invite-staff.ts owner@example.com "Full Name" founder
```

It prints a one-time invite link (valid 7 days). They open it, choose their own password and link their own authenticator app.

## Email

Every email goes through an outbox (Admin → Emails). Until SMTP is set up, emails are kept there unsent and Nashr's team hands out reset links and invites; once it is set up, they are sent within a minute and retried if the mail server refuses (after 1, 5, 30, 120 and 480 minutes). Add these lines to `/etc/nashr.env` on the server, then run the deploy command again:

```
SMTP_HOST=mail.your-domain.com
SMTP_PORT=587
SMTP_USER=noreply@your-domain.com
SMTP_PASS=the mailbox password
SMTP_FROM=Nashr <noreply@your-domain.com>
```

Port 587 upgrades to TLS (STARTTLS); use 465 for TLS from the start. Then use "Send a test email" on Admin → Emails. People get emails in the language they use Nashr in; payments, bookings to act on, deadlines, disputes and account security always go, and bids, saved-search alerts and messages follow each person's choices.

## Search (SEO)

- Real addresses (`/calendar`, `/directory/gulf-news`, `/terms`); old `#/` links redirect. Outlet pages use readable slugs.
- `web/src/seo.ts` sets each page's title, description, canonical address, Open Graph / X tags and JSON-LD (Organization, WebSite, FAQPage, BreadcrumbList, ItemList). Signed-in screens are `noindex`.
- `npm run build:web` also pre-renders the landing, legal and request-access pages to HTML (`scripts/prerender.ts`) and writes `robots.txt`; set `VITE_SITE_URL` to the site's address (the deploy script does).
- `/sitemap.xml` is served live by the API (every outlet included); nginx proxies it.
