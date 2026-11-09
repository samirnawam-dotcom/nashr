/*
 * Media coverage submissions (owner's prototype): what a publisher fills in to offer a programme, show or coverage opportunity.
 * Shared by the server (checks on submit) and the form (the same checks, shown beside each field). No browser or database code.
 */
export const COVERAGE_TYPES = [['tv', 'TV show'], ['radio', 'Radio show'], ['podcast', 'Podcast'], ['digital', 'Website feature'], ['newspaper', 'Newspaper feature'],
  ['magazine', 'Magazine feature'], ['newsletter', 'Newsletter feature'], ['event', 'Event'], ['social', 'Social media series']] as const
export const COVERAGE_FORMATS = [['live', 'Live'], ['recorded', 'Recorded'], ['in_studio', 'In studio'], ['on_ground', 'On the ground']] as const
export const COVERAGE_FREQUENCY = [['once', 'One-off'], ['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly']] as const
export const COVERAGE_KINDS = [['editorial', 'Editorial mention'], ['interview', 'Interview'], ['segment', 'Segment or feature'], ['event', 'Event coverage'], ['live', 'Live feed']] as const
export const COVERAGE_DELIVERABLES = [['mention', 'On-air mention'], ['article', 'Digital article'], ['logo', 'Logo on screen'], ['social', 'Social media coverage'],
  ['segment', 'Segment integration'], ['clip', 'Video clip (cut-down)'], ['interview', 'Interview (up to 5 min)'], ['other', 'Other']] as const
export const COVERAGE_PLATFORMS = [['tv', 'TV'], ['radio', 'Radio'], ['website', 'Website'], ['app', 'Mobile app'], ['social', 'Social media'], ['newsletter', 'Newsletter'], ['print', 'Print']] as const
export const COVERAGE_SOCIAL = [['instagram', 'Instagram'], ['tiktok', 'TikTok'], ['x', 'X'], ['youtube', 'YouTube']] as const
export const COVERAGE_MARKETS = [['UAE', 'UAE'], ['KSA', 'Saudi Arabia'], ['GCC', 'Wider GCC']] as const

export type CoverageData = {
  name?: string; type?: string; episode?: string; format?: string; durationMin?: number; frequency?: string
  dates?: string[]; time?: string; venue?: string; kinds?: string[]
  angle?: string; description?: string
  reach?: number; audienceProfile?: string; markets?: string[]; audiences?: string[]
  deliverables?: string[]; deliverablesOther?: string; platforms?: string[]; social?: Record<string, number>
  price?: number; saleType?: 'fixed' | 'auction'; sponsorship?: string; language?: string
  files?: { id: string; name: string; size: number }[]; notes?: string
}

/** The price buyers pay: the base price plus every social add-on offered with it (all in fils, excluding VAT). */
export const coverageTotal = (d: CoverageData) => (d.price ?? 0) + Object.values(d.social ?? {}).reduce((a, n) => a + (n || 0), 0)

/** What is still missing or wrong before it can go to Nashr for approval: [field, message] pairs, in the order of the form. */
export function coverageProblems(d: CoverageData, today: string): [string, string][] {
  const out: [string, string][] = []
  const need = (field: string, ok: unknown, msg: string) => { if (!ok) out.push([field, msg]) }
  need('name', d.name?.trim(), 'Add the programme or show name.')
  need('type', d.type, 'Choose the type.')
  need('format', d.format, 'Choose the format.')
  need('durationMin', d.durationMin && d.durationMin > 0, 'Add the duration in minutes.')
  need('frequency', d.frequency, 'Choose how often it runs.')
  need('dates', d.dates?.length, 'Add at least one coverage date.')
  if (d.dates?.some(x => x < today)) out.push(['dates', 'Coverage dates must be today or later.'])
  need('time', d.time && /^\d{2}:\d{2}$/.test(d.time), 'Add the time (UAE).')
  need('kinds', d.kinds?.length, 'Choose at least one coverage type.')
  need('angle', d.angle?.trim(), 'Add the editorial angle or key message.')
  need('reach', d.reach && d.reach > 0, 'Add the estimated reach.')
  need('deliverables', d.deliverables?.length, 'Choose at least one deliverable.')
  if (d.deliverables?.includes('other')) need('deliverablesOther', d.deliverablesOther?.trim(), 'Say what the other deliverable is.')
  need('platforms', d.platforms?.length, 'Choose where the coverage appears.')
  need('price', d.price && d.price >= 100, 'Add the base price.')
  need('saleType', d.saleType, 'Choose how it sells: fixed price or bidding.')
  return out
}
