# Nashr runbook

For whoever runs Nashr in production. Plain steps; each one says what to check and what to do.

## 1. What runs

- **API** (`npm start`): the web API, plus two jobs every minute, also once at startup:
  - **sweeper**: auction closes, deadlines, reminders, pre-run checks
  - **money**: refunds and payouts go out
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

**Alert on:**
- the health check failing twice in a row
- any 5xx rate above 1% over 5 minutes
- any `"job"` error line

## 3. Backups

- **Point-in-time recovery:** RDS automated backups, kept 35 days. This is the first choice for "undo the last hour".
- **Nightly logical backup:** `scripts/backup.sh /backups`. It writes a compressed `pg_dump` plus a SHA-256 checksum. Copy it to a separate AWS account, or at least a separate bucket with object lock, and keep 90 days.
- Uploaded files need S3 versioning on the files bucket. The `files` table only says who may read each file; the bytes live in S3.

## 4. Restore drill (do it monthly, and before launch)

```bash
DATABASE_URL=postgres://user:pass@host:5432/nashr scripts/restore-drill.sh
```

The drill:
1. Takes a fresh backup and checks its checksum.
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

## 6. Secrets and access

- Production secrets live only in AWS Secrets Manager: never in the repository, never in chat.
- Staff use an authenticator app.
- The development key printed by `npm run seed` must never be used outside development.
- The seed refuses to run when `NODE_ENV=production`, and the API refuses to start in production with the test payment provider.
