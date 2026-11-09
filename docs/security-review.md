# Security review (F2), 5 Nov 2026

A second independent review of the whole branch then found no high-confidence vulnerabilities. Its two below-threshold items are fixed as 11 and 12 below.

An independent read-only review of the API, auth, files, payments and front end. I then reproduced each finding against the code and fixed it. Every fix has a test in `server/api/api.test.ts` under "security review fixes"; the three browser journeys pass with the protections on.

| # | Severity | Finding | Status |
|---|---|---|---|
| 1 | High | Request body could replace the deal and company ids in two actions (`creative-review`, report an issue), so a seller could reject another publisher's creative and a buyer could open an issue on someone else's deal | **Fixed.** Fields are passed explicitly, and unknown body fields are stripped on every route. The test reproduces the attack |
| 2 | Medium | Any client could make the server hold 100 MB per request (raw upload parser applied to every route, before sign-in) | **Fixed.** Raw bytes are accepted only on `POST /api/files`, only with a valid session, checked before reading |
| 3 | Medium | Some writes would accept form posts; protection relied on SameSite=Lax alone | **Fixed.** Writes from a foreign `Origin` are refused (`APP_ORIGIN` when web and API are on different hosts). Every write except an upload must be JSON |
| 4 | Medium | New placements had no schema: negative or fractional option prices were possible | **Fixed.** Strict schema (whole fils, at least AED 1), plus database `check` constraints on placements, slots, bids and deals |
| 5 | Low/Med | Some money-affecting settings were not founder-only, and values were not type-checked | **Fixed.** These are now founder-only: free cancellation hours, review and proof working days, Nashr's TRN and legal name, invoice timing, open markets. A setting keeps its type |
| 6 | Low | A second payment could start while the bank waited for 3-D Secure | **Fixed.** A charge in `requires_action` counts as in flight |
| 7 | Low | Sign-in: timing showed which emails exist; codes could be replayed within 90 s; rate limit behind a proxy and its memory; staff could not be suspended | **Fixed.** Constant-time check for unknown emails. Each authenticator code signs in once. `TRUST_PROXY=1` behind the load balancer. The limiter cleans up after itself. The founder can suspend admins |
| 8 | Low | Uploaded file type was whatever the uploader claimed | **Fixed.** The type is read from the file's bytes. Unknown files are `application/octet-stream`, which no channel accepts as creative |
| 9 | Low | No security headers | **Fixed for the API:** nosniff, frame-deny, CSP `default-src 'none'`, same-origin policies, HSTS in production. The web app's CSP is set at the edge (runbook) |
| 11 | Low | One side of a deal could put the other side's file id into proof or issue evidence, then download it (needs the file's random id) | **Fixed.** Only your own uploads can be attached, and downloads tie each kind of attachment to the side that sends it |
| 12 | Low | A single slot in a market that is not open could be opened by id | **Fixed.** Slot list and slot detail show open markets only |
| 10 | Note | The provider webhook handler trusts event contents | **Fixed.** Stripe's signature is checked on the raw body (and stale events refused), and the amount and currency must match the charge before a booking is marked paid; a mismatch alerts staff |

**Checked and found sound:**
- view-as is read-only
- the role checks
- every other route's ownership checks
- SQL: interpolation only from fixed whitelists
- no `dangerouslySetInnerHTML`, and links limited to http(s)
- file access rules
- money locking and idempotency
- generic 500 errors
- `npm audit --omit=dev`: 0 vulnerabilities

**Still to do before launch:**
- An external penetration test against the staging environment once AWS and Stripe are set up.
- Edge headers for the web app: CSP allowing self and Google Fonts, plus HSTS.
- Done: attempt limits are counted in Postgres and shared by every instance. Still per instance: live updates (move to Postgres LISTEN/NOTIFY before scaling out).
