import { buildApp } from './api/app.js'
import { migrate } from './core/migrate.js'
import { pool } from './core/db.js'
import { sweep } from './marketplace/sweeper.js'
import { runMoneyOps } from './payments/payments.js'
import { FakeProvider, type PaymentProvider } from './payments/provider.js'
import { StripeProvider } from './payments/stripe.js'

// Stripe when its keys are set (test keys first, then live). The fake provider must never reach the live system (brief section 25).
const { STRIPE_SECRET_KEY: sk, STRIPE_PUBLISHABLE_KEY: pk, STRIPE_WEBHOOK_SECRET: whsec } = process.env
function provider(): PaymentProvider {
  if (sk) {
    if (!pk || !whsec) throw new Error('Set STRIPE_PUBLISHABLE_KEY and STRIPE_WEBHOOK_SECRET together with STRIPE_SECRET_KEY.')
    if (process.env.NODE_ENV === 'production' && !sk.startsWith('sk_live_')) console.warn('Running in production with Stripe TEST keys: no real money moves.')
    return new StripeProvider(sk)
  }
  if (process.env.NODE_ENV === 'production') throw new Error('Set the Stripe keys (STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET) before running in production.')
  return new FakeProvider()
}

await migrate()
const p = provider()
if (p instanceof FakeProvider) p.prime('AED', Number((await pool.query(`select coalesce(sum(case when debit = 'cash' then amount else -amount end), 0) n from ledger_entries where 'cash' in (debit, credit) and currency = 'AED'`)).rows[0].n))
const app = buildApp({ provider: p, log: process.env.LOG_REQUESTS === '1' || undefined, stripe: sk ? { publishableKey: pk, webhookSecret: whsec } : undefined })
await app.listen({ port: Number(process.env.PORT ?? 3000), host: '0.0.0.0' })

// Background jobs every minute. Each is safe to run late or twice (SPEC 5.3).
const run = (name: string, job: () => Promise<unknown>) => job().catch(e => console.error(JSON.stringify({ t: new Date().toISOString(), job: name, error: String(e?.stack ?? e) })))
const jobs = [['sweeper', () => sweep(new Date())], ['money', () => runMoneyOps(p, new Date())]] as const
for (const [name, job] of jobs) run(name, job) // once now, so /api/health is green from the start
const timers = jobs.map(([name, job]) => setInterval(() => run(name, job), 60_000))
console.log(`Nashr API on :${process.env.PORT ?? 3000}`)
if (process.env.STAFF_TWO_STEP === 'off') console.warn('WARNING: STAFF_TWO_STEP=off. Admin and founder accounts sign in with a password only. For testing; remove it before launch.')

// Deploys send SIGTERM: stop taking requests, let the jobs' transactions finish, close the pool.
for (const sig of ['SIGTERM', 'SIGINT'] as const) process.once(sig, async () => {
  timers.forEach(clearInterval)
  await app.close()
  await pool.end()
  process.exit(0)
})
