import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { AR } from './i18n-ar'
import { SERVER_AR } from './i18n-server'
import { AUDIENCES } from '../../server/shared/audiences'
import { INDUSTRY_PAGES } from './public/Segments'

const SRC = new URL('.', import.meta.url).pathname
const files = (dir: string): string[] => readdirSync(dir).flatMap(f => { const p = join(dir, f); return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) && !/\.test\./.test(f) ? [p] : [] })
const strings = (re: RegExp) => files(SRC).flatMap(f => [...readFileSync(f, 'utf8').matchAll(re)].map(m => ({ file: f.slice(SRC.length), key: m[2].replace(/\\(['"])/g, '$1') })))

describe('Arabic', () => {
  test('every string marked with t() has an Arabic translation, with the same {placeholders}', () => {
    const used = strings(/\bt\(\s*(["'])((?:\\.|(?!\1).)*)\1/g)
    // Keys looked up at run time: the FAQ, time-of-day labels, view names and price labels from the server.
    const seo = readFileSync(join(SRC, 'seo.ts'), 'utf8'), faq = seo.slice(seo.indexOf('export const FAQ'), seo.indexOf(']\n\n', seo.indexOf('export const FAQ')))
    const dynamic = [...faq.matchAll(/'((?:\\'|[^'])+)'/g)].map(m => m[1].replace(/\\'/g, "'"))
      .concat(['Morning (5–12)', 'Afternoon (12–17)', 'Evening (17–24)', 'All day (pages, takeovers)', 'Day', 'Week', 'Month', 'Typical on Nashr', 'Estimate, unconfirmed', "Publisher's rate",
        '{n} positions', '{n} breaks', 'No slots match these filters this week.', 'No slots match these filters this day.', 'No slots match these filters this month.',
        // buyer stage: status, tracker step, proof and industry labels; saved-search summaries
        'Awaiting publisher', 'Accepted, pay now', 'Payment secured', 'Proof ready, review', 'Issue reported', 'Disputed', 'Released', 'Complete', 'Not selected', 'Lapsed', 'Cancelled', 'Refunded',
        'Requested', 'Accepted', 'Paid', 'Aired', 'As-run log', 'Audio clip', 'Video clip', 'Tearsheet', 'Dated screenshots', 'Start time', 'End time', 'Episode link', 'Live link', 'Time of the ad in the episode',
        'Banking', 'Real estate', 'Retail', 'Technology', 'Hospitality', 'Health', 'Automotive', 'Education', 'Government', 'Other',
        'Crypto & trading', 'Alcohol & nightlife', 'Lottery & gaming', 'fixed price', 'Booking', 'Full week',
        ...AUDIENCES.flatMap(a => [a[1], a[2]]), ...INDUSTRY_PAGES.flatMap(p => [p[2], p[3]]),
        'All channels', 'under {price}', 'morning', 'afternoon', 'evening', 'all day', 'auctions', 'quick sales', ', ', '1 booking', '{n} bookings',
        '1 paid booking, released to the publisher only after you approve proof.', '{n} paid bookings, released to publishers only after you approve proof.', '1 accepted booking', '{n} accepted bookings',
        '1 new slot matches your search “{name}”.', '{n} new slots match your search “{name}”.', 'Turn off alerts for {name}', 'Turn on alerts for {name}',
        // publisher stage: statuses, tasks, slot and bid states, filters, timeline events, creative, reject and issue reasons, days, channels, steps
        'Your decision', 'Accepted, buyer paying', 'Paid, to fulfil', 'Proof with buyer', 'With Nashr', 'Paid out', 'Declined', 'Buyer did not pay',
        'On sale', 'Choose next bid', 'Booked', 'Off sale', 'Unavailable (overlaps a booking)', 'Unsold', 'Decide', 'Choose a bid', 'Review', 'Send proof', 'Respond', 'Confirm', 'Upload', 'Open',
        'Accept or decline', 'Choose the next bid', 'Review creative', 'Creative not received', 'Respond to an issue', 'Confirm the pre-run check', 'Upload your invoice',
        'Bid', 'Auto-bid', 'Buy now', 'Interest', 'active', 'outbid', 'selected', 'not selected', 'withdrawn', 'All', 'To decide', 'In progress', 'Completed', 'Closed',
        'Request received', 'You accepted', 'You declined', 'Expired without a decision', 'Another request was accepted', 'Buyer paid', 'Buyer did not pay in time', 'You sent proof',
        'Buyer approved', 'Released automatically', 'Buyer reported an issue', 'Corrected proof accepted', 'Make-good agreed', 'Partial refund agreed', 'Escalated to Nashr', 'Nashr released',
        'Paid to your bank', 'Buyer cancelled', 'You cancelled', 'Released: creative not received', 'Refunded: proof not sent in time',
        'Waiting for your review', 'Approved', 'Changes requested', 'Technical problem', 'Rejected', "Doesn't match the booking brief", 'Breaks content standards', 'Wrong specifications',
        'Other (Nashr reviews it)', 'The ad did not run', 'Wrong time or date', 'Wrong position or page', 'The creative was altered', 'Poor quality', 'Something else',
        'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'TV', 'radio', 'print', 'digital', 'podcast', 'Radio', 'Print', 'Digital', 'Podcast', 'English', 'Arabic', 'Bilingual',
        'Needs your decision', 'Off sale or taken', 'Add your outlet profile', 'Connect your payout account', 'Add your TRN and invoice choice', 'Add your first placement', 'Put slots on sale',
        'Position {n}', 'Break {n}', 'from 1 buyer · {month} buyers this month', 'from {n} buyers · {month} buyers this month',
        // admin stage: setting names and hints, ledger accounts, timeline events, money, creative and issue states, roles
        "Default commission", "basis points: 1200 = 12%", "VAT on media", "basis points", "Nashr is VAT-registered", "true / false", "VAT on Nashr commission", "Nashr legal name on documents", "Nashr's TRN", "null until registered", "Publisher decision window", "hours", "Payment window", "hours, capped by the creative deadline", "Minimum bid step", "basis points: 300 = 3%", "Next-bid choices before relisting", "Buyer proof review", "working days", "Proof due after the run", "Creative change rounds", "Publisher response to an issue", "Pre-run check before air", "Free cancellation after payment", "Publisher keeps on late cancellation", "Card processing estimate", "Card processing fixed part", "fils", "Media invoice issued at", "\"payment\" or \"run\"", "UAE public holidays", "list of dates, affects working days", "Question extension", "Cash at the payment provider", "Everything paid in, less refunds and payouts", "Held for bookings", "Paid by buyers, not yet released or refunded", "Owed to publishers", "Released, waiting for transfer", "Owed by publishers", "Refund costs at their fault, deducted from next payout", "Nashr commission", "Earned on released bookings", "VAT on commission", "Only while Nashr is VAT-registered", "Refund card costs", "Positive: still to recover · negative: recovered", "opened", "accept", "decline", "expire", "supersede", "pay", "lapse", "submit proof", "approve", "auto release", "report issue", "resolve", "make good", "partial refund", "escalate", "release", "refund", "paid out", "cancel by buyer", "cancel by seller", "creative missed", "proof missed", "charge", "transfer", "failed", "pending", "succeeded", "open", "answered", "resolved", "escalated", "closed", "approved", "changes requested", "technical issue", "rejected", "brief mismatch", "content standards", "wrong specs", "other", "did not run", "wrong time", "wrong position", "creative altered", "quality", "admin", "founder", "active", "suspended", "invited", "buyer", "seller", "tv", "Pending", "More information asked", "Approved", "Rejected", "Brand", "Agency", "Media outlet", "Next bid chosen", "Default rate", "Released to you", "Paid to your bank", "Deducted (refund costs)", "The buyer withdrew the request", "Waiting for a decision", "Publisher deciding", "Publisher choosing next bid", "Markets open for booking", "country codes", "Requested or won", "Accepted by publisher", "Paid", "Released"])
    const missing = [...new Set([...used.map(u => u.key), ...dynamic])].filter(k => !(k in AR))
    expect(missing).toEqual([])
    const bad = Object.entries(AR).filter(([en, ar]) => [...en.matchAll(/\{\w+\}/g)].map(m => m[0]).sort().join() !== [...ar.matchAll(/\{\w+\}/g)].map(m => m[0]).sort().join())
    expect(bad).toEqual([])
  })

  test('every message the server can send has Arabic, with the same number of values', () => {
    const SERVER = join(SRC, '../../server')
    // A string or template literal; a template's ${…} becomes {} (a value the server fills in).
    const LIT = /'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"|`((?:\\.|\$\{(?:[^{}]|\{[^{}]*\})*\}|[^`\\$]|\$(?!\{))*)`/g
    const lits = (expr: string) => [...expr.matchAll(LIT)].map(m => m[3] != null ? m[3].replace(/\$\{(?:[^{}]|\{[^{}]*\})*\}/g, '{}') : (m[1] ?? m[2]).replace(/\\(['"])/g, '$1'))
    /** The text of a call's arguments, from just after "(" to its matching ")". */
    const args = (s: string, i: number) => { let depth = 1, j = i
      while (depth && j < s.length) { const c = s[j]
        if (`'"\``.includes(c)) { const m = s.slice(j).match(/^('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|\$\{(?:[^{}]|\{[^{}]*\})*\}|[^`\\$]|\$(?!\{))*`)/); j += m ? m[0].length : 1; continue }
        if (c === '(') depth++; else if (c === ')') depth--; j++ }
      return s.slice(i, j - 1) }
    const prose = (x: string) => / /.test(x) && /[A-Za-z]{3}/.test(x) && !/^(select|insert|update|delete|with) /i.test(x)
    const found = new Set<string>()
    for (const f of files(SERVER).filter(f => !/seed|\/test\//.test(f))) {
      const s = readFileSync(f, 'utf8')
      // Errors, brief checks and timeline notes: every literal in the call.
      for (const m of s.matchAll(/new (?:MarketError|StripeError)\(|\bfail\(\s*\d+\s*,|\bout\.push\(|\btransition\(/g))
        lits(args(s, m.index! + m[0].length)).filter(prose).forEach(x => found.add(x))
      // Values the screens show: error bodies, reasons, card failures, ledger references, receipt and invoice lines and notes.
      for (const m of s.matchAll(/\b(?:error|reason|failure|ref|description|note):\s*(?=['"`])/g))
        lits(s.slice(m.index! + m[0].length).match(/^('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|\$\{(?:[^{}]|\{[^{}]*\})*\}|[^`\\$]|\$(?!\{))*`)/)![0]).filter(prose).forEach(x => found.add(x))
    }
    found.add('This overlaps {} on {} of the same days.'); found.add('Corrected proof') // built in a .map() and inside SQL
    expect(found.size).toBeGreaterThan(100)
    expect([...found].filter(k => !(k in SERVER_AR) && !(k in AR))).toEqual([])
    const values = (k: string) => (k.match(/\{\}/g) ?? []).length
    expect(Object.entries(SERVER_AR).filter(([k, v]) => new Set(v.match(/\{\d\}/g) ?? []).size !== values(k))).toEqual([])
  })
})
