// Load test: many buyers bidding on the same slots at once, through the real API, while others browse the calendar.
// Afterwards it checks what must hold under any load: no server errors, every slot has one leader at the highest maximum,
// bid numbers per slot have no gaps or repeats, and the leader's price never exceeds their maximum.
//
// Run against a local or staging copy, NEVER production: it adds test buyers and bids. Reseed afterwards (npm run seed).
//   DATABASE_URL=postgres://... LOAD_BASE=http://localhost:3000 npx tsx scripts/load-test.ts [buyers=40] [slots=5] [rounds=5]
import pg from 'pg'
import { randomBytes } from 'node:crypto'
import { sha256 } from '../server/auth/crypto.js'

if (process.env.NODE_ENV === 'production') { console.error('Not on production.'); process.exit(2) }
const BASE = process.env.LOAD_BASE ?? 'http://localhost:3000'
const [BUYERS, SLOTS, ROUNDS] = [Number(process.argv[2] ?? 40), Number(process.argv[3] ?? 5), Number(process.argv[4] ?? 5)]
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const BRIEF = { advertiser: 'Load Test Co', industry: 'Retail', message: 'Load test', language: 'english', creativeToFollow: true }

// Test buyers with a session each (made directly, so sign-in limits do not apply).
const run = randomBytes(3).toString('hex'), terms = (await db.query(`select value #>> '{}' v from settings where key = 'terms_version' order by valid_from desc limit 1`)).rows[0]?.v
const cookies: string[] = []
for (let i = 0; i < BUYERS; i++) {
  const c = (await db.query(`insert into companies (name, type) values ($1, 'buyer') returning id`, [`Load ${run} ${i}`])).rows[0].id
  const u = (await db.query(`insert into users (company_id, email, name, role, status, terms_version, terms_accepted_at, created_at) values ($1, $2, 'Load', 'buyer', 'active', $3, now(), now()) returning id`,
    [c, `load-${run}-${i}@example.test`, terms])).rows[0].id
  const token = randomBytes(24).toString('hex')
  await db.query(`insert into sessions (token_hash, user_id, created_at, expires_at, last_seen_at) values ($1, $2, now(), now() + interval '2 hours', now())`, [sha256(token), u])
  cookies.push(`nashr_session=${token}`)
}
const cookieName = (await fetch(BASE + '/api/me', { headers: { cookie: cookies[0] } })).status === 200 ? 'nashr_session' : null
if (!cookieName) { console.error('The test session was not accepted: check the session cookie name in server/auth.'); process.exit(1) }

const slots = (await db.query(`select s.id from slots s join placements p on p.id = s.placement_id join outlets o on o.id = p.outlet_id join companies c on c.id = o.company_id
  where s.status = 'open' and s.sale_type = 'auction' and s.closes_at > now() + interval '1 hour' and c.payouts_enabled order by s.closes_at limit $1`, [SLOTS])).rows.map(r => r.id)
if (!slots.length) { console.error('No open auction slots. Run npm run seed first.'); process.exit(1) }

type Hit = { ms: number; status: number; kind: string; error?: string }
const hits: Hit[] = []
async function hit(kind: string, url: string, cookie: string, body?: unknown) {
  const t0 = performance.now()
  const r = await fetch(BASE + url, { method: body ? 'POST' : 'GET', headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const text = await r.text()
  hits.push({ ms: performance.now() - t0, status: r.status, kind, error: r.status >= 400 ? text.slice(0, 120) : undefined })
  return r
}

console.log(`${BUYERS} buyers, ${slots.length} slots, ${ROUNDS} rounds against ${BASE}`)
const started = performance.now()
for (let round = 0; round < ROUNDS; round++) {
  await Promise.all(cookies.flatMap((cookie, i) => [
    (async () => {
      const slot = slots[(i + round) % slots.length]
      const s = await (await fetch(`${BASE}/api/slots/${slot}`, { headers: { cookie } })).json() as any
      const amount = s.minNextBid + Math.floor(Math.random() * 5) * 100_00
      const auto = Math.random() < 0.4
      await hit('bid', `/api/slots/${slot}/bids`, cookie, { amount, ...(auto ? { maxAmount: amount + Math.floor(Math.random() * 20) * 100_00 } : {}), brief: BRIEF })
    })(),
    hit('browse', `/api/slots/list?open=1&limit=50`, cookie),
  ]))
}
const seconds = (performance.now() - started) / 1000

// What must hold, whatever the load.
const problems: string[] = []
const errors = hits.filter(h => h.status >= 500)
if (errors.length) problems.push(`${errors.length} server errors`)
for (const id of slots) {
  const s = (await db.query(`select * from slots where id = $1`, [id])).rows[0]
  const bids = (await db.query(`select seq, buyer_id, amount, max_amount, status from bids where slot_id = $1 order by seq`, [id])).rows
  const seqs = bids.map(b => Number(b.seq))
  if (seqs.some((n, i) => n !== i + 1) || seqs.length !== Number(s.bid_seq)) problems.push(`slot ${id}: bid numbers ${seqs.length} for counter ${s.bid_seq}, with gaps or repeats`)
  if (!bids.length) continue
  const topMax = Math.max(...bids.filter(b => b.status !== 'withdrawn').map(b => Number(b.max_amount ?? b.amount)))
  if (Number(s.top_max) !== topMax) problems.push(`slot ${id}: leader's maximum ${s.top_max}, but the highest maximum bid is ${topMax}`)
  if (Number(s.top_amount) > Number(s.top_max)) problems.push(`slot ${id}: price ${s.top_amount} above the leader's maximum ${s.top_max}`)
  const leaders = new Set(bids.filter(b => b.status === 'active' && Number(b.amount) === Number(s.top_amount) && b.buyer_id === s.top_buyer_id).map(b => b.buyer_id))
  if (leaders.size !== 1) problems.push(`slot ${id}: ${leaders.size} leaders`)
}

const pctl = (xs: number[], p: number) => xs.length ? xs.sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))] : 0
for (const kind of ['bid', 'browse']) {
  const k = hits.filter(h => h.kind === kind), ms = k.map(h => h.ms)
  const by = Object.entries(k.reduce<Record<number, number>>((m, h) => (m[h.status] = (m[h.status] ?? 0) + 1, m), {})).map(([s, n]) => `${s}×${n}`).join(' ')
  console.log(`${kind.padEnd(6)} ${String(k.length).padStart(5)} requests  p50 ${pctl(ms, 0.5).toFixed(0)}ms  p95 ${pctl(ms, 0.95).toFixed(0)}ms  max ${Math.max(...ms).toFixed(0)}ms  [${by}]`)
}
const refused = Object.entries(hits.filter(h => h.status === 400).reduce<Record<string, number>>((m, h) => {
  const e = (JSON.parse(h.error ?? '{}').error ?? '').replace(/AED [\d,.]+/g, 'AED …'); m[e] = (m[e] ?? 0) + 1; return m }, {}))
if (refused.length) console.log('Refused (expected when buyers race for the same slot):', refused.map(([e, n]) => `${n}× "${e}"`).join('; '))
console.log(`${hits.length} requests in ${seconds.toFixed(1)}s (${(hits.length / seconds).toFixed(0)} per second)`)
await db.end()
if (problems.length) { console.error('LOAD TEST FAILED:\n- ' + problems.join('\n- ')); process.exit(1) }
console.log('Load test passed: no server errors, one leader per slot at the highest maximum, bid numbers gapless.')
