# Nashr build: task list

Source: [`plan.md`](plan.md) and [`SPEC.md`](../SPEC.md) (owner decisions in sections 11 and 12).
Order: riskiest first (money, state machine, bidding, timers), then payments, then screens.
Every task ships with its tests. Verify: `npm test` (needs Postgres, see README).

## Phase A: Core engine (server, no UI)
- [x] A1 Project scaffold: TypeScript, Fastify, Kysely, Vitest, migrations, test database. Verify: `npm test` runs.
- [x] A2 Money: minor units, fee/VAT maths (SPEC 12.2, Nashr VAT switch), FX stamp. Verify: worked examples pinned.
- [x] A3 Settings with history + append-only audit log. Verify: history kept, audit rows not updatable.
- [ ] A4 Catalog core: companies, outlets, placements, breaks, slot generation (breaks as slots, any-break and package options, podcast positions). Verify: generation tests, UAE weekend.
- [ ] A5 Deadline rule: bidding close must leave room for seller decision, payment and creative. Verify: rejects too-late closing.
- [ ] A6 Bidding: floor, 3% step, slot lock, auto-bid (proxy), buy-now request, quick-sale interest. Verify: 50 parallel bids give one top bid.
- [ ] A7 Booking state machine + transition() + timeline + audit. Verify: allowed/blocked transitions table test.
- [ ] A8 Sweeper: auction close, seller 24h, payment window, next-bid choice (2 rounds then relist), auto-release. Verify: clock-driven scenario tests (brief 2, 3, 4, 11).

### Checkpoint A: core engine green, reviewed

## Phase B: Payments and money flow
- [ ] B1 PaymentProvider interface + fake provider (Stripe test account not available yet).
- [ ] B2 Ledger (double-entry) + reconciliation query.
- [ ] B3 Charge on "Confirm payment", release + transfer, refunds (full/partial), cancellation rules.
- [ ] B4 Webhook intake, idempotent.
- [ ] B5 Stripe implementation (when the owner has a test account).

### Checkpoint B: full booking scenario (brief 1) reconciles to the fils

## Phase C: Fulfilment and documents
- [ ] C1 Booking brief + automatic checks. C2 Creative + change rounds (technical resubmits free). C3 Proof checklist per channel. C4 Report an issue → dispute → admin outcomes. C5 Pre-run check.
- [ ] C6 Invoicing per SPEC 12.1: receipt, publisher invoice upload or generate, Nashr commission invoice, credit notes, payout statement, structured data.

## Phase D: API, auth, permissions
- [ ] D1 Invite-only access request, login, sessions, 2FA admin. D2 Role scoping on every route + permission matrix test. D3 Admin view-only account access (audited).

## Phase E: Screens (after Figma approval)
- [ ] E1 Buyer: calendar day/week/month, bid drawer, payment, bookings, directory, outlet profile.
- [ ] E2 Seller: dashboard, calendar (calendar + programme view), inbox, deals, earnings, add placement, onboarding.
- [ ] E3 Admin: overview, accounts, publishers, deals, disputes, funds, payouts, audit, settings, reports.

## Phase F: Launch readiness
- [ ] F1 All 26 brief scenarios end to end. F2 Security review, monitoring, restore drill. F3 Pilot.
