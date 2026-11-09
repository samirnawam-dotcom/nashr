// Demo history for the dashboards: about twelve weeks of real-looking marketplace activity before today.
// Every booking goes through the real rules (bid or buy-now, close, accept, pay, creative, proof, approve, release),
// at plausible past times, so deals, ledger, documents and notifications all agree. Development and demo only.
import { pool, tx } from './core/db.js'
import { generateSlots } from './catalog/placements.js'
import { accept, acceptInterest, closeAuction, decline, MarketError, placeBid, requestBuyNow, showInterest } from './marketplace/market.js'
import { approve, confirmPayment, runMoneyOps } from './payments/payments.js'
import { uploadCreative, reviewCreative, CREATIVE_SPECS } from './fulfilment/creative.js'
import { submitProof, checklistFor } from './fulfilment/proof.js'
import { family } from './shared/media.js'
import { FakeProvider } from './payments/provider.js'
import { sweep } from './marketplace/sweeper.js'

const H = 3_600_000, DAY = 24 * H
const BRIEF = { advertiser: 'Demo brand', industry: 'Banking', message: 'Demo campaign', language: 'english', creativeToFollow: true }

/** Thrown when the next step would happen after "now": the booking stays where it is, like a live one. */
class NotYet extends Error {}

/** Same numbers every run: a small seeded random generator (mulberry32). */
function rng(seed: number) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 }
}

export async function seedHistory(o: { now: Date; demoBuyer: string; rivals: string[]; campaignId?: string; weeks?: number }) {
  const rand = rng(20261106), weeks = o.weeks ?? 12
  const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)]
  const provider = new FakeProvider()
  const today = o.now.toISOString().slice(0, 10)
  const monday = (d: Date) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10) }
  const from = monday(new Date(o.now.getTime() - weeks * 7 * DAY))
  const days = Math.round((Date.parse(today) - Date.parse(from)) / DAY)
  const listedAt = new Date(Date.parse(from) - 10 * DAY)

  // List the past weeks on every live publisher's placements.
  const placements = (await pool.query(`select p.id from placements p join outlets o on o.id = p.outlet_id join companies c on c.id = o.company_id
    where c.payouts_enabled and not p.archived`)).rows
  for (const p of placements) await tx(c => generateSlots(c, p.id, from, days, listedAt))

  const slots = (await pool.query(`select s.*, o.channel, p.close_lead_hours from slots s join placements p on p.id = s.placement_id join outlets o on o.id = p.outlet_id
    where s.starts_at >= $1 and s.starts_at < $2 and s.kind = 'single' and s.status = 'open' order by s.starts_at`, [from, new Date(o.now.getTime() + 21 * DAY)])).rows
  const start = Date.parse(from), span = o.now.getTime() - start
  let made = 0
  for (const s of slots) {
    const starts = new Date(s.starts_at), closes = new Date(s.closes_at), growth = Math.min((starts.getTime() - start) / span, 1) // 0 → 1 across the weeks
    const share = s.channel === 'radio' ? 0.16 : s.channel === 'tv' ? 0.3 : 0.45
    if (rand() > share * (0.35 + growth)) continue
    const buyer = rand() < 0.45 ? o.demoBuyer : pick(o.rivals)
    // Each step happens at a past moment; a step due after "now" stops the booking there (live bids, waiting requests).
    const t = (ms: number) => { if (ms >= o.now.getTime()) throw new NotYet(); return new Date(ms) }
    try {
      // How it was bought: auction (with a rival bid now and then), buy-now, or a quick-sale request.
      let deal: any, decidedAt: Date
      if (s.sale_type === 'quick_sale') {
        const at = t(starts.getTime() - (130 + rand() * 200) * H)
        const bid = await tx(c => showInterest(c, { slotId: s.id, buyerId: buyer, brief: BRIEF, campaignId: buyer === o.demoBuyer && rand() < 0.3 ? o.campaignId : undefined }, at))
        decidedAt = t(at.getTime() + (1 + rand() * 6) * H)
        deal = await tx(c => acceptInterest(c, bid.id, 'seller:seed', decidedAt))
      } else if (s.buy_now_price && rand() < 0.2) {
        const at = t(closes.getTime() - (20 + rand() * 80) * H)
        deal = await tx(c => requestBuyNow(c, { slotId: s.id, buyerId: buyer, brief: BRIEF, campaignId: buyer === o.demoBuyer && rand() < 0.3 ? o.campaignId : undefined }, at))
        decidedAt = t(at.getTime() + (1 + rand() * 8) * H)
        if (rand() < 0.08) { await tx(c => decline(c, deal.id, 'The break is held for a sponsor that week.', 'seller:seed', decidedAt)); continue }
        deal = await tx(c => accept(c, deal.id, 'seller:seed', decidedAt))
      } else {
        const step = Math.round(s.starting_price * (0.02 + rand() * 0.06) / 10_000) * 10_000
        const first = t(closes.getTime() - (40 + rand() * 90) * H)
        if (rand() < 0.5) await tx(c => placeBid(c, { slotId: s.id, buyerId: pick(o.rivals.filter(r => r !== buyer)), amount: s.starting_price, brief: BRIEF }, first))
        const amount = s.starting_price + step * (1 + Math.floor(rand() * 6))
        await tx(c => placeBid(c, { slotId: s.id, buyerId: buyer, amount, brief: BRIEF, campaignId: buyer === o.demoBuyer && rand() < 0.3 ? o.campaignId : undefined }, t(first.getTime() + (2 + rand() * 20) * H)))
        deal = await tx(c => closeAuction(c, s.id, closes))
        if (!deal) continue
        decidedAt = t(closes.getTime() + (1 + rand() * 10) * H)
        if (deal.status === 'awaiting_seller') {
          if (rand() < 0.07) { await tx(c => decline(c, deal.id, 'The creative category conflicts with a sponsor.', 'seller:seed', decidedAt)); continue }
          deal = await tx(c => accept(c, deal.id, 'seller:seed', decidedAt))
        }
      }
      made++
      if (rand() < 0.05) continue // never paid: the booking lapses when the timers run
      const paidAt = t(decidedAt.getTime() + (1 + rand() * 20) * H)
      await confirmPayment(provider, { dealId: deal.id, buyerId: buyer, paymentMethod: 'pm_card_4242' }, paidAt)
      const spec = CREATIVE_SPECS[family(s.channel)]
      const sentAt = t(paidAt.getTime() + (1 + rand() * 12) * H)
      if (sentAt < new Date(s.creative_due_at)) {
        await tx(c => uploadCreative(c, { dealId: deal.id, buyerId: buyer, fileKey: `seed/${deal.id}`, fileType: spec.types[0], fileSize: 2_000_000 }, sentAt))
        await tx(c => reviewCreative(c, { dealId: deal.id, sellerId: deal.seller_id, decision: 'approve' }, t(sentAt.getTime() + (1 + rand() * 6) * H)))
      }
      // After the run: proof, then the buyer approves (recent ones are still waiting for review).
      const proofAt = t(starts.getTime() + (2 + rand() * 20) * H)
      const items = Object.fromEntries(checklistFor(s.channel).map(i => [i.key, `${i.label} for ${s.label}`]))
      await tx(c => submitProof(c, { dealId: deal.id, sellerId: deal.seller_id, items }, proofAt))
      if (rand() < 0.06) continue
      const approvedAt = t(proofAt.getTime() + (4 + rand() * 60) * H)
      await tx(c => approve(c, deal.id, `buyer:${buyer}`, approvedAt))
      await runMoneyOps(provider, approvedAt)
    } catch (e) {
      // A rule said no (e.g. a conflicting package on the same airing): skip this one, like a real buyer would.
      if (!(e instanceof MarketError) && !(e instanceof NotYet)) throw e
    }
  }
  // Let the timers catch up (unsold past slots, lapsed payments, auto-releases) so the demo starts settled.
  while (await sweep(o.now, 1000) >= 1000) { /* next batch */ }
  return made
}
