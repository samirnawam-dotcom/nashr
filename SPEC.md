# Spec: Nashr production system

Status: **Draft, awaiting approval.** Source of truth for requirements: *Nashr Developer Brief* (Omar Siyam, 28 Oct 2026).
This file does not repeat the brief. It records what the brief leaves open, the fix proposed for each gap, and the technical shape of the build.
Workflow: `.claude/skills/spec-driven-development` → `planning-and-task-breakdown` (plan and tasks come after this spec is approved).

---

## 0. Capability map (build order)

| Module id | Responsibility | Depends on |
|---|---|---|
| `identity` | Companies, users, roles, invite-only access requests, sessions, 2FA for admin/founder | — |
| `settings` | Every timer, rate, VAT, fee, holiday and threshold, with change history | identity |
| `audit` | Append-only log of every admin/founder action and every money event | identity |
| `catalog` | Outlets, placements per channel, time-slot schedules, slot generation, rate card import | identity, settings |
| `marketplace` | Auctions, bids, buy-now, quick sale, the server-side booking state machine, sweeper | catalog, settings, audit |
| `payments` | Stripe Connect, ledger, webhooks, release, refunds, payouts, reconciliation | marketplace, audit |
| `fulfilment` | Booking brief, creative, proof checklists, pre-run check, report-an-issue, disputes | marketplace, payments |
| `messaging` | Buyer↔seller threads with contact-detail blocking, notifications (in-app + email) | identity, marketplace |
| `documents` | Insertion order, receipt, tax invoice, payout statement, client report (PDF/CSV) | payments, fulfilment |
| `directory` | Outlet directory, three-level price ranges, campaign plans, request-a-quote | catalog, payments |
| `reporting` | Admin pages and founder reports (section 18) | all of the above |

Build order: `identity → settings, audit → catalog → marketplace → payments → fulfilment → messaging, documents → directory → reporting`.
High-risk modules (`marketplace`, `payments`) come early on purpose: fail fast.

---

## 1. Objective

Replace the browser-only prototype (`index.html`, all rules in client JavaScript, data in `localStorage`) with a server where **every business rule, timer, permission and money movement runs on the server**. The screens only display what the server returns.
Done when the 26 test scenarios in brief section 23 pass as automated tests against the server, plus the gap scenarios added in section 7 below.

## 2. Tech stack

Decision record: [`docs/decisions/ADR-001-language-and-stack.md`](docs/decisions/ADR-001-language-and-stack.md).

| Layer | Choice |
|---|---|
| Language | **TypeScript** (strict), one language on server and browser |
| Runtime | Node.js 22 LTS |
| HTTP | Fastify + zod schemas (validation at every trust boundary) |
| Database | PostgreSQL 16 (the only stateful service) |
| SQL access | Kysely (typed SQL, keeps `FOR UPDATE SKIP LOCKED` and advisory locks first-class) + its migrations |
| Background jobs | One Postgres-backed sweeper (section 5.3); pg-boss only for fan-out (email sends) |
| Payments | `stripe` Node SDK, Connect, separate charges and transfers |
| Real-time | Postgres `LISTEN/NOTIFY` → Server-Sent Events |
| Front end | The prototype's screens, split into ES modules with Vite; `localStorage` calls replaced by API calls |
| PDFs | HTML → PDF via headless Chromium (handles Arabic shaping) |
| Email | Postmark or Amazon SES (decision: developer, brief section 24) |
| Files | S3-compatible storage, private, signed URLs that expire, virus scan on upload |
| Tests | Vitest against a real Postgres; Playwright for the 5 key end-to-end flows |
| Hosting | A UAE region (e.g. AWS `me-central-1`) for data residency; staging and live fully separate |

## 3. Commands (once scaffolded)

```
npm ci
npm run db:migrate          # apply migrations
npm run dev                 # server + Vite dev
npm test                    # vitest, needs DATABASE_URL
npm run test:e2e            # playwright
npm run lint && npm run typecheck
```

## 4. Project structure

```
server/<module-id>/        one folder per capability-map module (routes, service, sql, tests side by side)
server/core/               db, clock, money, auth guard, errors
web/                       prototype screens split into modules
migrations/
docs/decisions/            ADRs
tasks/                     plan.md, todo.md (after approval)
```

## 5. Architecture decisions that close the hard parts

### 5.1 Money
- All amounts are **integer minor units** (fils, halalas) in `bigint`. Never floats. Brief example: 76,000.00 AED = `7_600_000`.
- Fee, VAT, FX rate and commission rate are **frozen onto the deal at acceptance** (the prototype already does this in `marketStamp()`). Later changes never touch a live deal.
- Rounding: fee and VAT rounded half-up to the minor unit, once each. Payout = price − fee − VAT on fee. A unit test pins the section 3 worked example exactly (9,120 / 456 / 66,424).

### 5.2 Booking state machine
One table of allowed transitions, `(from_status, event) → to_status`, and one function `transition(dealId, event, actor)` that:
locks the deal row (`SELECT … FOR UPDATE`), checks the transition is allowed, writes the new status, the timeline row, the audit row and any ledger rows **in one transaction**, then `NOTIFY`s.
No other code writes `deal.status`.

### 5.3 Timers: one sweeper, not many scheduled jobs
Every deal stores `next_deadline_at` and the event to fire when it passes. One process runs every minute:
`SELECT … WHERE next_deadline_at < now() FOR UPDATE SKIP LOCKED LIMIT 100` → `transition()`.
- A missed run catches up on the next pass; two sweepers never process the same row.
- The clock is injected, so every timer scenario is a plain unit test that moves the clock forward. (The prototype's `sweepDeals()` already has this shape; it moves to the server.)
- Each sweep writes a heartbeat row; an alert fires if no heartbeat for 5 minutes (brief section 19: "monitored").

### 5.4 Two bids in the same second (scenario 13)
The bid insert runs in a transaction that locks the **slot** row first. The server compares against the current top bid under the lock, applies the 3% step, and assigns a monotonic sequence number. Buy-now acceptance, auction close and quick-sale acceptance take the **same slot lock**, so "seller accepts buy-now" and "auction closes" can never both win.

### 5.5 Who sees what (section 6)
- Every query goes through a scope derived from the session: `seller → outlet_id IN (own outlets)`, `buyer → company_id = own`. There is no unscoped repository method reachable from a route.
- Response shapes are **per role** (separate zod output schemas). A buyer response type has no `reserve_price`, `fee_rate` or contact fields, so they cannot leak by accident.
- A permissions test suite calls every route as every role with another tenant's IDs (scenario 15).
- Postgres row-level security is a later upgrade if the team grows; not needed at pilot size.

### 5.6 Ledger and Stripe
- Separate charges and transfers: charge into Nashr's account at "Confirm payment", `Transfer` to the seller at release, refund from Nashr's balance.
- **Not** card authorisation holds: a manual-capture hold expires in about 7 days, shorter than creative → run → proof → 5 working days.
- Ledger: one `ledger_entries` table, double-entry (every row has a debit and a credit account and the same amount), with the Stripe object ID. The Funds-page equation (brief section 11) is one `SUM … GROUP BY account` query, and the daily reconciliation compares it to Stripe balance transactions.
- Webhooks: `stripe_events(id PRIMARY KEY)`. Insert first; a duplicate fails, so the event is ignored (counted once).
- Payment references `PAY-YYYY-NNNNNN` and document numbers come from Postgres sequences: gapless per document type (see gap G14).

### 5.7 Audit log
`audit_log` is insert-only: the app's database role has `INSERT, SELECT` only, no `UPDATE/DELETE`. Written inside the same transaction as the change it describes.

---

## 6. Gaps found, with the proposed fix

Each gap is something the brief leaves undefined, contradictory, or risky. "Proposed fix" is the default we build unless the owner decides otherwise; every number goes into `settings`, not code.

### A. Money, tax and payments (highest risk)

| # | Gap | Why it matters | Proposed fix | Decides |
|---|---|---|---|---|
| G1 | **Card fees on large tickets.** A 76,000 AED card payment costs roughly 2.9% + fixed fee ≈ 2,200 AED, about **24% of Nashr's 9,120 fee**. Many corporate cards also cap below 76k. | Take rate after processing drops from 12% to ~9%; some deals can't be paid at all. | Add **bank transfer** as a payment method for amounts above a setting (e.g. 20,000 AED); booking moves to Secured when funds arrive. Show "net take after processing" per method. | Founder |
| G2 | **VAT on the ad itself is not covered.** The brief only covers VAT on Nashr's fee. The publisher sells media to the buyer; the buyer needs a tax invoice for the media to reclaim VAT, and "Receipt … VAT included" doesn't say whose VAT. | Buyers can't reclaim VAT; possible compliance issue. | Treat the publisher as the seller of record: the publisher's tax invoice to the buyer (generated by Nashr on their behalf with their TRN), plus Nashr's own tax invoice to the publisher for the fee. Accountant confirms. | Accountant |
| G3 | **KSA payouts via Stripe are unconfirmed.** Stripe's support for Saudi connected accounts and UAE→KSA transfers could not be confirmed from Stripe's docs. | "Opening KSA = a switch in settings" may be false on the payments side. | Put Stripe behind a small `PaymentProvider` interface with one implementation now. Confirm with Stripe before KSA; fallback is a regional PSP (e.g. Tap, Checkout.com, HyperPay) for SAR. | Developer + Stripe |
| G4 | **Holding limits.** The internal "safety deadline" has no number. | Funds held too long can hit refund or dispute limits. | Default: release or refund within 90 days of charge; daily job warns admin at day 60. Confirm with Stripe for the account. | Developer + Stripe |
| G5 | **Refund after the seller was paid** (late chargeback or dispute). The brief says deduct from future payouts but not what happens if there are none. | Nashr carries the loss silently. | Ledger account `seller_receivable`; deduct from next transfers; after N days unpaid, admin task to invoice the seller. Shown on Refund costs page. | Founder |
| G6 | **Cancellation fee formula is ambiguous.** "Refund minus 15%, Nashr's fee applies to it" plus "processing cost deducted" (12A). Order of operations isn't defined. | Two developers will compute two different numbers. | `refund = paid − 15% × paid − processing_estimate`. Seller receives `15% × paid − fee(15% × paid) − VAT`. Pinned by a unit test with the brief's numbers. | Founder |
| G7 | **FX on refunds.** Refund "in the original currency and amount", but the ledger reports in AED. | Ledger won't reconcile. | Refund in the deal's currency; the AED difference goes to an `fx_gain_loss` ledger account. | Accountant |

### B. Marketplace rules

| # | Gap | Proposed fix | Decides |
|---|---|---|---|
| G8 | **"Next bid moves up" is undefined.** Does the seller decide again, or is the runner-up buyer asked? The prototype offers it to the runner-up **buyer** (`runnerup_offered`); the brief says the bid "moves up" to the seller. A runner-up's bid may be days old. | Runner-up goes to the **seller** (new 24h window); the runner-up buyer then has the normal 48h to pay. Cascade max 2 times and never past the creative deadline; then relist. | Founder |
| G9 | **Buyer payment window "shortened if the creative deadline is close"** has no formula. | `pay_by = min(accepted_at + 48h, creative_deadline − 24h)`; if that leaves under 4h, the seller sees a warning before accepting. | Founder |
| G10 | **Proof deadline** is "after the run date" with no number. | Per channel setting: print 3 working days, digital/radio/TV/podcast 2 working days after the run ends. | Founder |
| G11 | **Can a buyer withdraw a normal bid?** Only buy-now withdrawal is defined. | No: bids are binding (brief section 9). Admin can void a bid with a reason (audited). | Founder |
| G12 | **Max bid (auto-bid) ties.** Two equal maximums; auto-bid vs 3% step rounding. | Standard proxy bidding: the earlier maximum wins ties; the price shown is the lower of (second max + 3%, winner's max). Rounded up to whole currency units. | Founder |
| G13 | **Budget is a warning only.** A buyer can lead many auctions and win more than their budget. | Keep it a warning (bids are binding, so no auto-cancel), but show "committed if you win everything" in the bid desk. | Founder |
| G14 | **Document numbering.** UAE tax invoices need sequential numbers and Nashr's TRN; the brief doesn't say per-market or per-type sequences. | Separate gapless sequence per document type and per market (`NSH-…`, `PAY-…`, `INV-AE-…`). | Accountant |
| G15 | **Slot generation for open-ended placements** ("none" weeks). No job creates future slots. | Daily job keeps a rolling 26-week horizon of slots; schedule changes regenerate only future slots with no bids (brief section 15). | Developer |
| G16 | **Overnight slots and dates.** Which date does 23:00–02:00 belong to? Which market's working days apply when buyer and seller differ? | The airing belongs to its **start** date in the outlet's time zone. Working days follow the **publisher's** market (brief section 14 already says this; apply it to every timer). | Founder |
| G17 | **Creative after 2 change rounds** is undefined. | After round 2 the seller must approve or reject with a reason; a valid rejection lets the buyer cancel under section 12 rules. | Founder |
| G18 | **Make-good and "issue open" have no status** in the section 8 status table, but they pause or reset timers. | Add sub-statuses `issue_open` (auto-release paused) and `make_good_scheduled` (new run date, new proof deadline). | Developer |
| G19 | **"Typical on Nashr" price range** from very few sales can reveal one buyer's exact price. | Show level 1 only when there are at least 3 completed sales; otherwise fall back to level 2. | Founder |

### C. Security, platform and operations

| # | Gap | Proposed fix | Decides |
|---|---|---|---|
| G20 | **Contact-detail blocking** in messages is easy to bypass ("zero five five…", spaced digits, Arabic-Indic digits). | Regex blocking incl. Arabic-Indic digits and spaced numbers, plus flag-for-review rather than hard block when unsure. Accept that it reduces leakage, not eliminates it. | Founder |
| G21 | **Log-in-as-user** for support (section 20) has no limits. | Read-only by default, banner on screen, every session audited, money actions blocked while impersonating. | Founder |
| G22 | **Data residency** (UAE PDPL; Saudi PDPL once KSA opens) not mentioned. | Host in a UAE region; confirm whether KSA personal data needs in-Kingdom storage before opening KSA. | Founder + lawyer |
| G23 | **Prototype migration.** The prototype has 81 `localStorage` touchpoints and the demo clock; none of it may reach live (brief section 25). | Demo-only code removed at build time behind a `DEMO` flag that does not exist in the production build; a CI check fails if `localStorage` is used for business data. | Developer |
| G24 | **Backups "tested restore"** has no target. | Point-in-time recovery, RPO 5 min, RTO 4 h, a restore drill before launch and each quarter. | Founder + developer |

### D. Prototype vs brief (screens we cannot simply copy)

Found by searching `index.html` (V30):

| Brief feature | In prototype? | Action |
|---|---|---|
| Quick sale / Show interest | **No** (the brief says so too) | Build new: server + new screens |
| Report an issue (12A step before dispute) | **No** | Build new |
| Proof checklist per channel (as-run log, etc.) | **No** | Build new; blocks proof submit server-side (scenario 26) |
| Pre-run check (48h before run) | **No** | Build new |
| Chargebacks, goodwill refunds, refund-cost recovery | **No** | Build new (payments module) |
| KSA "Coming soon" + waiting list | **No** | Build new (small) |
| Athena | **Fully built** in prototype | Hide behind "Coming soon"; **do not port** (brief section 21) |
| Overnight time slots | Not found | Build and test (scenario 18) |
| 2FA for admin/founder | **No** | Build (identity module) |
| Reserve price, auto-accept, insertion order, audit, Ramadan schedules, make-good | Yes | Port the rule to the server, keep the screen |

**Admin pages (brief section 17) in the prototype.** The prototype has one admin screen (`#owner`: overview plus six tabs) and a separate outlet-profile editor (`#admin`). There is no separate founder role.

| Brief page | Prototype | What is missing |
|---|---|---|
| Overview | **Yes**: commission, GMV, take rate, net take after processing, listings, activated buyers, chart, per publisher, per market, "Needs your decision" queue | Not every figure opens the records behind it |
| Access requests | **Yes**: approve (invite link), reject with reason, request more info | Real invite email |
| Publishers | **Yes**: fee rate change with history and audit, acceptance rate, response time, cancellations | Stripe payout status; rates fixed to 10/12/15% |
| Funds | **Yes**: five buckets per publisher, reconciliation check, drill-down to deals | Stripe references |
| Accounts | Partial: list with status and lapses; only action is "Restore bidding" | Verify, suspend, ban, resend invite, reset access, view activity |
| Outlet profiles | Partial: create, edit, delete custom outlets; built-in ones read-only | Confirmed/estimated price ranges, change history; **delete conflicts with "history must be kept"** |
| All deals | Partial: stage funnel, filter by publisher and funds bucket, insertion order link, dispute buttons | Filters (status, market, channel, buyer, dates), search, export, release/refund/cancel, full timeline view |
| Disputes | Partial: inside the queue and deals table (release, full refund, partial refund, make-good) | Own page with both sides' evidence |
| Audit log | Partial: list, newest first | Filter, export, tamper-proof storage |
| Calendar oversight | **No** | Whole page |
| Payouts | **No** | Whole page |
| Messages and notifications | **No** | Whole page (templates, send log, resend) |
| Settings | **No**: timers and rates are constants in code | Whole page, with history |
| Reports | **No** (only the overview charts) | Whole page |
| Refund costs | **No** | Whole page |

Across all admin pages: **no CSV export, no search box, no founder role, no 2FA, no log-in-as-user.**

**Founder reports (brief section 18).** Partly covered by the overview, Funds and Publishers tabs: revenue, GMV and take rate, money position, quality and trust, and a booking funnel (counts only, no drop-off reasons). **Missing:** buyer activation, supply, demand, prices, top lists, retention, cross-border, failures, disputes and refund losses, the date/market/channel/publisher/buyer filters, CSV export and the weekly email.

---

## 7. Testing strategy

- **Unit (Vitest):** money maths (section 3 example, G6, G7), state-machine transitions table, proxy bidding (G12), working-day calculator per market.
- **Integration (Vitest + real Postgres):** each of the 26 brief scenarios plus G8, G9, G18 scenarios, driven by moving the injected clock and calling the sweeper. Stripe via its test mode and recorded webhook fixtures; duplicate-webhook test.
- **Concurrency:** scenario 13 runs 50 parallel bids against one slot and asserts exactly one top bid and a strictly increasing sequence.
- **Permissions:** generated matrix test (every route × every role × foreign IDs).
- **E2E (Playwright):** full booking, dispute, buy-now, quick sale, access request.
- Bar: every change meets `.claude/references/definition-of-done.md`.

## 8. Boundaries

- **Always:** money in minor units; every status change through `transition()`; validate input with zod at the route; write the audit row in the same transaction; run `npm test` before commit.
- **Ask first:** schema migrations touching money tables, new dependencies, any change to fee/VAT maths, anything that moves real money in live.
- **Never:** store card data; hard-code a timer, rate or percentage; let the client decide a status or amount; ship demo code to live; delete or edit audit or ledger rows.

## 9. Success criteria

1. All 26 brief scenarios and the added gap scenarios pass in CI against Postgres.
2. Ledger reconciles to Stripe test-mode balance after the full-booking scenario, to the minor unit.
3. Permissions matrix test passes with zero leaks.
4. No business rule runs only in the browser (checked by review against section 6 list).
5. Pilot: one real UAE publisher and one buyer complete a booking end to end in staging with Stripe test mode.

## 10. Open questions (need an answer before planning)

1. **G1:** bank transfer for large bookings in the pilot, or card only?
2. **G2:** accountant to confirm who invoices the media sale and its VAT.
3. **G3:** OK to defer the KSA payment provider decision until KSA opens?
4. **G8:** runner-up goes to the seller (proposed) or straight to the runner-up buyer (prototype)?
5. Front end: keep the prototype's vanilla JS screens (proposed: fastest), or rebuild in React?
6. Hosting and code ownership (brief section 24): whose AWS/Stripe accounts?
