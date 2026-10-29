# ADR-001: TypeScript full stack (React + Node.js) with PostgreSQL

## Status
Accepted (owner approved TypeScript, 29 October 2026)

## Date
2026-10-29 (revised the same day: full rebuild and redesign)

## Context
Nashr's prototype is one 1 MB `index.html` of plain JavaScript. All rules (statuses, timers, fees, refunds, permissions) run in the browser and data lives in `localStorage`. The brief requires every rule to run on the server, money to reconcile with Stripe, timers to be reliable, and two simultaneous bids to never both win.

**The developer has decided to rebuild everything from scratch with a full redesign** (buyer, seller, admin, founder). The prototype is kept only as the reference for behaviour. So reuse of prototype code is no longer a factor in the language choice.

Requirements that drive the choice:
- A rich, interactive UI: a live calendar heat map, bid desk, programme schedules, campaign planner, plus about 15 admin pages and 13 founder reports.
- Strong typing for money and role-specific response shapes, so a buyer response *cannot* contain the reserve price.
- A large admin surface: tables with search, filters, CSV export and edit forms.
- First-class Stripe Connect SDK; transactions and row locks for bidding and the state machine.
- Small team, small ops budget: as few moving parts as possible.

## Decision
**TypeScript everywhere**, with **PostgreSQL 16** as the only stateful service.
- Server: Node.js 22 LTS, Fastify + zod, Kysely (typed SQL and migrations), a Postgres-backed sweeper for timers, the official `stripe` SDK.
- Front end: a new React + TypeScript app (Vite) for buyer, seller, admin and founder, sharing the server's zod types.
- Admin tables: Refine inside the same React app; money actions and reports are custom screens.

## Alternatives considered

### Python + Django (with a React front end)
- Pros: Django admin gives searchable, filterable admin tables almost for free; mature auth, ORM and migrations; strong for future data work (Athena, reports).
- Cons: a redesigned interactive UI still needs React, so the project has two languages and the API types are duplicated by hand; timers and live updates usually add Celery, Redis and Channels; Django admin's look won't match a full redesign without extra work.
- Rejected, narrowly. This is the strongest alternative. Choose it if the team is Python-first.

### PHP + Laravel (Filament admin, Inertia + React front end)
- Pros: scheduler, queues and mail built in; Filament gives a polished admin quickly; large regional talent pool.
- Cons: still two languages with React; weaker typing for money and permissions; needs a proper server (not shared hosting) for reliable timers.
- Rejected. Viable if the maintaining team is PHP-based.

### Go / Java / C#
- Rejected: the performance is not needed at pilot scale, and they are slower to build a large UI-heavy product in.

### Firebase / Supabase-style backend-as-a-service
- Rejected: complex money transactions, row locks and an append-only ledger fight the model, and rules risk drifting back into the client, which is the problem the brief names.

## Consequences
- One language for server, buyer/seller app, admin and founder reports; request and response types are defined once and shared, so the client and server cannot drift apart.
- The full redesign needs a design phase (Figma) and owner sign-off before build, which adds time up front compared with reusing the prototype's screens.
- Admin tables are not free like Django admin; Refine covers most list, filter, search, export and edit pages, and the rest are custom.
- Postgres carries jobs, locks, real-time notifications and the ledger, so there is no Redis or queue service to run. Upgrade path if load grows: a dedicated queue.
- The prototype's rule functions (`sweepDeals`, `acceptDeal`, `refundDeal`, `marketStamp`, …) are used as a specification to write tests against, not copied.
