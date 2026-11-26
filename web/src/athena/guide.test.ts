import { describe, expect, test } from 'vitest'
import { answer, directoryHref, findPlaces, lookup } from './guide'

const rules = { seller_window_hours: 24, payment_window_hours: 48, proof_due_working_days: 2, review_working_days: 3, issue_response_hours: 48, free_cancel_hours: 24, cancel_fee_bp: 2000, max_creative_rounds: 2 }
const ask = (q: string, role: 'buyer' | 'seller' | 'admin' = 'buyer', path = '/dashboard') => answer(q, role, path, rules, '2026-11-25')

describe('Athena chat (rules only)', () => {
  test('answers how-to questions from the Help rules, with a way to get there', () => {
    const r = ask('how do I pay?')
    expect(r.text).toContain('48 hours')
    expect(r.links?.[0].href).toBe('/reports')
  })
  test('forgives typos and understands Arabic', () => {
    expect(ask('wht is autobid').text).toMatch(/most you will pay/)
    expect(ask('كيف أدفع').text).toContain('48 hours')
    expect(ask('أين فواتيري').links?.[0].href).toBe('/documents')
  })
  test('"take me to" goes to the page for the person\'s role', () => {
    expect(ask('take me to campaigns').links?.[0].href).toBe('/campaigns')
    expect(ask('open my calendar', 'seller').links?.[0].href).toBe('/schedule')
    expect(ask('where are the registrations', 'admin').links?.[0].href).toBe('/registrations')
  })
  test('each role gets its own answers', () => {
    expect(ask('when am I paid', 'seller').text).toContain('3 working days')
    expect(ask('how do I add a product', 'seller').links?.[0].href).toBe('/listings')
    expect(ask('how do I add a product', 'buyer').links?.[0]?.href).not.toBe('/listings')
  })
  test('a campaign sentence comes back as facts (chips) and a Directory search built from them', () => {
    const r = ask('TV in Abu Dhabi for a car launch 10-20 Dec under AED 30,000')
    expect(r.query).toMatchObject({ channels: ['tv'], sectors: ['Automotive'], dateFrom: '2026-12-10', dateTo: '2026-12-20', amount: 3_000_000 })
    const href = r.links![0].href, p = new URLSearchParams(href.split('?')[1])
    expect(href.startsWith('/directory?')).toBe(true)
    expect(p.get('channel')).toBe('tv'); expect(p.get('df')).toBe('2026-12-10'); expect(p.get('dt')).toBe('2026-12-20'); expect(p.get('max')).toBe('30000'); expect(p.get('sort')).toBe('fit')
    expect(r.links![1].href).toContain('/campaigns?new=1&athena=1')
    expect(directoryHref('radio for a bank', '2026-11-25')).toContain('sectors=Banking')
  })
  test('follow-ups change the last campaign: add TV, cheaper, only mornings, without radio, in Arabic too', () => {
    const first = ask('radio for a bank launch 1-14 dec about AED 40,000').query!
    const tv = answer('add TV', 'buyer', '/', rules, '2026-11-25', first).query!
    expect(tv.channels).toEqual(['radio', 'tv'])
    expect(answer('make it cheaper', 'buyer', '/', rules, '2026-11-25', tv).query!.amount).toBe(3_200_000)
    expect(answer('only morning shows', 'buyer', '/', rules, '2026-11-25', tv).query!.dayparts).toEqual(['morning'])
    expect(answer('without radio', 'buyer', '/', rules, '2026-11-25', tv).query!.channels).toEqual(['tv'])
    expect(answer('أضف التلفزيون', 'buyer', '/', rules, '2026-11-25', first).query!.channels).toEqual(['radio', 'tv'])
    expect(answer('اجعلها أرخص', 'buyer', '/', rules, '2026-11-25', first).query!.amount).toBe(3_200_000)
    // a new question is not a follow-up
    expect(answer('how do I pay?', 'buyer', '/', rules, '2026-11-25', first).query).toBeUndefined()
  })
  test('⌘K finds pages for the role, forgiving slips', () => {
    expect(findPlaces('campains', 'buyer')[0]?.href).toBe('/campaigns')
    expect(findPlaces('products', 'seller')[0]?.href).toBe('/listings')
    expect(findPlaces('الحملات', 'buyer')[0]?.href).toBe('/campaigns')
  })
  test('says when it does not know, and offers Nashr\'s team', () => {
    const r = ask('blah blah')
    expect(r.text).toMatch(/not sure/)
    expect(r.unknown).toBe(true)
    expect(r.links?.[0].href).toBe('/help')
  })
  test('greets with what the page is for', () => {
    expect(ask('hello', 'buyer', '/directory').text).toMatch(/This is the Directory/)
  })
  test('chat questions with slips, in English and Arabic', () => {
    expect(ask('how do i pya').text).toContain('48 hours')
    expect(ask('wher are my reciepts').links?.[0].href).toBe('/documents')
    expect(ask('اين فواتيري').links?.[0].href).toBe('/documents')
    expect(ask('كيف ادقع').text).toContain('48 hours')
  })
})

describe('Athena knows the owner\'s glossary', () => {
  const ask = (q: string, role: 'buyer' | 'seller' | 'admin' = 'buyer') => answer(q, role, '/directory', null, '2026-11-26').text
  test('what a word means, in the glossary\'s own words, with typos forgiven', () => {
    expect(ask('what is quick sale?')).toMatch(/^Quick sale: A sale type\. Buyers offer any amount/)
    expect(ask('what is quik sael')).toMatch(/^Quick sale:/)
    expect(ask('what does committed mean')).toMatch(/^Committed: In a campaign/)
    expect(ask('whats a bid drawer')).toMatch(/^Bid drawer:/)
    expect(ask('outbid')).toMatch(/^Outbid: Status: someone bid higher/)
    expect(ask('what does not selected mean')).toMatch(/^Not won:/) // the app's word for it
    expect(ask('what is reach')).toContain('For example: 120,000 listeners') // the owner's example
  })
  test('Calendar means something different to buyers and publishers', () => {
    expect(ask('what is calendar')).toMatch(/buyer's planner and tracker/)
    expect(ask('what is calendar', 'seller')).toMatch(/puts products on sale/)
  })
  test('Arabic questions find the same words', () => {
    expect(lookup('ما معنى مزاد', 'buyer')?.term.en).toBe('Auction')
    expect(lookup('ما هو البيع السريع', 'buyer')?.term.en).toBe('Quick sale')
    expect(lookup('ماذا يعني الحد الأدنى المقبول', 'seller')?.term.en).toBe('Minimum accepted')
    expect(lookup('ما معنى تطابق قريب', 'buyer')?.term.en).toBe('Close match')
  })
  test('what Nashr is, and who sees what, for each side', () => {
    expect(ask('what is Nashr?')).toMatch(/^Nashr is a media buying marketplace for the UAE/)
    expect(ask('can the publisher see my budget?')).toMatch(/never see your budget/)
    expect(ask('who sees my minimum?', 'seller')).toMatch(/never see your minimum accepted/)
  })
  test('the other answers still win where they fit better', () => {
    expect(answer('radio in Dubai for a bank launch in December about AED 20,000', 'buyer', '/directory', null, '2026-11-26').query).toBeTruthy()
    expect(ask('take me to my campaigns')).toMatch(/Campaigns/)
  })
})

test('an explicit "what does it mean" gets the meaning, not the how-to', () => {
  const ask = (q: string) => answer(q, 'buyer', '/directory', null, '2026-11-26').text
  expect(ask('ما معنى مزاد')).toMatch(/^Auction:/) // the bidding how-to also knows مزاد; the question asks for the meaning
  expect(ask('what is an auction')).toMatch(/^Auction:/)
  expect(ask('what is auto-bid?')).not.toMatch(/^Bid:/) // auto-bid is its own answer, not the word "Bid"
})

test('Arabic: who sees what, and what Nashr is', () => {
  const ask = (q: string, r: 'buyer' | 'seller' = 'buyer') => answer(q, r, '/directory', null, '2026-11-26').text
  expect(ask('هل يرى الناشر ميزانيتي؟')).toMatch(/never see your budget/)
  expect(ask('من يرى الحد الأدنى؟', 'seller')).toMatch(/never see your minimum accepted/)
  expect(ask('ما هي نشر؟')).toMatch(/^Nashr is a media buying marketplace/)
})
