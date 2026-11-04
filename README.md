# Nashr

UAE media-booking marketplace. Spec: [SPEC.md](SPEC.md) · Plan: [tasks/plan.md](tasks/plan.md) · Tasks: [tasks/todo.md](tasks/todo.md) · Prototype (reference only): `index.html`.

## Develop

Needs Node 22 and PostgreSQL 16 with a role that can create databases (default `postgres://nashr:nashr@localhost:5432`).

```bash
npm ci
npm test           # builds a fresh nashr_test database each run
npm run typecheck
npm start          # API on :3000 + background jobs (fake payment provider outside production)
```

Set `TEST_DATABASE_URL` to use another test database. `npm run db:migrate` applies migrations to `DATABASE_URL`.

## Layout

```
server/core/          db, money, settings (with history), audit log, market calendar
server/catalog/       placements and slot generation
server/marketplace/   bidding, buy-now, quick sale, booking state machine, sweeper (all timers)
server/payments/      provider interface (+ fake), ledger, charge, release, refunds, cancellations, disputes, webhooks
server/fulfilment/    booking brief, creative, proof checklist, report an issue, pre-run check
server/auth/          access requests, invites, passwords, TOTP 2FA, sessions
server/api/           HTTP routes per role, response shapes, permission checks
server/documents/     receipts, publisher invoices (generated or uploaded), commission invoices, credit notes, payout statement
server/migrations/    SQL migrations
```
