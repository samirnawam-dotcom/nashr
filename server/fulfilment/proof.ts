import { type Db, one } from '../core/db.js'
import { notify } from '../core/notify.js'
import { transition } from '../marketplace/deals.js'
import { MarketError } from '../marketplace/market.js'

// Proof required per channel (brief 12A-B). The seller cannot send proof until every item is there.
export const PROOF_CHECKLIST: Record<string, { key: string; label: string }[]> = {
  print: [{ key: 'tearsheet', label: 'the tearsheet' }],
  digital: [{ key: 'screenshots', label: 'dated screenshots' }, { key: 'live_link', label: 'the live link' }, { key: 'start_time', label: 'the start time' }, { key: 'end_time', label: 'the end time' }],
  radio: [{ key: 'as_run_log', label: 'the as-run log' }, { key: 'audio_clip', label: 'the audio clip' }],
  tv: [{ key: 'as_run_log', label: 'the as-run log' }, { key: 'video_clip', label: 'the video clip' }],
  podcast: [{ key: 'episode_link', label: 'the episode link' }, { key: 'ad_time', label: 'the time of the ad in the episode' }, { key: 'audio_clip', label: 'the audio clip' }],
}

export function missingProof(channel: string, items: Record<string, unknown>) {
  return PROOF_CHECKLIST[channel].filter(i => !items[i.key]).map(i => i.label)
}

export async function checkProof(db: Db, dealId: string, items: Record<string, unknown>) {
  const { channel } = await one(db, `select o.channel from deals d join slots s on s.id = d.slot_id join placements p on p.id = s.placement_id
                                     join outlets o on o.id = p.outlet_id where d.id = $1`, [dealId])
  const missing = missingProof(channel, items)
  if (missing.length) throw new MarketError(`Add ${missing.join(' and ')} before sending proof.`)
}

export async function submitProof(db: Db, a: { dealId: string; sellerId: string; items: Record<string, unknown>; note?: string }, at: Date) {
  const d = await one(db, `select d.*, s.starts_at from deals d join slots s on s.id = d.slot_id where d.id = $1`, [a.dealId])
  if (d.seller_id !== a.sellerId) throw new MarketError('This booking is not yours.')
  if (at < (d.make_good_at ?? d.starts_at)) throw new MarketError('Proof can be sent once the ad has run.')
  await checkProof(db, d.id, a.items)
  await db.query(`insert into proofs (deal_id, items, note, submitted_at) values ($1, $2, $3, $4)`, [d.id, JSON.stringify(a.items), a.note ?? null, at])
  const deal = await transition(db, d.id, 'submit_proof', `seller:${a.sellerId}`, at)
  await notify(db, d.buyer_id, 'proof.ready', d.id, null, at)
  return deal
}
