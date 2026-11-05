# Brief section 23: the 26 test scenarios

Every scenario is an automated test that runs on each `npm test` (real Postgres, injected clock, test payment provider).
The three browser journeys (`npm run e2e`) walk the main paths through the real screens on top of that.

| # | Scenario | Where it is proved |
|---|---|---|
| 1 | Full booking, ledger reconciles, fees per section 3 | `payments.test.ts` scenario 1; `money.test.ts` worked examples; e2e buyer journey |
| 2 | Seller declines; buyer sees the reason; next bid or relist | `market.test.ts` scenario 2, scenarios 3 and 4; `api.test.ts` scenarios 2 and 20 |
| 3 | No reply in 24 h: declined automatically (with reminders at 12 h and 2 h) | `market.test.ts` scenarios 3 and 4; `api.test.ts` scenarios 3 and 5 |
| 4 | No payment in 48 h: lapses, recorded | `market.test.ts` scenarios 3 and 4 |
| 5 | Declined card: buyer told, seller sees "payment pending", lapses | `payments.test.ts` scenario 5 (both); `api.test.ts` scenarios 3 and 5; e2e buyer journey |
| 6 | 3-D Secure before Secured | `payments.test.ts` scenario 6 |
| 7 | Buyer cancels inside and outside the free window | `payments.test.ts` scenario 7 (three cases) |
| 8 | Seller cancels: full refund recorded against the seller | `payments.test.ts` scenarios 8 and 25 |
| 9 | Missed creative: placeholder or release; reason blames the buyer | `fulfilment.test.ts` scenario 9 (both) |
| 10 | Missed proof: full refund; reason blames the publisher | `payments.test.ts` scenario 10 |
| 11 | Auto-release after 5 working days, reminders day 3 and day 1 | `market.test.ts` and `payments.test.ts` scenario 11; `api.test.ts` scenarios 11, 17 and 25 |
| 12 | Dispute: all four admin outcomes, both sides told | `payments.test.ts` scenario 12 (three tests); `api.test.ts` admin disputes; e2e admin journey |
| 13 | Two bids at the same second: one top bid | `market.test.ts` scenario 13 (50 parallel bids) |
| 14 | Access request: free email refused, approval, invite works | `api.test.ts` invite-only access; e2e access page check |
| 15 | Permissions across sellers, directory, bidders, reserve, fees | `api.test.ts` who can see what (route × role matrix) |
| 16 | Cross-border UAE buyer, Saudi slot | Deferred until KSA opens (brief). Built and tested now: SAR slots, KSA Friday–Saturday working days, booking blocked (`api.test.ts` scenarios 16 and 19) |
| 17 | Money check: secured + in review + released + paid out + refunded = received | `api.test.ts` scenarios 11, 17 and 25; `payments.test.ts` reconcile checks |
| 18 | Time slots: days and times, overnight, overlap warning, podcast release | `api.test.ts` scenario 18; `placements.test.ts` |
| 19 | KSA and Athena "coming soon", waiting list | `api.test.ts` scenarios 16 and 19; Athena page in the buyer menu |
| 20 | Reserve: "Below your reserve" for the seller only; can still accept | `api.test.ts` scenarios 2 and 20; seller inbox badge |
| 21 | Buy-now: seller accepts, auction ends, others told; decline keeps the auction | `market.test.ts` scenario 21 and declined buy-now |
| 22 | Quick sale: two interests, second accepted, first told, nothing charged before paying | `market.test.ts` scenario 22 |
| 23 | Issue, rerun accepted, released after the rerun's proof | `fulfilment.test.ts` scenario 23 |
| 24 | Issue unanswered for 48 h becomes a dispute in the admin queue | `fulfilment.test.ts` scenario 24; `api.test.ts` admin disputes |
| 25 | Refund cost recovery; refund-losses report; buyer sees the deduction first | `payments.test.ts` scenarios 8 and 25; `api.test.ts` scenarios 11, 17 and 25 (preview equals refund; report) |
| 26 | Radio proof needs the as-run log and the audio clip | `fulfilment.test.ts` scenario 26 |

Not testable until the owner provides them: real Stripe test mode (B5) for scenarios 1, 5, 6 and 17 against Stripe's own balance,
and email delivery of the reminders (they are in-app notifications today).
