import { expect, test } from 'vitest'
import { containsContactDetails } from '../core/contact.js'
import { briefChecks, briefProblems } from './brief.js'

const ok = { advertiser: 'Northwind Fintech', industry: 'Banking', message: 'Business cards for growing companies', language: 'english' as const, draftFileKey: 'files/f1' }

test('a complete brief has no problems; a missing brief is refused', () => {
  expect(briefProblems(ok, 'radio')).toEqual([])
  expect(briefProblems(null, 'radio')).toEqual(['A booking brief is required with your first bid.'])
})

test('digital needs a landing page; message is at most 280 characters; the creative is always required', () => {
  expect(briefProblems({ ...ok, message: 'x'.repeat(281), draftFileKey: undefined }, 'digital')).toEqual([
    'What the ad will say must be 280 characters or fewer.',
    'A landing page link is required for digital placements.',
    'Upload the creative.',
  ])
  // "creative to follow" no longer stands in for the file: a seller never accepts something blind
  expect(briefProblems({ ...ok, draftFileKey: undefined, creativeToFollow: true }, 'radio')).toEqual(['Upload the creative.'])
})

test('emails and phone numbers are blocked in free text, including Arabic digits and spacing', () => {
  for (const t of ['call 050 123 4567', '+971-50-1234567', 'ahmed@northwind.ae', 'ahmed at northwind dot ae', 'رقم ٠٥٠١٢٣٤٥٦٧'])
    expect(containsContactDetails(t), t).toBe(true)
  for (const t of ['Ramadan 2026 campaign', 'Prices from AED 25,000', '30s spot at 07:15', 'Q4 2026: 3 flights'])
    expect(containsContactDetails(t), t).toBe(false)
  expect(briefProblems({ ...ok, notes: 'WhatsApp me on 0501234567' }, 'radio')).toEqual([
    'Remove the email or phone number from the notes. Talk to the publisher through Nashr messages.',
  ])
})

test('automatic checks inform the seller', () => {
  expect(briefChecks(ok, { channel: 'radio', sectors: ['Retail'] })).toEqual({ categoryAccepted: false, landingPageMissing: false, creativeToFollow: false })
  expect(briefChecks({ ...ok, draftFileKey: undefined, creativeToFollow: true }, { channel: 'digital', sectors: ['Banking'] })).toEqual({ categoryAccepted: true, landingPageMissing: true, creativeToFollow: true })
})
