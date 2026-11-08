import { beforeEach, expect, test } from 'vitest'
import { pool, tx } from '../core/db.js'
import { changeSetting } from '../core/settings.js'
import { generateSlots } from '../catalog/placements.js'
import { accept, requestBuyNow } from '../marketplace/market.js'
import { FakeProvider } from '../payments/provider.js'
import { approve, cancelByBuyer, confirmPayment, runMoneyOps } from '../payments/payments.js'
import { submitProof } from '../fulfilment/proof.js'
import { payoutStatement, uploadMediaInvoice } from './documents.js'
import { AED, BRIEF, T, company, radio, reset, slot } from '../test/helpers.js'

const now = T('2026-11-01T08:00:00Z')
const h = (t: Date, n: number) => new Date(t.getTime() + n * 3_600_000)
const AFTER = T('2026-11-09T06:00:00Z')
const PROOF = { as_run_log: 'files/asrun.pdf', audio_clip: 'files/spot.mp3' }

let p: Awaited<ReturnType<typeof radio>>, buyer: string, provider: FakeProvider
beforeEach(async () => {
  await reset()
  provider = new FakeProvider()
  p = await radio(now, { buyNowPrice: AED(76_000) })
  await pool.query(`update companies set trn = '100000000000003' where id = $1`, [p.seller])
  await generateSlots(pool, p.placement, '2026-11-09', 1, now)
  buyer = await company('Northwind Fintech', 'buyer')
  await pool.query(`update companies set trn = '100000000000099' where id = $1`, [buyer])
})

async function paidDeal(label = 'Break 2', placement = p.placement) {
  const s = await slot(placement, '2026-11-09', label)
  const d = await tx(c => requestBuyNow(c, { slotId: s.id, buyerId: buyer, brief: BRIEF }, now))
  await tx(c => accept(c, d.id, 'seller', now))
  await confirmPayment(provider, { dealId: d.id, buyerId: buyer, paymentMethod: 'pm_card_4242' }, h(now, 1))
  return d.id as string
}
const docs = async (dealId?: string) => (await pool.query(
  `select type, number, issuer_id, on_behalf, tax_document, subtotal, vat, total, lines from documents where ($1::uuid is null or deal_id = $1) and type <> 'order' order by issued_at, ctid`,
  [dealId ?? null])).rows

test('on acceptance: the Order, from Nashr to the buyer, numbered as the order and not a tax document', async () => {
  const id = await paidDeal()
  const order = (await pool.query(`select x.type, x.number, x.issuer_id, x.recipient_id, x.tax_document, x.subtotal, x.vat, x.total, x.lines, d.ref, d.buyer_id
    from documents x join deals d on d.id = x.deal_id where x.deal_id = $1 and x.type = 'order'`, [id])).rows
  expect(order).toHaveLength(1)
  expect(order[0]).toMatchObject({ number: order[0].ref, issuer_id: null, recipient_id: order[0].buyer_id, tax_document: false,
    subtotal: AED(76_000), vat: AED(3_800), total: AED(79_800) })
  expect(order[0].lines.note).toMatch('not a tax invoice')
})

test('on payment: a receipt from Nashr and the publisher\'s tax invoice, issued on its behalf with both TRNs', async () => {
  const id = await paidDeal()
  const [receipt, invoice] = await docs(id)
  expect(receipt).toMatchObject({ type: 'receipt', number: 'RCT-2026-000001', issuer_id: null, tax_document: false, total: AED(79_800) })
  expect(receipt.lines.note).toBe('Received by Nashr on behalf of Skyline FM. This is not a tax invoice.')
  expect(invoice).toMatchObject({ type: 'media_invoice', number: 'INV-2026-000001', issuer_id: p.seller, on_behalf: true, tax_document: true,
    subtotal: AED(76_000), vat: AED(3_800), total: AED(79_800) })
  expect(invoice.lines.issuer).toMatchObject({ name: 'Skyline FM', trn: '100000000000003' })
  expect(invoice.lines.recipient).toMatchObject({ name: 'Northwind Fintech', trn: '100000000000099' })
  expect(invoice.lines.note).toBe('Issued by Nashr on behalf of Skyline FM.')
})

test('at release: Nashr\'s commission invoice; a tax invoice with VAT only once Nashr is VAT-registered', async () => {
  const a = await paidDeal('Break 2')
  await tx(c => submitProof(c, { dealId: a, sellerId: p.seller, items: PROOF }, AFTER))
  await tx(c => approve(c, a, `buyer:${buyer}`, h(AFTER, 1)))
  expect((await docs(a)).at(-1)).toMatchObject({ type: 'commission_invoice', number: 'NCI-2026-000001', tax_document: false, subtotal: AED(9_120), vat: 0 })

  await changeSetting(pool, 'nashr_vat_registered', true, 'founder', h(now, 2))
  const b = await paidDeal('Break 3') // accepted at `now`, before the switch: keeps the old rate (no fee VAT)
  await tx(c => submitProof(c, { dealId: b, sellerId: p.seller, items: PROOF }, AFTER))
  await tx(c => approve(c, b, `buyer:${buyer}`, h(AFTER, 1)))
  expect((await docs(b)).at(-1)).toMatchObject({ number: 'NCI-2026-000002', vat: 0 })
})

test('numbering is gapless per type and per issuer', async () => {
  await paidDeal('Break 2'); await paidDeal('Break 3')
  const other = await radio(now, { buyNowPrice: AED(10_000) })
  await generateSlots(pool, other.placement, '2026-11-09', 1, now)
  await paidDeal('Break 2', other.placement)
  const rows = (await docs()).filter(d => d.type === 'media_invoice').map(d => [d.issuer_id === p.seller ? 'skyline' : 'other', d.number])
  expect(rows).toEqual([['skyline', 'INV-2026-000001'], ['skyline', 'INV-2026-000002'], ['other', 'INV-2026-000001']])
  expect((await docs()).filter(d => d.type === 'receipt').map(d => d.number)).toEqual(['RCT-2026-000001', 'RCT-2026-000002', 'RCT-2026-000003'])
})

test('a cancellation fee: the invoice is credited in full and the kept 15% invoiced again', async () => {
  const id = await paidDeal()
  await tx(c => cancelByBuyer(c, id, buyer, h(now, 30)))
  const d = await docs(id)
  expect(d.map(x => [x.type, x.number, x.subtotal, x.vat])).toEqual([
    ['receipt', 'RCT-2026-000001', AED(79_800), 0],
    ['media_invoice', 'INV-2026-000001', AED(76_000), AED(3_800)],
    ['credit_note', 'CN-2026-000001', AED(76_000), AED(3_800)],
    ['media_invoice', 'INV-2026-000002', AED(11_400), AED(570)],
    ['commission_invoice', 'NCI-2026-000001', AED(1_368), 0],
  ])
})

test('publishers who issue their own invoices upload them; Nashr reminds them', async () => {
  await pool.query(`update companies set invoice_mode = 'upload' where id = $1`, [p.seller])
  const id = await paidDeal()
  expect((await docs(id)).map(d => d.type)).toEqual(['receipt'])
  expect((await pool.query(`select kind from notifications where company_id = $1 and kind like 'invoice.%'`, [p.seller])).rows).toEqual([{ kind: 'invoice.upload_needed' }])
  const doc = await tx(c => uploadMediaInvoice(c, { dealId: id, sellerId: p.seller, number: 'SKY/2026/0417', fileKey: 'files/inv.pdf' }, h(now, 3)))
  expect(doc).toMatchObject({ number: 'SKY/2026/0417', on_behalf: false, total: AED(79_800) })
})

test('invoice timing "run": the media invoice is issued when proof is sent', async () => {
  await changeSetting(pool, 'media_invoice_timing', 'run', 'founder', T('2026-10-01T00:00:00Z'))
  const id = await paidDeal()
  expect((await docs(id)).map(d => d.type)).toEqual(['receipt'])
  await tx(c => submitProof(c, { dealId: id, sellerId: p.seller, items: PROOF }, AFTER))
  expect((await docs(id)).map(d => d.type)).toEqual(['receipt', 'media_invoice'])
})

test('documents cannot be changed once issued', async () => {
  await paidDeal()
  await expect(pool.query(`update documents set total = 1`)).rejects.toThrow('append-only')
})

test('monthly payout statement (CSV)', async () => {
  const id = await paidDeal()
  await tx(c => submitProof(c, { dealId: id, sellerId: p.seller, items: PROOF }, AFTER))
  await tx(c => approve(c, id, `buyer:${buyer}`, h(AFTER, 1)))
  await runMoneyOps(provider, h(AFTER, 2))
  const ref = (await pool.query(`select ref from deals where id = $1`, [id])).rows[0].ref
  expect(await payoutStatement(pool, p.seller, '2026-11')).toBe([
    'Date,Order,Type,Amount,Currency',
    `2026-11-09,${ref},Released to you,70680.00,AED`,
    `2026-11-09,${ref},Paid to your bank account,-70680.00,AED`,
  ].join('\n'))
})
