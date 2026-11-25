import { describe, expect, test } from 'vitest'
import { briefIssues } from './BriefCheck'

const good = { advertiser: 'Northwind', industry: 'Retail', message: 'Winter sale: 30% off all jackets. Visit our Dubai Mall store today.', language: 'english', draftFileKey: 'k' }
const ids = (b: any, ctx: any = {}) => briefIssues(b, ctx).map(i => `${i.id}${i.must ? '!' : ''}`)

describe('Athena brief check', () => {
  test('a complete brief passes', () => expect(ids(good, { channel: 'radio' })).toEqual([]))
  test('what would be refused comes first and is marked must-fix', () => {
    expect(ids({ ...good, industry: 'Banking' }, { notAccepted: ['banking'] })).toContain('blocked!')
    expect(ids({ ...good, message: 'Call us on 050 123 4567 today' })).toContain('contact!')
    expect(ids({ ...good, notes: 'mail me at sara@northwind.ae' })).toContain('contact!')
    expect(ids({ ...good, landingUrl: 'northwind dot ae' })).toContain('url!')
    expect(ids(good, { channel: 'digital' })).toContain('nourl!')
    expect(ids({ ...good, draftFileKey: undefined })).toContain('creative!')
  })
  test('advice: call to action, a fuller message, a disclaimer for regulated industries, the outlet language', () => {
    expect(ids({ ...good, message: 'Winter jackets for the whole family, in every size.' })).toEqual(['cta'])
    expect(ids({ ...good, message: 'Jackets' })).toEqual(['short'])
    expect(ids({ ...good, message: 'اكتشف عروض الشتاء في متاجرنا الآن' })).toEqual([])
    expect(ids({ ...good, industry: 'Banking' })).toEqual(['disclaimer'])
    expect(ids({ ...good, industry: 'Banking', disclaimer: 'Licensed by the Central Bank of the UAE' })).toEqual([])
    expect(ids(good, { outletLanguage: 'arabic' })).toEqual(['lang'])
    expect(ids({ ...good, language: 'bilingual' }, { outletLanguage: 'arabic' })).toEqual([])
  })
})
