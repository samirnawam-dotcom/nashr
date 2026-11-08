import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { AR } from './i18n-ar'

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
        "Default commission", "basis points: 1200 = 12%", "VAT on media", "basis points", "Nashr is VAT-registered", "true / false", "VAT on Nashr commission", "Nashr legal name on documents", "Nashr's TRN", "null until registered", "Publisher decision window", "hours", "Payment window", "hours, capped by the creative deadline", "Minimum bid step", "basis points: 300 = 3%", "Next-bid choices before relisting", "Buyer proof review", "working days", "Proof due after the run", "Creative change rounds", "Publisher response to an issue", "Pre-run check before air", "Free cancellation after payment", "Publisher keeps on late cancellation", "Card processing estimate", "Card processing fixed part", "fils", "Media invoice issued at", "\"payment\" or \"run\"", "UAE public holidays", "list of dates, affects working days", "Question extension", "Cash at the payment provider", "Everything paid in, less refunds and payouts", "Held for bookings", "Paid by buyers, not yet released or refunded", "Owed to publishers", "Released, waiting for transfer", "Owed by publishers", "Refund costs at their fault, deducted from next payout", "Nashr commission", "Earned on released bookings", "VAT on commission", "Only while Nashr is VAT-registered", "Refund card costs", "Positive: still to recover · negative: recovered", "opened", "accept", "decline", "expire", "supersede", "pay", "lapse", "submit proof", "approve", "auto release", "report issue", "resolve", "make good", "partial refund", "escalate", "release", "refund", "paid out", "cancel by buyer", "cancel by seller", "creative missed", "proof missed", "charge", "transfer", "failed", "pending", "succeeded", "open", "answered", "resolved", "escalated", "closed", "approved", "changes requested", "technical issue", "rejected", "brief mismatch", "content standards", "wrong specs", "other", "did not run", "wrong time", "wrong position", "creative altered", "quality", "admin", "founder", "active", "suspended", "invited", "buyer", "seller", "tv", "Pending", "More information asked", "Approved", "Rejected", "Brand", "Agency", "Media outlet", "Next bid chosen", "Default rate", "Markets open for booking", "country codes", "Requested or won", "Accepted by publisher", "Paid", "Released"])
    const missing = [...new Set([...used.map(u => u.key), ...dynamic])].filter(k => !(k in AR))
    expect(missing).toEqual([])
    const bad = Object.entries(AR).filter(([en, ar]) => [...en.matchAll(/\{\w+\}/g)].map(m => m[0]).sort().join() !== [...ar.matchAll(/\{\w+\}/g)].map(m => m[0]).sort().join())
    expect(bad).toEqual([])
  })
})
