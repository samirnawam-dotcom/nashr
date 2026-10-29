# ADR-001: TypeScript on Node.js with PostgreSQL

## Status
Proposed

## Date
2026-10-29

## Context
Nashr's prototype is one 1 MB `index.html` of plain JavaScript. All rules (statuses, timers, fees, refunds, permissions) run in the browser and data lives in `localStorage`. The brief requires every rule to run on the server, money to reconcile with Stripe, timers to be reliable, and two simultaneous bids to never both win.

Requirements that drive the choice:
- Port a large body of existing JavaScript business logic (`sweepDeals`, `acceptDeal`, `refundDeal`, `marketStamp`, …) without rewriting it from scratch.
- Strong typing for money and role-specific response shapes, so a buyer response *cannot* contain the reserve price.
- First-class Stripe Connect SDK.
- Transactions and row locks for bidding and the state machine.
- Small team, small ops budget: as few moving parts as possible.

## Decision
**TypeScript (strict) on Node.js 22 LTS**, with **PostgreSQL 16** as the only stateful service.
Fastify + zod for the API, Kysely for typed SQL and migrations, a Postgres-backed sweeper for timers, the official `stripe` SDK, Vite for the front end built from the prototype's screens.

## Alternatives considered

### Python + Django
- Pros: Django admin gives searchable/filterable admin tables almost for free; mature ORM, migrations; excellent Stripe SDK.
- Cons: the prototype's rules and screens are JavaScript and would be rewritten in a second language; two languages for one small team; role-typed responses are weaker without a type checker.
- Rejected, narrowly. This is the strongest alternative. Choose it instead if the team is Python-first.

### PHP + Laravel (the stack of the DADO site)
- Pros: cheap hosting, team familiarity from DADO.
- Cons: same rewrite cost as Django; shared hosting can't run a reliable minute-level sweeper or SSE; weaker typing for money and permissions.
- Rejected.

### Go / Java / C#
- Pros: performance, strong typing.
- Cons: the performance is not needed (pilot scale is hundreds of slots, not millions); full rewrite of all logic and screens; slower to build.
- Rejected.

### Firebase / Supabase-style backend-as-a-service
- Pros: fast start, auth included.
- Cons: complex money transactions, row locks and an append-only ledger fight the model; rules risk drifting back into the client, which is the exact problem the brief names.
- Rejected.

## Consequences
- One language end to end; prototype logic moves to the server and becomes tested functions rather than being re-specified.
- Admin tables are not free (unlike Django); they come from the prototype's existing admin screens wired to the API.
- Postgres carries jobs, locks, real-time notifications and the ledger, so there is no Redis or queue service to run. Upgrade path if load grows: a dedicated queue.
- Team must be comfortable with TypeScript and SQL; both are common skills.
