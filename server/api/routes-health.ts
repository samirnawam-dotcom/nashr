import type { FastifyInstance } from 'fastify'
import { pool } from '../core/db.js'
import { reconcile } from '../payments/payments.js'
import type { PaymentProvider } from '../payments/provider.js'

/*
 * Health for the uptime monitor (docs/runbook.md). Public, so it says only ok / not ok per check, never amounts or ids.
 * 503 when anything needs a person: the database is down, the sweeper stopped, money is stuck, or the ledger and the provider disagree.
 */
export function healthRoute(app: FastifyInstance, deps: { provider: PaymentProvider; clock: () => Date }) {
  app.get('/api/health', async (_req, reply) => {
    const at = deps.clock(), checks: Record<string, boolean> = {}
    try {
      const r = (await pool.query(`select
          (select max(at) from audit_log where action = 'sweeper.heartbeat') heartbeat,
          (select min(created_at) from money_ops where status = 'pending' and kind <> 'charge') oldest_pending,
          (select count(*)::int from money_ops where status = 'failed' and kind <> 'charge') failed`)).rows[0]
      checks.database = true
      checks.sweeper = !!r.heartbeat && at.getTime() - r.heartbeat.getTime() < 5 * 60_000          // runs every minute
      checks.moneyFlowing = !r.oldest_pending || at.getTime() - r.oldest_pending.getTime() < 15 * 60_000 // payouts and refunds go out every minute
      checks.noFailedPayouts = r.failed === 0
      checks.ledgerReconciles = (await reconcile(deps.provider, 'AED')).ok
    } catch { checks.database = false }
    const ok = Object.values(checks).every(Boolean) && checks.database
    return reply.code(ok ? 200 : 503).header('cache-control', 'no-store').send({ ok, checks, at: at.toISOString() })
  })
}
