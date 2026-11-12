import type { RouteFn } from './app.js'

/*
 * Results a buyer can hand to a client, and how a publisher's airtime is selling. Read-only views over deals and slots
 * Nashr already keeps; reach is the publisher's own estimate per airing or edition, labelled as such on screen.
 */
const uuid = (v: unknown) => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v) ? v : null
const PAID = `('secured', 'in_review', 'issue_open', 'disputed', 'released', 'paid_out')`

export function insightRoutes(route: RouteFn) {
  route('GET', '/api/buyer/results', ['buyer'], async ({ db, me, at }, req) => {
    const rows = (await db.query(`select d.id, d.ref, d.status, d.amount, coalesce(d.media_vat_bp, 0) vat_bp, s.label, s.starts_at, s.ends_at, brand_name(o) outlet, o.channel, o.reach,
        p.name placement, cmp.name campaign, cl.name client, (select count(*) from proofs pr where pr.deal_id = d.id)::int proofs
      from deals d join slots s on s.id = d.slot_id join placements p on p.id = s.placement_id join outlets o on o.id = p.outlet_id
      left join bids b on b.id = d.bid_id left join campaigns cmp on cmp.id = b.campaign_id left join clients cl on cl.id = d.client_id
      where d.buyer_id = $1 and d.status in ${PAID} and ($2::uuid is null or b.campaign_id = $2) and ($3::uuid is null or d.client_id = $3) order by s.starts_at`,
      [me.actAs.companyId, uuid(req.query.campaign), uuid(req.query.client)])).rows
    const items = rows.map(r => {
      const aired = new Date(r.ends_at ?? r.starts_at) <= at
      return { id: r.id, ref: r.ref, outlet: r.outlet, channel: r.channel, placement: r.placement, label: r.label, startsAt: r.starts_at, campaign: r.campaign, client: r.client,
        status: r.status, price: Number(r.amount), paid: Number(r.amount) + Math.round(Number(r.amount) * r.vat_bp / 10_000), aired, proof: r.proofs > 0,
        reach: aired ? r.reach : null }
    })
    const spend = items.reduce((n, i) => n + i.price, 0), aired = items.filter(i => i.aired)
    const reach = aired.reduce((n, i) => n + (i.reach ?? 0), 0), reachSpend = aired.filter(i => i.reach).reduce((n, i) => n + i.price, 0)
    const byChannel = Object.entries(items.reduce<Record<string, { bookings: number; spend: number; reach: number }>>((m, i) => {
      const c = (m[i.channel] ??= { bookings: 0, spend: 0, reach: 0 }); c.bookings++; c.spend += i.price; c.reach += i.reach ?? 0; return m }, {}))
      .map(([channel, v]) => ({ channel, ...v })).sort((a, b) => b.spend - a.spend)
    return { totals: { bookings: items.length, spend, aired: aired.length, withProof: items.filter(i => i.proof).length, reach,
      // cost per thousand people reached, only over airings whose publisher gave a reach figure
      cpm: reach > 0 ? Math.round(reachSpend / reach * 1000) : null }, byChannel, items }
  })

  route('GET', '/api/seller/insights', ['seller'], async ({ db, me, at }) => {
    const since = new Date(at.getTime() - 90 * 86_400_000)
    // slots whose sale has finished in the last 90 days: sold, or left unsold
    const per = (await db.query(`select p.id, p.name, brand_name(o) outlet, p.sale_type,
        count(*)::int slots, count(*) filter (where s.status = 'booked')::int sold,
        coalesce(sum(d.amount) filter (where s.status = 'booked'), 0)::bigint revenue,
        coalesce(sum(s.starting_price) filter (where s.status = 'booked'), 0)::bigint asked,
        coalesce(sum(s.starting_price) filter (where s.status in ('open', 'unsold')), 0)::bigint unsold_value
      from slots s join placements p on p.id = s.placement_id join outlets o on o.id = p.outlet_id
      left join lateral (select amount from deals x where x.slot_id = s.id and x.status in ${PAID} order by x.created_at desc limit 1) d on true
      where o.company_id = $1 and s.closes_at > $2 and s.closes_at <= $3 and s.status <> 'blocked' and s.kind = 'single'
      group by p.id, p.name, o.id, p.sale_type order by revenue desc, slots desc`, [me.actAs.companyId, since, at])).rows
    const sum = (k: string) => per.reduce((n, r) => n + Number(r[k]), 0)
    const slots = sum('slots'), sold = sum('sold'), revenue = sum('revenue'), asked = sum('asked')
    return {
      window: { from: since, to: at },
      totals: { slots, sold, sellThrough: slots ? Math.round(100 * sold / slots) : null, revenue, unsold: slots - sold, unsoldValue: sum('unsold_value'),
        // how far above the starting price airtime actually sold (auctions push it up; fixed prices sell at the price)
        uplift: asked ? Math.round(100 * (revenue - asked) / asked) : null },
      placements: per.map(r => ({ id: r.id, name: r.name, outlet: r.outlet, saleType: r.sale_type, slots: r.slots, sold: r.sold,
        sellThrough: r.slots ? Math.round(100 * r.sold / r.slots) : null, revenue: Number(r.revenue), averagePrice: r.sold ? Math.round(Number(r.revenue) / r.sold) : null })),
    }
  })
}
