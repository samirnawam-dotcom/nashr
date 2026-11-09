# Nashr runbook

For whoever runs Nashr in production. Plain steps; each one says what to check and what to do.

## 1. What runs

- **API** (`npm start`): the web API, plus four jobs every minute, also once at startup:
  - **sweeper**: auction closes, deadlines, reminders, pre-run checks
  - **money**: refunds and payouts go out
  - **email**: the outbox is sent over SMTP, with retries
  - **watch**: staff alerts (section 2)
- **Timers on the server** (installed by `scripts/deploy-vps.sh`): `nashr-backup.timer` nightly at 03:10 Dubai time, `nashr-restore-drill.timer` Sundays at 04:20.
- **PostgreSQL 16**: the only place data lives. Uploaded files live in private storage (S3 in production; `FILES_DIR` locally).
- Deploys send `SIGTERM`. The API stops taking requests, lets running transactions finish, then exits.
- Every job is safe to run late or twice. A missed minute catches up on the next run.
- Running two API instances is safe for the jobs, which use row locks. It is not safe for the sign-in rate limiter, which counts per process: move it to Postgres before scaling out.

## 2. Monitoring

**Uptime check:** `GET /api/health` every minute from outside (for example AWS Route 53 health checks or UptimeRobot). It answers `200` when all is well and `503` when a person is needed. It never shows amounts or ids.

| Check | Red means | First thing to do |
|---|---|---|
| `database` | Postgres is unreachable | Check the RDS instance and its connection count; restart the API after the database is back |
| `sweeper` | No heartbeat for 5 minutes: deadlines are not being enforced | Look for `"job":"sweeper"` errors in the logs; restart the API |
| `moneyFlowing` | A payout or refund has been pending for 15 minutes | Look for `"job":"money"` errors; check the payment provider's status page |
| `noFailedPayouts` | A payout or refund failed | Admin → Payouts → Failed. Read the reason (often an unverified payout account), fix it, then Retry. The retry reuses the same key, so nothing is paid twice |
| `ledgerReconciles` | The ledger cash does not match the provider balance | **Stop and escalate to the founder.** Admin → Funds lists the latest movements. Compare them with the provider dashboard. Do not post corrections by hand |

**Logs:**
- Set `LOG_REQUESTS=1` (it is on by default in production).
- Each request is one JSON line: `t`, `method`, `path` (no query string), `status`, `ms`, `ip`.
- Job failures are JSON lines with `"job"`.
- Unexpected server errors are logged with their stack. The user only sees "Something went wrong".
- Bodies, cookies and query strings are never logged.

**Staff alerts (built in):** the watch job checks every minute. Each staff member gets a bell notice, an email and a phone alert once when a problem starts, and once when it clears. Open problems show at the top of the staff Overview.

| Alert | When |
|---|---|
| Timer job stopped | No sweeper heartbeat for 5 minutes |
| Money stuck / failed | A payout or refund pending 15 minutes, or failed |
| Ledger | Ledger cash and the provider balance disagree (checked every 10 minutes) |
| Email failing | An email failed in the last day, or emails have been retrying for 30 minutes (only when SMTP is set up) |
| Disputes late | A dispute is past Nashr's decision date |
| Error spike | 5 or more server errors (or failed jobs) in 10 minutes |
| Backup | The last backup failed, or none for 26 hours (only where `BACKUP_DIR` is set) |
| Restore drill | The last drill failed, or none passed for 8 days |

Also keep the outside uptime check: if the whole server is down, the watch is down with it.

## 3. Backups

- **Point-in-time recovery:** RDS automated backups, kept 35 days. This is the first choice for "undo the last hour".
- **Nightly logical backup:** `scripts/backup.sh`, run by `nashr-backup.timer` on the server into `/var/backups/nashr`, kept 14 days (`BACKUP_KEEP_DAYS`). It writes a compressed `pg_dump` plus a SHA-256 checksum and records the run, so staff are alerted if it fails or stops.
- **Copy off the server:** set `BACKUP_RSYNC=user@other-host:/srv/nashr` in `/etc/nashr.env`. Each backup is copied there after it is made. A backup kept only on the same server does not survive losing the server.
- Run one now: `systemctl start nashr-backup`. See the last runs: `journalctl -u nashr-backup -n 20`.
- **On a demo or temporary server**, turn backups and the restore drill off with `BACKUPS=off DOMAIN=<domain> bash scripts/deploy-vps.sh`. The choice is kept in `/etc/nashr.env`, so later deploys keep it, and staff get no backup alerts. Turn them back on with `BACKUPS=on`. Keep them on wherever real bookings and money live.
- Uploaded files need S3 versioning on the files bucket. The `files` table only says who may read each file; the bytes live in S3.

## 4. Restore drill (weekly on the server, and before launch)

The server runs it every Sunday (`nashr-restore-drill.timer`). Run it by hand with `systemctl start nashr-restore-drill`, or anywhere with:

```bash
DATABASE_URL=postgres://user:pass@host:5432/nashr scripts/restore-drill.sh
```

The drill runs safely while the site is live: it reads the source in the same snapshot the backup was taken from, so new bids and heartbeats during the drill are not counted as differences. It:
1. Takes a fresh backup in one database snapshot.
2. Restores it into a brand-new database.
3. Proves the copy matches the source:
   - every table's rows (count and contents)
   - ledger cash
   - gapless document numbering
   - the order and payment number sequences
   - the append-only guards on the audit log and documents
4. Drops the copy. Set `KEEP_RESTORE=1` to keep it.

The script fails loudly if anything differs. It has been checked against a deliberately damaged copy: a deleted row and a reset sequence were both caught.

**Drill log**

| Date | Where | Result |
|---|---|---|
| 5 Nov 2026 | Development database (30 tables) | Passed in 1 s. Tamper test caught both changes |
| 9 Nov 2026 | Development database (44 tables), API running and writing during the drill | Passed in 2 s |

## 4a. Load test

`scripts/load-test.ts` sends many buyers bidding on the same slots at once through the real API, while as many browse the calendar. It then checks that there were no server errors, that every slot has one leader at the highest maximum, and that bid numbers have no gaps or repeats. Run it on a copy, never on production (it adds test buyers), then reseed.

```bash
DATABASE_URL=postgres://... LOAD_BASE=http://localhost:3000 npx tsx scripts/load-test.ts 200 10 10
```

| Date | Where | Load | Result |
|---|---|---|---|
| 9 Nov 2026 | Development, one API process, 4 cores | 200 buyers bidding on 10 slots plus 200 browsing, 10 rounds (4,000 requests) | Passed. 456 requests a second, bids p95 625 ms, browsing p95 649 ms, no server errors. Most bids were correctly refused as below the new minimum, because 20 buyers raced for each slot at once |

**Real restore, after data loss:**
1. Put the site in maintenance mode: stop the API.
2. Restore with RDS point-in-time recovery to a new instance, or `pg_restore` the latest dump.
3. Run `scripts/verify-restore.ts` against the old database if it is still readable.
4. Point `DATABASE_URL` at the restored database and start the API.
5. Check `/api/health`, including `ledgerReconciles`.
6. Payments made at the provider after the restore point must be replayed from the provider's events. Webhooks are idempotent: each event is recorded once by its id.

## 5. Incidents

- **A user reports a wrong charge:**
  1. Admin → Deals → search the order number.
  2. The Money tab shows every ledger movement and provider operation.
  3. Never refund outside Nashr. Use the dispute or cancellation flows, so the ledger and the documents stay right.
- **A suspected account takeover:**
  1. Admin → Accounts → the company → Suspend the user. They are signed out at once.
  2. Audit → filter by that user's id for everything they did.
- **A leaked secret** (database password, Stripe key, session signing): rotate it in AWS Secrets Manager and redeploy. Sessions are stored hashed, so a database leak does not expose live sessions.
- **The founder's authenticator is lost:** another founder or an admin with database access resets `totp_enabled` and sends a new invite. This is audited.

## 6. Production settings

| Variable | Value | Why |
|---|---|---|
| `NODE_ENV` | `production` | Real payment provider required, request logs on, HSTS |
| `TRUST_PROXY` | `1` behind the load balancer | Real client IPs for rate limits and logs |
| `APP_ORIGIN` | e.g. `https://app.nashr.ae`, only if the web app and API are on different hosts | Writes from any other origin are refused |
| `LOG_REQUESTS` | `1` (default in production) | One JSON line per request |

Edge (CloudFront or the load balancer) headers for the web app:
- `Content-Security-Policy: default-src 'self'; script-src 'self' https://js.stripe.com; frame-src https://js.stripe.com https://hooks.stripe.com; connect-src 'self' https://api.stripe.com; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https://*.stripe.com; frame-ancestors 'none'` (Stripe's card fields and bank confirmation load from Stripe)
- `Strict-Transport-Security: max-age=63072000; includeSubDomains`

See `docs/security-review.md` for the review and what is still open.

## 6a. Turning on Stripe (test mode first)

Until the three Stripe keys are set, Nashr runs with test cards and no real money moves. To switch to Stripe:

1. In the Stripe dashboard, in **test mode**, enable **Connect** (Express accounts). Note the publishable key (`pk_test_…`) and secret key (`sk_test_…`).
2. Add a webhook endpoint `https://<your domain>/api/stripe/webhook`. Choose these events, and tick **"Listen to events on Connected accounts"** for `account.updated`:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `charge.dispute.created`
   - `account.updated`

   Note its signing secret (`whsec_…`).
3. On the server, add the keys to `/etc/nashr.env` (never to the repository or a chat), then restart: `systemctl restart nashr`.
   ```
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_PUBLISHABLE_KEY=pk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```
4. Check:
   - Pay a booking with `4242 4242 4242 4242`, then with `4000 0025 0000 3155`. The second asks the bank to confirm; the booking turns "Payment secured" when Stripe's webhook arrives.
   - As a publisher, press **Connect payout account**. Stripe's onboarding opens and comes back to the profile.
   - `/api/health` stays green: the ledger must match the Stripe balance.
5. For live money, repeat with the live keys (`sk_live_…`) and a live webhook endpoint, after the lawyer has reviewed the terms.

**Tested without Stripe:** `e2e/stripe-journey.cjs` runs the whole flow in a browser against a mock Stripe (`e2e/mock-stripe.cjs`). It covers the card form, a declined card, 3-D Secure, the signed webhook, the receipt, and payout onboarding. Start the API against the mock with `STRIPE_API_BASE=http://localhost:12111` and the three keys `sk_test_mock`, `pk_test_mock`, `whsec_mock`. `STRIPE_API_BASE` is refused in production.

## 7. Secrets and access

- Production secrets live only in AWS Secrets Manager: never in the repository, never in chat.
- Staff use an authenticator app.
- The development key printed by `npm run seed` must never be used outside development.
- The seed refuses to run when `NODE_ENV=production`, and the API refuses to start in production with the test payment provider.
