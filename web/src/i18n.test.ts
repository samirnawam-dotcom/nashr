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
        'Position {n}', 'Break {n}', 'from 1 buyer · {month} buyers this month', 'from {n} buyers · {month} buyers this month'])
    const missing = [...new Set([...used.map(u => u.key), ...dynamic])].filter(k => !(k in AR))
    expect(missing).toEqual([])
    const bad = Object.entries(AR).filter(([en, ar]) => [...en.matchAll(/\{\w+\}/g)].map(m => m[0]).sort().join() !== [...ar.matchAll(/\{\w+\}/g)].map(m => m[0]).sort().join())
    expect(bad).toEqual([])
  })
})
