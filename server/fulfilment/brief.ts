import { containsContactDetails } from '../core/contact.js'

// The booking brief, required with every bid (brief section 10).
export type Brief = {
  advertiser: string; industry: string; message: string; language: 'arabic' | 'english' | 'bilingual' | 'other'; languageOther?: string
  landingUrl?: string; draftFileKey?: string; creativeToFollow?: boolean; notes?: string
  disclaimer?: string   // a regulated advertiser's required wording or licence number (central bank, securities, land department)
}

/** Returns plain-English problems, empty when the brief is complete. */
export function briefProblems(b: Partial<Brief> | null | undefined, channel: string): string[] {
  if (!b) return ['A booking brief is required with your first bid.']
  const out: string[] = []
  if (!b.advertiser?.trim()) out.push('Add the advertiser or brand.')
  if (!b.industry?.trim()) out.push('Choose the industry.')
  if (!b.message?.trim()) out.push('Say what the ad will say.')
  else if (b.message.length > 280) out.push('What the ad will say must be 280 characters or fewer.')
  if (!['arabic', 'english', 'bilingual', 'other'].includes(b.language as string)) out.push('Choose the creative language.')
  else if (b.language === 'other' && !b.languageOther?.trim()) out.push('Say which language the creative is in.')
  if (channel === 'digital' && !b.landingUrl) out.push('A landing page link is required for digital placements.')
  if (b.landingUrl && !/^https:\/\/\S+$/.test(b.landingUrl)) out.push('The landing page link must start with https://.')
  if (!b.draftFileKey && !b.creativeToFollow) out.push('Upload a draft of the creative or tick "creative to follow".')
  for (const [k, v] of Object.entries({ advertiser: b.advertiser, message: b.message, notes: b.notes, disclaimer: b.disclaimer }))
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

/**
 * Brand safety (publisher's choice per outlet): an industry the outlet does not accept, or an advertiser it will not run, is refused
 * before any bid or booking, so neither side wastes a decision on it. Names match loosely (case, spacing).
 */
export function brandSafetyProblem(b: Partial<Brief>, outlet: { blocked_industries?: string[]; blocked_advertisers?: string[] }) {
  const norm = (x: string) => x.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  if (b.industry && (outlet.blocked_industries ?? []).some(i => norm(i) === norm(b.industry!))) return `This outlet does not accept ${b.industry} advertising.`
  const adv = norm(b.advertiser ?? '')
  if (adv && (outlet.blocked_advertisers ?? []).some(n => norm(n) && adv.includes(norm(n)))) return 'This outlet does not run ads for this advertiser.'
  return null
}
