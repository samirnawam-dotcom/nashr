# Implementation Plan: Nashr production system

Status: **Draft for owner pricing.** Spec: [`SPEC.md`](../SPEC.md) (owner decisions in section 11). Decision record: [ADR-001](../docs/decisions/ADR-001-language-and-stack.md).

## Overview
Rebuild Nashr from scratch in TypeScript on PostgreSQL with Stripe Connect, with every rule on the server, for a UAE-only launch. KSA ships as a "coming soon" page with a waiting list. The owner asked for:
1. the design phase included in time and cost;
2. a **full rebuild** and a **partial rebuild** priced separately;
3. every item marked **needed for launch** or **can wait**.

## The two options

| | Full rebuild | Partial rebuild |
|---|---|---|
| Server, database, payments, invoicing, timers, permissions | New | New (**identical**: the brief requires every rule on the server) |
| Screens | New React app, **new visual design** in Figma, more user friendly, calendar at the centre | New React app that **keeps the prototype's current look and layouts**; Figma only for pages the prototype doesn't have |
| Design phase | Whole product, approved section by section | Missing pages only (admin gaps, quick sale, report an issue, proof checklist, KSA page) |
| What the owner gets | A redesigned product | The prototype's look, made real and safe |

"Partial" does not mean reusing the prototype's code. That code keeps every rule in the browser, so neither option can ship it. The saving is design and front-end polish, not the server.

## Architecture decisions
- TypeScript end to end (accepted, ADR-001). PostgreSQL is the only stateful service, which keeps the fixed AWS budget small.
- Money in minor units. The fee is calculated on the price excluding VAT. Disclosed-agent invoicing (SPEC 5.1, 11.2).
- One state machine and one deadline sweeper for every timer (SPEC 5.2, 5.3).
- Stripe Connect, separate charges and transfers, card only. Built against a Stripe **test account** as soon as the owner has one (SPEC 11.1 #8).
- Invoices stored as structured data from day one, ready for UAE e-invoicing.

## How to read the estimates
- **Unit: developer-weeks** (one experienced full-stack developer, 5 days a week), including that item's automated tests.
- Design is in **designer-weeks**, including the owner's approval rounds.
- These are planning estimates at **±20%**. They tighten after the design phase.
- **Cost = weeks × 5 × day rate.** The day rate is not set yet (SPEC section 10, question 5).

---

## Task list

Label: **L** = needed for launch · **W** = can wait (after launch).

### Phase 0: Design (Figma, approved section by section)
| # | Item | | Full | Partial |
|---|---|---|---|---|
| D1 | Design system from Nashr's brand files: type, colour, components, Arabic-ready | L | 1.0 | 0.5 |
| D2 | Buyer: calendar, bid desk, bid form and booking brief, buy-now, quick sale, payment, creative upload, proof review and report an issue, campaigns, directory, account | L | 1.5 | 0.5 |
| D3 | Seller: dashboard, calendar (week and programme view), placement forms for the 5 channels, inbox, deals, earnings, proof checklist | L | 1.5 | 0.5 |
| D4 | Admin (15 pages) and founder reports | L | 1.5 | 0.75 |
| D5 | Public: landing, request access, invite and password, KSA coming soon, Athena coming soon | L | 0.5 | 0.25 |
| | **Design total** | | **6.0** | **2.5** |

**Checkpoint:** owner approves each section in Figma before its screens are built (build of the server starts in parallel, it doesn't wait for design).

### Phase 1: Foundation
| # | Item | | Weeks |
|---|---|---|---|
| 1 | Project, CI, staging and live on AWS (UAE region, minimum services), backups | L | 1.5 |
| 2 | Invite-only access: request form (free email blocked), admin approval, invite link, login, sessions, 2FA for admin and founder, TRN at onboarding, rate limits | L | 2.0 |
| 3 | Roles and data scoping on every request, with a permission test across every route and role | L | 1.0 |
| 4 | Settings with change history; append-only audit log | L | 1.0 |
| | **Phase total** | | **5.5** |

### Phase 2: Catalog (sellers' products)
| # | Item | | Weeks |
|---|---|---|---|
| 5 | Outlets and placements for print, digital, radio, TV, podcast; time slots incl. overnight; seasonal schedules (e.g. Ramadan); blackouts; overlap warnings | L | 2.5 |
| 6 | Slot generation (rolling 26 weeks); per-week price, block, copy forward, bulk edits | L | 1.5 |
| 7 | Rate card spreadsheet import (listed in the brief's pilot scope, section 22) | L | 1.0 |
| 7a | Directory bulk import for admin | W | 0.5 |
| | **Launch total** | | **5.0** |

### Phase 3: Marketplace
| # | Item | | Weeks |
|---|---|---|---|
| 8 | Booking state machine, deadline sweeper, injectable clock | L | 1.5 |
| 9 | Auctions and bids: floor price, 3% step, slot locking (two bids in one second), anonymous bidders, reserve flag, auto-accept, countdown in outlet time, buy-now | L | 2.0 |
| 10 | Quick sale: show interest, offers not below floor, accept one | L | 1.0 |
| 11 | Seller decision; on decline or non-payment the seller picks any remaining bid or relists, "not selected" notices, max two rounds (owner #7) | L | 1.0 |
| 12 | Live calendar updates | L | 0.5 |
| 12a | Max bid (auto-bid) | W | 1.0 |
| 12b | Watchlist and alerts | W | 0.5 |
| 12c | Flights (bid on several slots at once) | W | 1.0 |
| | **Launch total** | | **6.0** |

### Phase 4: Payments (Stripe Connect, card only)
| # | Item | | Weeks |
|---|---|---|---|
| 13 | Seller Stripe onboarding and status; slots can't go live until verified | L | 1.0 |
| 14 | Saved card, 3-D Secure, "Confirm payment" charge of price + media VAT, failed-card flow | L | 1.5 |
| 15 | Double-entry ledger; Stripe webhooks counted once | L | 1.5 |
| 16 | Release and transfer, payout tracking, 5-working-day auto-release with day 3 and day 1 reminders, working days and holidays per market | L | 1.5 |
| 17 | Refunds (full and partial), cancellation rules, refund-cost recovery from payouts, chargebacks as disputes | L | 1.5 |
| 18 | Daily reconciliation with Stripe; holding-deadline warning to admin | L | 1.0 |
| | **Phase total** | | **8.0** |

### Phase 5: Fulfilment
| # | Item | | Weeks |
|---|---|---|---|
| 19 | Booking brief and automatic checks (blocked categories, missing landing page, creative to follow) | L | 1.0 |
| 19a | Competitive separation check | W | 0.5 |
| 20 | Private file storage with virus scan and expiring links; creative upload against specs; change rounds where technical resubmissions don't count (owner #9) | L | 1.5 |
| 21 | Proof with per-channel checklist; buyer review | L | 1.0 |
| 22 | 48-hour pre-run check | L | 0.5 |
| 23 | Report an issue, escalation to dispute, admin's four outcomes, make-good reruns | L | 1.5 |
| | **Launch total** | | **5.5** |

### Phase 6: Invoicing (owner's invoice plan, SPEC 11.2)
| # | Item | | Weeks |
|---|---|---|---|
| 24 | Structured invoice data, separate numbering per document type, TRNs, VAT and timing as settings, 5-year retention | L | 1.0 |
| 25 | Insertion order, receipt, media tax invoice on the publisher's behalf, fee tax invoice, credit notes; PDFs with Arabic text | L | 1.5 |
| 26 | Monthly payout statement (CSV) | L | 0.5 |
| 26a | Connection to an accredited e-invoicing provider | **Decide** | 2.0 |
| 26b | Client report for buyers | W | 0.5 |
| | **Launch total** | | **3.0** |

26a is needed for launch only if, on the launch date, Nashr or any publisher it invoices for is already inside the compulsory e-invoicing phase. Otherwise it can wait until before the date that applies (owner's timeline: 1 January 2027 above AED 50 million revenue, 1 July 2027 for others). The provider's own fees are extra.

### Phase 7: Messaging and notifications
| # | Item | | Weeks |
|---|---|---|---|
| 27 | In-app messages between buyer and seller; emails and phone numbers blocked, doubtful ones flagged | L | 1.0 |
| 28 | Notification bell and email: templates, preferences, essential emails always on | L | 1.5 |
| | **Phase total** | | **2.5** |

### Phase 8: Screens
| # | Item | | Full | Partial |
|---|---|---|---|---|
| 29 | Public pages, request access, KSA coming soon with waiting list, Athena coming soon | L | 0.75 | 0.5 |
| 30 | Buyer: calendar at the centre, bid desk, bid form, buy-now, quick sale, payment, creative, proof review, account and receipts, notifications | L | 5.0 | 3.5 |
| 31 | Buyer: campaigns with budget meter; directory with the three price levels and request a quote | L | 2.0 | 1.5 |
| 32 | Seller: dashboard, calendar (week and programme), inbox, deals, earnings, rate card, placement forms | L | 4.5 | 3.0 |
| 33 | Admin: all 15 pages with search, filters and CSV export; founder reports needed at launch (revenue, GMV and take rate, money position, funnel, activation, supply, demand, quality, failures, refund losses) | L | 5.0 | 4.5 |
| 33a | Remaining founder reports (prices, top lists, retention, cross-border) and the weekly email | W | 1.5 | 1.5 |
| | **Launch total** | | **17.25** | **13.0** |

Admin barely changes between options: most of it does not exist in the prototype (SPEC section 6D).

### Phase 9: Launch readiness
| # | Item | | Weeks |
|---|---|---|---|
| 34 | End-to-end tests of the brief's 26 scenarios plus the gap scenarios | L | 1.5 |
| 35 | Security review, monitoring and alerts on background jobs, restore drill | L | 1.0 |
| 36 | Pilot with invited publishers and buyers in staging, then fixes | L | 2.0 |
| 36a | Log-in-as-user view for support | W | 0.5 |
| | **Launch total** | | **4.5** |

---

## Totals (needed for launch)

| | Full rebuild | Partial rebuild |
|---|---|---|
| Design (designer-weeks) | 6.0 | 2.5 |
| Server and back end (phases 1–7, 9) | 40.0 | 40.0 |
| Screens (phase 8) | 17.25 | 13.0 |
| **Development (developer-weeks)** | **57.25** | **53.0** |
| One developer, design overlapping the build | about 13–14 months | about 12–13 months |
| Two developers (server and screens in parallel) | about 7–8 months | about 6.5–7.5 months |

Can wait, if wanted later: about 6 developer-weeks (items marked W), plus e-invoicing provider connection 2 weeks if not needed at launch.

**Not priced (later phase, per the brief):** opening KSA (and possibly a second payment provider), several users per company with roles, full right-to-left layout, Athena, anti-sniping, WhatsApp/SMS, calendar sync and publisher API, mobile app.

**Running costs (not development):** AWS in Nashr's name (two environments, minimum services; to be sized with the AWS calculator against the owner's fixed monthly budget), Stripe fees per payment, e-invoicing provider fees, email sending.

## Risks and mitigations
| Risk | Impact | Mitigation |
|---|---|---|
| Card only: large bookings hit card limits or 3-D Secure failures | High | Failure report from day one; revisit bank transfer after the pilot |
| Stripe account not ready until the licence | High | Build against Stripe test mode as soon as a test account exists |
| E-invoicing deadline lands near launch | Medium | Structured invoice data from day one; provider connection priced separately |
| Invoicing on publishers' behalf needs legal and accountant sign-off | Medium | Publisher agreement and buyer terms must state the disclosed-agent role before launch |
| Design approvals slip | Medium | Server build runs in parallel; screens follow approved sections only |

## Open questions
- Who designs: the developer or a separate designer?
- Developer day rate, to turn weeks into cost.
- One developer or two?
- Accountant: conditions for invoicing on publishers' behalf; VAT on cancellation fees.

Detailed per-task acceptance criteria go into `tasks/todo.md` once the owner picks an option.
