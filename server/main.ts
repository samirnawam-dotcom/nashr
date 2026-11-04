import { buildApp } from './api/app.js'
import { migrate } from './core/migrate.js'
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
const app = buildApp({ provider: p })
await app.listen({ port: Number(process.env.PORT ?? 3000), host: '0.0.0.0' })

// Background jobs every minute. Each is safe to run late or twice (SPEC 5.3).
const every = (ms: number, job: () => Promise<unknown>) => setInterval(() => job().catch(e => console.error('job failed', e)), ms)
every(60_000, () => sweep(new Date()))
every(60_000, () => runMoneyOps(p, new Date()))
console.log(`Nashr API on :${process.env.PORT ?? 3000}`)
