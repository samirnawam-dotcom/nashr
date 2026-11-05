# Nashr pilot plan (F3)

A closed pilot with real companies and real money at small scale, before opening Nashr to every approved account.
The software side is ready to run. The pilot needs Omar's decisions and contacts, listed in section 6.

## 1. Who

| Side | Who | How many |
|---|---|---|
| Publishers | Founding publishers on the founding commission (set per publisher by the founder), ideally one per channel: radio, TV, print, digital, podcast | 4–6 |
| Buyers | Brands or agencies that already buy UAE media and will book within the pilot | 6–10 |
| Nashr | Founder (financial decisions), one operations admin (inbox, disputes, payouts) | 2 |

All accounts go through the normal access request and invite. No shortcuts, so the onboarding is part of what we test.

## 2. Length and shape

Six weeks, live payments (Stripe live mode, once B5 is done), UAE only.

| Week | Focus |
|---|---|
| 0 | Publishers onboard: outlet profile, payout account, TRN, first placements, at least 4 weeks of slots listed |
| 1–2 | Buyers onboard. First bids, buy-now requests and quick sales. Nashr's team watches every deal |
| 3–4 | Full volume: creative, proof, reviews, payouts. At least one cancellation and one reported issue handled for real |
| 5 | Monthly close: payout statements, invoices, refund-losses report, reconciliation |
| 6 | Review with participants; go/no-go for opening |

## 3. What we measure

| Measure | Target | Where to read it |
|---|---|---|
| Paid bookings | ≥ 30 | Admin → Reports |
| Booked value (excl. VAT) | Omar to set | Admin → Reports |
| Requests accepted within 24 h | ≥ 80% | Deals by status; expired requests |
| Payments completed within 48 h of acceptance | ≥ 85% | Lapsed deals |
| Proof sent on time | ≥ 95% | Refunds for missed proof |
| Issues becoming disputes | ≤ 1 in 20 deals | Admin → Disputes |
| Ledger reconciles with Stripe | Every day, to the fil | `/api/health`, Admin → Funds |
| Payouts sent on the day of release | 100% | Admin → Payouts |
| Invoices with correct VAT and TRNs | 100% (checked by the accountant on a sample) | Receipts and invoices |
| Uptime | ≥ 99.5% | Uptime monitor |
| Participant score ("would you keep using Nashr?") | ≥ 8/10 average | Week 6 interviews |

## 4. Go / no-go for opening

- **Go** when all of these hold:
  - the ledger reconciled every day
  - no money was lost or paid twice
  - the accountant signs off on invoices and VAT
  - no open high-severity security findings
  - the restore drill passed against production
  - most targets in section 3 are met
- **No-go**, fix and extend the pilot by two weeks, on any of these:
  - a reconciliation difference we cannot explain
  - a payout or refund sent wrongly
  - a data leak between companies
  - an invoice the accountant rejects

## 5. During the pilot

- **Daily, by the operations admin:**
  - the Overview "Needs attention" list
  - Payouts → Failed
  - `/api/health`
- **Weekly with Omar:**
  - Reports
  - refund losses
  - the access request queue
  - participant feedback
- Every bug or confusion goes in one shared list, with the order number when there is one.
- No settings changes during the pilot without the founder. Settings keep their history, so any change is visible later.

## 6. What Nashr needs to provide before day 0

1. Stripe live account and the Connect platform profile (B5 needs the test account first).
2. AWS account and budget: database, file storage (S3), backups, monitoring.
3. Email service for invites, reminders and notifications (today they are in-app only).
4. Brand files (logo, colours, type) to replace the placeholder brand.
5. Legal: terms of use, privacy notice, publisher agreement with the founding commission, refund policy. Accountant's sign-off on the invoice plan and VAT.
6. The list of pilot publishers and buyers with a named contact at each.
