import type { Db } from '../core/db.js'

/*
 * The pilot scorecard (docs/pilot-plan.md section 3): each measure with its target, read from the deal history for deals
 * booked in the period (Dubai dates). A measure with nothing to count yet says so instead of showing 0% or 100%.
 */
export type Measure = { key: string; value: number | null; done: number; of: number; target: number; better: 'higher' | 'lower'; unit: 'count' | 'share' }

export async function scorecard(db: Db, from: string, to: string): Promise<Measure[]> {
  const r = (await db.query(`
    with d as (
      select d.id, d.created_at, d.accepted_at, d.amount,
        (select min(at) from deal_events e where e.deal_id = d.id and e.event = 'accept') accept_at,
        (select min(at) from deal_events e where e.deal_id = d.id and e.event in ('decline', 'expire')) refused_at,
        (select min(at) from deal_events e where e.deal_id = d.id and e.event = 'pay') pay_at,
        (select min(at) from deal_events e where e.deal_id = d.id and e.event = 'lapse') lapse_at,
        (select min(at) from deal_events e where e.deal_id = d.id and e.event = 'submit_proof') proof_at,
        (select min(at) from deal_events e where e.deal_id = d.id and e.event = 'proof_missed') proof_missed_at,
        (select min(at) from deal_events e where e.deal_id = d.id and e.event = 'report_issue') issue_at,
        (select min(at) from deal_events e where e.deal_id = d.id and e.event in ('escalate', 'chargeback')) dispute_at,
        (select min(at) from deal_events e where e.deal_id = d.id and e.to_status = 'released') released_at,
        (select min(created_at) from money_ops m where m.deal_id = d.id and m.kind = 'transfer') payout_at
      from deals d where (d.created_at at time zone 'Asia/Dubai')::date between $1::date and $2::date)
    select
      count(*) filter (where pay_at is not null)::int paid,
      coalesce(sum(amount) filter (where pay_at is not null), 0)::bigint paid_value,
      count(*) filter (where accept_at is not null and accept_at - created_at <= interval '24 hours')::int accepted_24,
      count(*) filter (where accept_at is not null or refused_at is not null)::int answered,
      count(*) filter (where pay_at is not null and pay_at - accept_at <= interval '48 hours')::int paid_48,
      count(*) filter (where pay_at is not null or lapse_at is not null)::int pay_due,
      count(*) filter (where proof_at is not null)::int proof_sent,
      count(*) filter (where proof_at is not null or proof_missed_at is not null)::int proof_due,
      count(*) filter (where issue_at is not null and dispute_at is not null)::int disputes,
      count(*) filter (where released_at is not null and payout_at is not null
        and (payout_at at time zone 'Asia/Dubai')::date = (released_at at time zone 'Asia/Dubai')::date)::int payouts_same_day,
      count(*) filter (where released_at is not null)::int released
    from d`, [from, to])).rows[0]
  const share = (key: string, done: number, of: number, target: number, better: 'higher' | 'lower' = 'higher'): Measure =>
    ({ key, done, of, value: of ? done / of : null, target, better, unit: 'share' })
  return [
    { key: 'paid_bookings', value: r.paid, done: r.paid, of: 0, target: 30, better: 'higher', unit: 'count' },
    share('accepted_24h', r.accepted_24, r.answered, 0.8),
    share('paid_48h', r.paid_48, r.pay_due, 0.85),
    share('proof_on_time', r.proof_sent, r.proof_due, 0.95),
    share('issues_to_disputes', r.disputes, r.paid, 0.05, 'lower'),
    share('payouts_same_day', r.payouts_same_day, r.released, 1),
  ]
}

export const met = (m: Measure) => m.value == null ? null : m.better === 'higher' ? m.value >= m.target : m.value <= m.target
