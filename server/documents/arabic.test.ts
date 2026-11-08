import { expect, test } from 'vitest'
import { shape, visual } from './arabic.js'
import { Page, textWidth } from './pdf.js'

const hex = (cs: number[]) => cs.map(c => c.toString(16))

test('letters take their joined forms: initial, medial, final, and isolated after a right-joining letter', () => {
  // سلام: seen initial, lam + alef as one ligature (final, joined to the seen), meem isolated (alef does not join forward)
  expect(hex(shape('سلام'))).toEqual(['feb3', 'fefc', 'fee1'])
  // دبي: dal isolated (joins nothing after), beh initial, yeh final
  expect(hex(shape('دبي'))).toEqual(['fea9', 'fe91', 'fef2'])
  expect(hex(shape('لا'))).toEqual(['fefb']) // lam-alef on its own: the isolated ligature
})

test('display order: Arabic runs right to left, numbers and English inside them keep their own order', () => {
  const show = (s: string) => String.fromCodePoint(...visual([...s].map(c => c.codePointAt(0)!)))
  expect(show('دبي 12')).toBe('12 يبد')
  expect(show('Order NSH-2026-1 دبي')).toBe('Order NSH-2026-1 يبد')   // starts in English: a left-to-right line
  expect(show('دبي Order NSH-2026-1')).toBe('Order NSH-2026-1 يبد')   // starts in Arabic: the English run sits to its left
  expect(show('دبي (2026-11-15)')).toBe('(2026-11-15) يبد') // brackets are mirrored in the right-to-left run
  expect(show('Invoice 12')).toBe('Invoice 12')          // Latin text is untouched
})

test('a PDF with Arabic embeds the Arabic face with a copy-out map; one without does not', () => {
  const latin = new Page(); latin.text('Tax invoice', 50, 60)
  expect(latin.pdf('x').toString('latin1')).not.toContain('FontFile2')
  const p = new Page(); p.text('إذاعة الخليج', 50, 60, 11, 'B')
  const pdf = p.pdf('x').toString('latin1')
  expect(pdf).toContain('/BaseFont /IBMPlexSansArabic-Bold')
  expect(pdf).toContain('/FontFile2')
  expect(pdf).toContain('/ToUnicode')
  expect(pdf).toMatch(/<[0-9a-f]{8,}> Tj/) // drawn by glyph number
  const start = Number(pdf.match(/startxref\n(\d+)/)![1])
  const offsets = pdf.slice(start).match(/^\d{10} 00000 n $/gm)!.map(l => Number(l.slice(0, 10)))
  offsets.forEach((o, i) => expect(pdf.slice(o, o + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`))
  expect(textWidth('إذاعة الخليج', 11, 'B')).toBeGreaterThan(40)
})

test('a whole document in Arabic: Arabic labels, the Arabic face, a right-to-left page; English stays as it was', async () => {
  const { documentPdf } = await import('./render.js')
  const d = { type: 'media_invoice', number: 'INV-2026-000021', dealRef: 'NSH-2026-000001', relatedNumber: null, onBehalf: true, taxDocument: true,
    issuer: { name: 'Skyline FM', trn: '100000000000003', address: null }, recipient: { name: 'Northwind Fintech', trn: null, address: null },
    items: [{ description: 'Skyline FM · Break 1 · 2026-11-15 · Order NSH-2026-000001', quantity: 1, unitPrice: 1300000 }],
    note: 'Issued by Nashr on behalf of Skyline FM.', currency: 'AED', subtotal: 1300000, vatBp: 500, vat: 65000, total: 1365000, issuedAt: '2026-11-08T10:00:00Z' }
  const ar = documentPdf(d, 'ar').toString('latin1'), en = documentPdf(d).toString('latin1')
  expect(ar).toContain('/BaseFont /IBMPlexSansArabic-Bold')       // the title, فاتورة ضريبية
  expect(ar).toMatch(/<[0-9a-f]{4}> <0641>/)                       // its letters copy out as Arabic (ف)
  expect(ar).toContain('(INV-2026-000021) Tj')                     // the number stays as it is
  expect(en).toContain('(Tax invoice) Tj')
  expect(en).not.toContain('IBMPlexSansArabic')
})
