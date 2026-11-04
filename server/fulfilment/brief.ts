import { containsContactDetails } from '../core/contact.js'

// The booking brief, required with every bid (brief section 10).
export type Brief = {
  advertiser: string; industry: string; message: string; language: 'arabic' | 'english' | 'bilingual'
  landingUrl?: string; draftFileKey?: string; creativeToFollow?: boolean; notes?: string
}

/** Returns plain-English problems, empty when the brief is complete. */
export function briefProblems(b: Partial<Brief> | null | undefined, channel: string): string[] {
  if (!b) return ['A booking brief is required with your first bid.']
  const out: string[] = []
  if (!b.advertiser?.trim()) out.push('Add the advertiser or brand.')
  if (!b.industry?.trim()) out.push('Choose the industry.')
  if (!b.message?.trim()) out.push('Say what the ad will say.')
  else if (b.message.length > 280) out.push('What the ad will say must be 280 characters or fewer.')
  if (!['arabic', 'english', 'bilingual'].includes(b.language as string)) out.push('Choose the creative language.')
  if (channel === 'digital' && !b.landingUrl) out.push('A landing page link is required for digital placements.')
  if (b.landingUrl && !/^https:\/\/\S+$/.test(b.landingUrl)) out.push('The landing page link must start with https://.')
  if (!b.draftFileKey && !b.creativeToFollow) out.push('Upload a draft of the creative or tick "creative to follow".')
  for (const [k, v] of Object.entries({ advertiser: b.advertiser, message: b.message, notes: b.notes }))
    if (containsContactDetails(v)) out.push(`Remove the email or phone number from ${k === 'notes' ? 'the notes' : k}. Talk to the publisher through Nashr messages.`)
  return out
}

/** Automatic checks shown to the seller before deciding. They inform, they never decide (brief section 10). */
export function briefChecks(b: Brief, outlet: { channel: string; sectors: string[] }) {
  return {
    categoryAccepted: outlet.sectors.length === 0 || outlet.sectors.includes(b.industry),
    landingPageMissing: outlet.channel === 'digital' && !b.landingUrl,
    creativeToFollow: !!b.creativeToFollow && !b.draftFileKey,
  }
}
