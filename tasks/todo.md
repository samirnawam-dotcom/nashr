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
- [x] B5 Stripe implementation: card fields with 3-D Secure, signed webhooks (amount checked), Connect Express payout onboarding, fees in the ledger. Tested against a mock Stripe (`e2e/stripe-journey.cjs`); waits only for the owner's test keys (runbook 6a).

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
Since closed: email is built (own SMTP client and outbox; switched on by the SMTP settings); attempt limits are kept in Postgres and shared by every copy of the API.

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
- [x] E3 Admin: overview, accounts, publishers, deals, disputes, funds, payouts, audit, settings, reports.
  - [x] Overview: month's bookings and value, held, commission earned, what needs attention, deals by status, reconcile warning
  - [x] Access requests (approve → invite link, ask for info, reject); Accounts with users (suspend signs out at once), balances, founding commission (founder), view as read-only with banner
  - [x] Deals search and full deal file (events with actor, ledger, payments/refunds/transfers, creative, proof, issues, documents); extra change round; dispute decisions
  - [x] Disputes queue; Funds (every ledger account + reconciliation); Payouts and refunds with retry (same idempotency key)
  - [x] Reports by month, channel, sale type and outlet with take rate and CSV; Audit log with record filter and CSV
  - [x] Settings with history, founder-only financial keys locked for admins; Nashr team list and staff invites (founder adds founders)
  - [x] Directory: quote requests, outlets not on Nashr with Nashr's estimate
  - e2e: `npm run e2e` runs buyer, seller and admin journeys (admin signs in with the demo authenticator key printed by the seed)

### Checkpoint E3: admin screens ✅ (92 tests + 3 e2e journeys)
Fixed while building: the payment step logged the actor as "buyer" without the company; refund amounts were labelled excl. VAT but are VAT-inclusive.
Decisions made while building (flag to owner if they disagree):
- Suspending a user signs them out; their company's bookings carry on. There is no company-wide suspension yet.
- An admin can invite admins; only the founder can invite another founder.
- Settings are edited as raw values with a plain-language label; a friendlier form per setting can come with the brand pass.

## Phase F: Launch readiness
- [x] F1 All 26 brief scenarios end to end: `docs/scenarios.md` maps each to its test (scenario 16 waits for KSA to open; its building blocks are tested)
  - Built to close gaps: deadline reminders; reasons on timer events shown to buyers; overnight programmes and overlap warnings;
    KSA and Athena "coming soon" with waiting lists; "payment pending" and "Below your reserve" for sellers; cancellation preview;
    refund-losses report; dispute decisions notify both sides; money-check test
- [x] F2 Security review (`docs/security-review.md`: 1 high, 3 medium, 5 low found and fixed; Stripe webhook signature open for B5),
  monitoring (`/api/health`, JSON logs, graceful shutdown), restore drill (`scripts/restore-drill.sh`, passed, tamper test caught), `docs/runbook.md`
- [ ] F3 Pilot: plan written (`docs/pilot-plan.md`); running it needs the owner's items below and the pilot companies

- [x] UI upgrade (`docs/design/ui-direction.md`): studio-teal shell with bilingual wordmark, sign-in hero, saffron on-air signal,
  status pills, visible focus, readable small text; phones fixed (menu, calendar day list, filters, scrolling tables)

### Checkpoint F: launch readiness (software side) ✅ (104 tests + 3 e2e journeys)

## Phase G: after the pilot plan (owner requests, in order)
- [x] Account self-service, admin tables and CSV, admin interventions, dispute case file, live updates
- [x] Staff sign-in as any user (reason, 1 hour, logged), pilot scorecard, auction-close notices, help and Contact Nashr
- [x] Invoice-grade documents with addresses; whole documents and PDFs in Arabic; auto-bid rises to the reserve
- [x] Two-step sign-in for everyone; pre-launch review fixes; dispute policy and terms by version; self-service reset; Users admin and sign-in tracking
- [x] Self-serve teams with enforced rights; email (outbox, SMTP, bilingual, preferences, staff Emails page)
- [x] Phone app and push alerts; disputes final except a clear mistake of fact within 10 working days
- [x] Agencies with clients: client per booking, budgets (guide or stop), brand safety by client, client documents and reports
- [x] Launch readiness: staff alerts (watch job), backups and weekly restore drill as server timers (`BACKUPS=off` on demo servers), load test
- [x] Stripe test mode (B5 above); webhook amount check; shared attempt limits; one query at a time per connection

### Checkpoint G ✅ (197 tests + 5 e2e journeys: buyer, seller, admin, full, Stripe)

- [x] Live updates shared by every copy of the API (Postgres LISTEN/NOTIFY), checked with two copies running

## Phase H: owner's feedback (First_Half.docx and his prototype)
- [x] His look everywhere: purple and white, Inter / Inter Tight; media types Website, Newspaper, Magazine, Newsletter, Radio, TV / Shows, Podcast, Social
- [x] Publisher dashboard on one page; product catalogue by media type; menu (Dashboard, Products, Coverage, Calendar, Requests, Messages, Transactions, Balances, Your business)
- [x] Calendar: add a product at a chosen price, bid status chips, side panel (Details / Bids / Assets), click an empty day to add
- [x] Requests with Accept / Counter offer / Decline and the conversation; counter offers for both sides
- [x] Sectors ticked from a list; home page "Media moves differently here."; media coverage submission with Nashr review
- [ ] Outlet name at the top of the menu with a dropdown to profile settings
- [ ] Calendar menu dropdowns to the rate card and the media catalogue; a History page
- [ ] Click-to-add in the calendar's Week view (Programme view has it)
- [ ] Check the buyer's bid drawer shows date, time, sector and the bid summary as he described
- Left out on purpose: his placeholder figures and client results (need verified ones); one Nashr review step instead of three approval rows

## Phase I: owner's rules for products and listings (Nashr_seller_final_rule.pdf, 10 Nov 2026)
- [x] Menu: Dashboard, Calendar, Products, Inbox (requests + messages), Reports (transactions + balances); settings under the name; Coverage removed
- [x] Product > media types (own fields, Other on every pick-list) > programmes; deadline rule; listing with dates, how it is sold and prices
- [ ] Bid drawer kept small: product, media type and programme, audience, format, length or size, date (time for radio and TV), price; anything else as one line
- [ ] Product logo upload (optional field)
- [ ] Say "listing" instead of "placement" everywhere buyers and publishers read it

## Waiting on the owner
- Stripe test keys in `/etc/nashr.env` (runbook 6a), then live keys after legal review
- SMTP settings so emails are sent
- Lawyer review of the terms, dispute policy and refund policy, including holding buyers' money for publishers in the UAE
- Native Arabic review of screens, emails and PDFs
- Before launch: remove `STAFF_TWO_STEP=off`; on the production server keep backups on and set `BACKUP_RSYNC`
- Pilot companies and brand files

## On hold by decision
- Athena, the planning assistant (brief section 21: build once there is enough real booking data)
- Opening Saudi Arabia (a founder setting, `open_markets`; SAR prices and the Saudi weekend are built in)

## Phase J: design polish pass (audit of 30+ screens, all roles)
- [x] One filter bar, one figure tile, one pick-list style; violet-toned greys everywhere (no green-grey leftovers)
- [x] Record pages (booking, deal, account, campaign): breadcrumb + title + status, no stock photo
- [x] Staff: Deals table two-line cells without sideways scroll; Funds ledger and Settings in words; status pills on Users and Payouts
- [x] Sidebar foot shows the full name; only one menu item active for staff; bell count capped at 99+
- [x] Help as an accordion; Account and Help in one readable column; empty states as a centred note

## Phase K: publisher calendar, second pass
- [x] Week by programme: one row per programme, each break a one-line pill coloured by state (time, bids, price); "By time" kept as a switch
- [x] Money tiles that also filter: To decide, With bids, Booked, Still on sale
- [x] Month: one summary per day (booked and value, with bids, on sale, "to decide" flag); press a day to open it
- [x] Tighter header (no duplicate tabs), price on the by-time cards, status chips kept on the List view

## Phase L: fewer clicks for daily use
- [x] Publisher: Select mode on the week by programme (breaks, a whole programme, a whole day) with one bar: take off sale, put back, set price
- [x] Publisher: Repeat this week for the next 1 to 12 weeks, at each programme's current price
- [x] Buyer: plan basket (Add to plan in the slot drawer, Plan button in the calendar): total against the campaign or client budget, one brief, send all together
- [ ] Offered, not built: price hints, decide from the calendar, fill-rate heat map, compare outlets, "same again"

## Phase M: design polish, second pass
- [x] One page title size, one gutter and one width on every signed-in page; dashboards use the full width
- [x] Section tabs (Requests | Messages, Transactions | Balances) level with the title instead of above it
- [x] Every pick-list styled the same; phone top bar light like the sidebar; smaller unread badge
- [x] Dashboard action rows aligned in columns; no repeated stock thumbnails in Products rows and the Day view
- [x] Phone header of the publisher calendar tidied; a proper "Not found" page

## Phase N: public pages redesigned (home, audiences, guest calendar, sign-in, request access)
- [x] Home hero: a product preview (a week of slots across media, priced, in their states) with the booking card, in place of three small floating cards
- [x] Home: interface vignettes for the two sides in place of stock photos; headline figure on one line (AED 1.03M)
- [x] Sign-in, request access, invite: brand panel without a stock photo (promise in three lines, the five steps); back link and language at the top; request cards with icons
- [x] Audiences: night band with the title and the three steps; cards lead with what is open now
- [x] Guest calendar: one slim "browsing as a guest" line above the grid; Directory added to the public menu
- [x] Arabic check of the five public pages: hero cards no longer overlap, Latin names cut at their end, prices in dirhams, headline figure in Arabic words, audience arrows mirrored
- [x] Arabic check of the signed-in pages (28 screens, three roles, plus phone): "Break N" and common slot labels translated everywhere they show; 99+ badge; web-address fields; Latin text punctuation; Results page no longer scrolls sideways on a phone (both languages)

## Phase O: owner's document "Fixes round 2" (11 Nov 2026)
- [x] New names: Product (the brand) is now Outlet; Media type (the level) is now Product; labels on the Products page, the outlet page and the product form
- [x] Outlet form: logo upload (JPG or PNG), shown on Products, the calendar and the bid drawer; initials when there is none
- [x] Names everywhere start with the outlet: "The National · Full page", "Skyline FM · Morning Markets" (a newspaper's own unit is named by its format; migration 038 renames existing ones)
- [x] Product form: one icon per media type; "You'll add each programme after saving." under Sell it by programme
- [x] No clock time for media sold by the date (newspaper, magazine, website, newsletter, social, podcast, other): list, drawer, sale closes, creative due
- [x] Bid drawer and the publisher's slot panel: audience, reach with what it counts, "anything else" as one line with the full text a tap away
- [x] Calendar rows show the outlet's logo instead of the media type icon
- [x] Products page: one card per outlet (logo, description, number of products, top 3 with what is on sale); inside an outlet, products grouped by media type, each row opening a summary with Details, Audience, Sectors, Requirements
- [x] Round 2, completed against the document line by line: "+ Add a product" under each outlet card; logo chosen while creating an outlet; "Pick the product" on the calendar's listing panel; outlet-first names in bookings, inbox, transactions, messages, dashboards and documents (brand_name() in SQL, migration 039); no clock time for date-only media on booking, deal, inbox and results pages; the outlet's logo in the buyer's by-outlet view
- [x] Arabic check of bookings, inbox, transactions and the by-outlet view after round 2: transactions and the deal page now carry the outlet-first title; "1 slot" translated; booking title uses the same " · " as everywhere; titles translate their format part
- [x] Rate card import in the new names: columns outlet, product, programme; a row adds a programme (if new) and lists it, or lists the product itself; template made from the publisher's own outlets; older files still read (name, seconds, description)
- [x] Old single-placement pages removed (edit page, the old listings list and add-placement form behind it); old edit links open the outlet instead; an unknown outlet address says Not found
- [x] Removed the two uncalled placement routes (list dates, archive) and the hidden outlet form in Your business; audience tags and "advertisers you will not run" moved to the product form so nothing buyers rely on was lost
- [x] A product's Arabic name and website are on the product form (optional), in its summary, and still feed the directory
- [ ] Placement create and edit routes, and the old outlet create and edit routes, are called only by API tests
- [x] A product's Arabic name shows under its title on its Directory page (English, Arabic, phone); nothing extra when there is none
- [x] Older products (made before the product form) are completed from what they already sell: price, deadlines, language, file type, audience from tags; the form no longer asks for them. A product with no description is still asked for one
- [ ] Older newspaper/website products are sold through the items they had before; those items can be listed but not edited from the new screens
- [x] Description optional for older products and outlets: one that never had a description saves without it (label reads "Description (optional)"); once it has one it cannot be emptied, and every new product or outlet still needs it
