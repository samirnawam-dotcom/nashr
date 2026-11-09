import { type Db, one } from '../core/db.js'
import { audit } from '../core/audit.js'
import { notify } from '../core/notify.js'
import { setting } from '../core/settings.js'
import { MarketError } from '../marketplace/market.js'
import { family } from '../shared/media.js'

// File rules per channel. A file that breaks them is a technical issue, which never counts as a change round (owner, SPEC 11.1 #9).
export const CREATIVE_SPECS: Record<string, { types: string[]; maxMb: number }> = {
  print: { types: ['application/pdf'], maxMb: 100 },
  digital: { types: ['image/png', 'image/jpeg', 'image/gif', 'application/zip', 'video/mp4'], maxMb: 50 },
  radio: { types: ['audio/wav', 'audio/mpeg'], maxMb: 100 },
  podcast: { types: ['audio/wav', 'audio/mpeg'], maxMb: 100 },
  tv: { types: ['video/mp4', 'video/quicktime'], maxMb: 2000 },
}
export const REJECT_REASONS = ['brief_mismatch', 'content_standards', 'wrong_specs', 'other'] as const

const context = (db: Db, dealId: string) => one(db,
  `select d.*, s.creative_due_at, o.channel from deals d join slots s on s.id = d.slot_id join placements p on p.id = s.placement_id
   join outlets o on o.id = p.outlet_id where d.id = $1`, [dealId])
const latest = async (db: Db, dealId: string) =>
  (await db.query(`select * from creatives where deal_id = $1 order by version desc limit 1 for update`, [dealId])).rows[0]

/** Buyers may upload from acceptance onward (SPEC 12.1) until the material deadline. */
export async function uploadCreative(db: Db, a: { dealId: string; buyerId: string; fileKey: string; fileType: string; fileSize: number }, at: Date) {
  const d = await context(db, a.dealId)
  if (d.buyer_id !== a.buyerId) throw new MarketError('This booking is not yours.')
  if (!['awaiting_payment', 'secured'].includes(d.status)) throw new MarketError('Creative can be sent once the publisher has accepted.')
  if (at >= d.creative_due_at) throw new MarketError('The material deadline has passed.')
  const prev = await latest(db, d.id)
  if (prev?.status === 'approved') throw new MarketError('The creative is already approved.')
  if (prev?.status === 'pending') throw new MarketError('The publisher is still reviewing your last file.')
  const spec = CREATIVE_SPECS[family(d.channel)]
  const problem = !spec.types.includes(a.fileType) ? `This file type isn't accepted for ${d.channel}. Use ${spec.types.join(', ')}.`
    : a.fileSize > spec.maxMb * 1024 * 1024 ? `The file is larger than ${spec.maxMb} MB.` : null
  const c = await one(db, `insert into creatives (deal_id, version, file_key, file_type, file_size, status, reason, uploaded_at, reviewed_at)
                           values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning *`,
    [d.id, (prev?.version ?? 0) + 1, a.fileKey, a.fileType, a.fileSize, problem ? 'technical_issue' : 'pending', problem, at, problem ? at : null])
  if (!problem) await notify(db, d.seller_id, 'creative.sent', d.id, { version: c.version }, at)
  return c
}

/** Seller review: approve, request changes (counts, max 2 unless allowed more), flag a technical issue (free), or reject with a reason. */
export async function reviewCreative(db: Db, a: { dealId: string; sellerId: string; decision: 'approve' | 'changes' | 'technical' | 'reject'; reason?: string }, at: Date) {
  const d = await context(db, a.dealId)
  if (d.seller_id !== a.sellerId) throw new MarketError('This booking is not yours.')
  const c = await latest(db, d.id)
  if (c?.status !== 'pending') throw new MarketError('There is no creative waiting for review.')
  let status = 'approved'
  if (a.decision === 'changes') {
    const { n } = await one(db, `select count(*)::int n from creatives where deal_id = $1 and status = 'changes_requested'`, [d.id])
    if (n >= await setting<number>(db, 'max_creative_rounds', at) + d.extra_creative_rounds)
      throw new MarketError('Both change rounds are used. Approve the creative or reject it with a reason.')
    if (!a.reason?.trim()) throw new MarketError('Say what needs to change.')
    status = 'changes_requested'
  }
  if (a.decision === 'technical') status = 'technical_issue'
  if (a.decision === 'reject') {
    if (!REJECT_REASONS.includes(a.reason as any)) throw new MarketError('Choose a rejection reason.') // free-form rejection is not allowed
    status = 'rejected'
    if (a.reason === 'other') await audit(db, `seller:${a.sellerId}`, 'creative.rejected_other', 'deal', d.id, null, at) // goes to the admin for review
  }
  await db.query(`update creatives set status = $2, reason = $3, reviewed_at = $4 where id = $1`, [c.id, status, a.reason ?? null, at])
  await notify(db, d.buyer_id, `creative.${status}`, d.id, { version: c.version, reason: a.reason }, at)
  return status
}

export async function allowExtraRound(db: Db, dealId: string, actor: string, at: Date) {
  await db.query(`update deals set extra_creative_rounds = extra_creative_rounds + 1 where id = $1`, [dealId])
  await audit(db, actor, 'creative.extra_round_allowed', 'deal', dealId, null, at)
}
