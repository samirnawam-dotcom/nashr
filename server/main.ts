import { buildApp } from './api/app.js'
import { runOutbox } from './core/mail.js'
import { recordError, watch } from './core/watch.js'
import { reconcile } from './payments/payments.js'
import { migrate } from './core/migrate.js'
import { afterCommitSettled, pool } from './core/db.js'
import { shareLiveUpdates } from './core/live.js'
import { sweep } from './marketplace/sweeper.js'
import { runMoneyOps } from './payments/payments.js'
import { FakeProvider, type PaymentProvider } from './payments/provider.js'
import { StripeProvider } from './payments/stripe.js'
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Stripe when its keys are set (test keys first, then live). The fake provider must never reach the live system (brief section 25).
const { STRIPE_SECRET_KEY: sk, STRIPE_PUBLISHABLE_KEY: pk, STRIPE_WEBHOOK_SECRET: whsec } = process.env
function provider(): PaymentProvider {
  if (sk) {
    if (!pk || !whsec) throw new Error('Set STRIPE_PUBLISHABLE_KEY and STRIPE_WEBHOOK_SECRET together with STRIPE_SECRET_KEY.')
    if (process.env.NODE_ENV === 'production' && !sk.startsWith('sk_live_')) console.warn('Running in production with Stripe TEST keys: no real money moves.')
    // STRIPE_API_BASE points at a mock Stripe for end-to-end tests (e2e/mock-stripe.cjs); never in production.
    const base = process.env.STRIPE_API_BASE
    if (base && process.env.NODE_ENV === 'production') throw new Error('STRIPE_API_BASE is for tests only.')
    return new StripeProvider(sk, fetch, base ?? undefined)
  }
  // NASHR_DEMO=1: a public demo server on purpose, with demo payments (no real money moves). Never on the live system.
  if (process.env.NODE_ENV === 'production' && process.env.NASHR_DEMO !== '1')
    throw new Error('Set the Stripe keys (STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET) before running in production.')
  if (process.env.NASHR_DEMO === '1') console.warn('DEMO SERVER (NASHR_DEMO=1): demo payments, no real money moves.')
  return new FakeProvider()
}

/*
 * A demo server on shared hosting (NASHR_DEMO=1, the bundle beside it) fills itself on its very first start, so nobody needs a
 * terminal: the demo data, then fresh sign-in details written to demo-credentials.txt in the app folder (never served, owner only).
 * Only when there are no companies at all, under a lock so two starting copies cannot both do it; never on the live system.
 */
async function firstDemoStart() {
  const seed = fileURLToPath(new URL('./seed.mjs', import.meta.url)), creds = fileURLToPath(new URL('./demo-credentials.mjs', import.meta.url))
  if (process.env.NASHR_DEMO !== '1' || !existsSync(seed)) return
  const c = await pool.connect()
  try {
    if (!(await c.query(`select pg_try_advisory_lock(7310001) ok`)).rows[0].ok) return
    if ((await c.query(`select count(*)::int n from companies`)).rows[0].n > 0) return
    console.log('First start of a demo server: adding the demo data.')
    execFileSync(process.execPath, [seed], { stdio: 'inherit', env: process.env })
    const out = fileURLToPath(new URL('../demo-credentials.txt', import.meta.url))
    writeFileSync(out, execFileSync(process.execPath, [creds], { env: process.env }).toString(), { mode: 0o600 })
    chmodSync(out, 0o600)
    console.log(`Demo sign-in details saved in ${out}`)
  } finally { await c.query(`select pg_advisory_unlock(7310001)`).catch(() => {}); c.release() }
}

await migrate()
await firstDemoStart()
const stopLive = shareLiveUpdates() // live updates reach pages on every copy of the API
const p = provider()
if (p instanceof FakeProvider) p.prime('AED', Number((await pool.query(`select coalesce(sum(case when debit = 'cash' then amount else -amount end), 0) n from ledger_entries where 'cash' in (debit, credit) and currency = 'AED'`)).rows[0].n))
const app = buildApp({ provider: p, log: process.env.LOG_REQUESTS === '1' || undefined, stripe: sk ? { publishableKey: pk, webhookSecret: whsec } : undefined })
// cPanel shared hosting runs the app under Phusion Passenger, which owns the port: it is handed the server through one listen('passenger')
// (Passenger's own Node.js instructions); everywhere else the app listens on PORT.
const passenger = (globalThis as any).PhusionPassenger
if (passenger) { passenger.configure({ autoInstall: false }); await app.ready(); app.server.listen('passenger') }
else await app.listen({ port: Number(process.env.PORT ?? 3000), host: '0.0.0.0' })

// Background jobs every minute. Each is safe to run late or twice (SPEC 5.3).
const run = (name: string, job: () => Promise<unknown>) => job().catch(e => { recordError(`job ${name}`); console.error(JSON.stringify({ t: new Date().toISOString(), job: name, error: String(e?.stack ?? e) })) })
// The watch tells staff when something needs a person (staff alerts); the ledger check asks the provider at most every 10 minutes.
// A payout can land between reading the ledger and the provider, so a mismatch counts only when it shows twice, a minute apart.
let recon: { at: number; ok: boolean; misses: number } = { at: 0, ok: true, misses: 0 }
const reconciles = async () => {
  if (recon.ok && Date.now() - recon.at < 600_000) return true
  const ok = (await reconcile(p, 'AED')).ok
  recon = { at: Date.now(), ok, misses: ok ? 0 : recon.misses + 1 }
  return ok || recon.misses < 2
}
const jobs = [['sweeper', () => sweep(new Date())], ['money', () => runMoneyOps(p, new Date())], ['email', () => runOutbox(new Date())],
  ['watch', () => watch({ at: new Date(), reconciles })]] as const
for (const [name, job] of jobs) run(name, job) // once now, so /api/health is green from the start
const timers = jobs.map(([name, job]) => setInterval(() => run(name, job), 60_000))
console.log(`Nashr API on :${process.env.PORT ?? 3000}`)
if (process.env.STAFF_TWO_STEP === 'off') console.warn('WARNING: STAFF_TWO_STEP=off. Admin and founder accounts sign in with a password only. For testing; remove it before launch.')

// Deploys send SIGTERM: stop taking requests, let the jobs' transactions finish, close the pool.
for (const sig of ['SIGTERM', 'SIGINT'] as const) process.once(sig, async () => {
  timers.forEach(clearInterval)
  await app.close()
  await afterCommitSettled() // phone alerts already on their way go out first
  await stopLive()
  await pool.end()
  process.exit(0)
})
