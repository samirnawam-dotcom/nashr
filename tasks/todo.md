# Nashr build: task list

Source: [`plan.md`](plan.md) and [`SPEC.md`](../SPEC.md) (owner decisions in sections 11 and 12).
Order: riskiest first (money, state machine, bidding, timers), then payments, then screens.
Every task ships with its tests. Verify: `npm test` (needs Postgres, see README).

## Phase A: Core engine (server, no UI)
- [x] A1 Project scaffold: TypeScript, Fastify, Kysely, Vitest, migrations, test database. Verify: `npm test` runs.
- [x] A2 Money: minor units, fee/VAT maths (SPEC 12.2, Nashr VAT switch), FX stamp. Verify: worked examples pinned.
- [x] A3 Settings with history + append-only audit log. Verify: history kept, audit rows not updatable.
- [x] A4 Catalog core: companies, outlets, placements, breaks, slot generation (breaks as slots, any-break and package options, podcast positions). Verify: generation tests, UAE weekend.
- [x] A5 Deadline rule: bidding close must leave room for seller decision, payment and creative. Verify: rejects too-late closing.
- [x] A6 Bidding: floor, 3% step, slot lock, auto-bid (proxy), buy-now request, quick-sale interest. Verify: 50 parallel bids give one top bid.
- [x] A7 Booking state machine + transition() + timeline + audit. Verify: allowed/blocked transitions table test.
- [x] A8 Sweeper: auction close, seller 24h, payment window, next-bid choice (2 rounds then relist), auto-release. Verify: clock-driven scenario tests (brief 2, 3, 4, 11).

### Checkpoint A: core engine green, reviewed ✅ (33 tests)
Decisions made while building (flag to owner if they disagree):
- Relisting reopens the slot as a quick sale at its starting price.
- An accepted "any break" holds only the package; the seller assigns the actual break during fulfilment (C1).
- After an auction, the other bids stay valid until payment is secured; an accepted buy-now or quick sale that isn't paid is relisted.

## Phase B: Payments and money flow
- [x] B1 PaymentProvider interface + fake provider (Stripe test account not available yet).
- [x] B2 Ledger (double-entry) + reconciliation query.
- [x] B3 Charge on "Confirm payment", release + transfer, refunds (full/partial), cancellation rules. On payment secured: mark the slot's remaining bids not_selected.
- [x] B4 Webhook intake, idempotent.
- [ ] B5 Stripe implementation (when the owner has a test account).

### Checkpoint B: full booking scenario (brief 1) reconciles to the fils ✅ (48 tests)
Brief scenarios covered so far: 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12 (partial refund, make-good), 13, 21, 22, 25.
Notes for B5 (real Stripe): record Stripe's own fees from balance transactions before reconciling; a transfer to a seller
without a working payout account must fail loudly to the admin (Payouts page) rather than stay pending.

## Phase C: Fulfilment and documents
- [x] C1 Booking brief + automatic checks. C2 Creative + change rounds (technical resubmits free). C3 Proof checklist per channel. C4 Report an issue → dispute → admin outcomes. C5 Pre-run check.
- [x] C6 Invoicing per SPEC 12.1: receipt, publisher invoice upload or generate, Nashr commission invoice, credit notes, payout statement, structured data.

### Checkpoint C: fulfilment and documents ✅ (73 tests)
Brief scenarios now covered: 1–13, 21–26. Decisions made while building:
- An uploaded publisher invoice is the publisher's to credit; Nashr notifies them with the amount instead of issuing it.
- If the media invoice is due at the run and a refund happens first, only the part the publisher keeps is invoiced.
- PDF rendering of documents comes with the screens (E); the stored row is the record.

## Phase D: API, auth, permissions
- [x] D1 Invite-only access request, login, sessions, 2FA admin. D2 Role scoping on every route + permission matrix test. D3 Admin view-only account access (audited).

### Checkpoint D: API ✅ (80 tests)
`npm start` runs the API plus the sweeper and money-ops jobs every minute; it refuses to start in production with the fake provider.
Still open from D: sending emails (invite links, notifications) needs the email service chosen (SPEC 10); the rate limiter is per process.

## Phase E: Screens (after Figma approval)
- [x] E1 Buyer: calendar day/week/month, bid drawer, payment, bookings, directory, outlet profile.
  - [x] Sign in (with authenticator code for staff), app shell
  - [x] Calendar: Day / Week / Month like Google Calendar, all-day lane, auction/quick-sale icons, channel and sale-type filters, Dubai time
  - [x] Bid drawer: server minimum next bid, auto-bid maximum, buy-now request, quick-sale interest/offer, booking brief (last one pre-filled)
  - [x] Bookings list and booking page with payment (test cards), approve proof, cancel
  - [x] Directory (grid/list, filters, three labelled price levels), outlet profile, quote request for outlets not on Nashr
  - [x] Campaigns: budget, plan per outlet, committed/pending/remaining; bids and requests tagged from the bid drawer
  - [x] Booking page: creative upload (private files), proof review, report an issue, respond to an offer, pre-run confirm, timeline, documents
  - [x] Receipts and invoices list + printable document view; notifications bell; request access and invite pages
  - e2e: `npm run e2e` (needs seed + API + web running) walks bid → buy-now → seller accepts → declined card → paid →
    creative → proof → report issue → partial refund accepted → released (with credit note and reissued invoice)

### Checkpoint E1: buyer screens ✅ (87 tests + e2e)
Decisions made while building (flag to owner if they disagree):
- "Typical on Nashr" = middle half (25th–75th percentile) of completed sales, shown once an outlet has 3 or more.
- Quote requests for outlets not on Nashr go to Nashr's team (bell), not to the outlet.
- Files: local disk in development behind a storage interface; S3 with presigned uploads before launch (TV masters are too big to pass through the API).
- The bell is in-app only until the email service is chosen.
- [x] E2 Seller: dashboard, calendar (calendar + programme view), inbox, deals, earnings, add placement, onboarding.
  - [x] Dashboard with onboarding checklist (outlet, payout account, TRN and invoice choice, first placement, live), money held/released/owed, to-do, coming up
  - [x] Calendar as a programme grid (placement × day), slot panel with bids by company, reserve, choose the next bid, take off sale / back on sale
  - [x] Inbox: decide, choose next bid, review creative, creative not received, send proof, respond to issue, pre-run check, upload invoice
  - [x] Deal page: money preview, brief + automatic checks, accept/decline with reason, creative review, proof checklist with uploads, issue offers, own-invoice upload, cancel, documents, timeline
  - [x] Earnings with monthly statement CSV; Listings (list 4 more weeks, archive) and Add placement; Profile (payout account, tax, outlets with free sectors)
  - e2e: `npm run e2e` now also runs `e2e/seller-journey.cjs`

### Checkpoint E2: seller screens ✅ (89 tests + 2 e2e journeys)
Decisions made while building (flag to owner if they disagree):
- The seller calendar is the programme view only (placement rows × days); the buyer-style hour grid was not repeated for sellers.
- A slot can be taken off sale only while nobody has bid on it.
- Payout onboarding is a placeholder button with the test provider; the real flow is Stripe's hosted onboarding (B5).
- A publisher can switch VAT status and invoice mode themselves (audited). Changes apply to deals accepted afterwards.
- [ ] E3 Admin: overview, accounts, publishers, deals, disputes, funds, payouts, audit, settings, reports.

## Phase F: Launch readiness
- [ ] F1 All 26 brief scenarios end to end. F2 Security review, monitoring, restore drill. F3 Pilot.
