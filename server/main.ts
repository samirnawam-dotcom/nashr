import { buildApp } from './api/app.js'
import { migrate } from './core/migrate.js'
import { pool } from './core/db.js'
import { sweep } from './marketplace/sweeper.js'
import { runMoneyOps } from './payments/payments.js'
import { FakeProvider, type PaymentProvider } from './payments/provider.js'

// The fake provider must never reach the live system (brief section 25).
function provider(): PaymentProvider {
  if (process.env.NODE_ENV === 'production') throw new Error('Set up the Stripe provider (task B5) before running in production.')
  return new FakeProvider()
}

await migrate()
const p = provider()
const app = buildApp({ provider: p, log: process.env.LOG_REQUESTS === '1' || undefined })
await app.listen({ port: Number(process.env.PORT ?? 3000), host: '0.0.0.0' })

// Background jobs every minute. Each is safe to run late or twice (SPEC 5.3).
const run = (name: string, job: () => Promise<unknown>) => job().catch(e => console.error(JSON.stringify({ t: new Date().toISOString(), job: name, error: String(e?.stack ?? e) })))
const jobs = [['sweeper', () => sweep(new Date())], ['money', () => runMoneyOps(p, new Date())]] as const
for (const [name, job] of jobs) run(name, job) // once now, so /api/health is green from the start
const timers = jobs.map(([name, job]) => setInterval(() => run(name, job), 60_000))
console.log(`Nashr API on :${process.env.PORT ?? 3000}`)

// Deploys send SIGTERM: stop taking requests, let the jobs' transactions finish, close the pool.
for (const sig of ['SIGTERM', 'SIGINT'] as const) process.once(sig, async () => {
  timers.forEach(clearInterval)
  await app.close()
  await pool.end()
  process.exit(0)
})
