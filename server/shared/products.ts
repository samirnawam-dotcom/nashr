/*
 * Products, media types and programmes (owner's rules, 10 Nov 2026). A product is the brand (Skyline FM); under it, each media
 * type it sells; under Radio, TV and Podcast, optional programmes. A listing puts one of them on sale for chosen dates.
 * Shared by the server (checks) and the forms. Every pick-list ends with Other: a value that is not one of the keys is the
 * publisher's own text.
 */
export type Opt = readonly [string, string]
export const OTHER = 'other'
const o = (...pairs: [string, string][]) => [...pairs, [OTHER, 'Other']] as Opt[]

export const LANGUAGES = o(['english', 'English'], ['arabic', 'Arabic'], ['bilingual', 'Bilingual'])
export const MARKETS = o(['UAE', 'UAE'], ['KSA', 'KSA'], ['GCC', 'GCC'])
export const REACH_UNITS = o(['listeners', 'listeners'], ['readers', 'readers'], ['visitors', 'visitors'], ['subscribers', 'subscribers'], ['followers', 'followers'])
export const WEEKDAY_SETS: Record<string, number[]> = { daily: [1, 2, 3, 4, 5, 6, 7], weekdays: [1, 2, 3, 4, 5], six_days: [1, 2, 3, 4, 5, 6], twice_week: [1, 4], weekly: [5], weekend: [6, 7] }

/** What each media type asks for beyond the common fields. `suggest` is a free-text field with suggestions; `pick` ends with Other. */
export type Field = { key: string; label: string; kind: 'days' | 'airtime' | 'breaks' | 'pick' | 'suggest' | 'text'; options?: Opt[]; required: boolean; when?: (d: Record<string, any>) => boolean; help?: string }
const days = (label: string): Field => ({ key: 'days', label, kind: 'days', required: true })
const airtime: Field = { key: 'airtime', label: 'Airtime', kind: 'airtime', required: true, help: 'Start and end time, Dubai time.' }
const breaks: Field = { key: 'breaks', label: 'Breaks', kind: 'breaks', required: true, help: 'Each break is sold on its own.' }
const adLength: Field = { key: 'adLength', label: 'Ad length', kind: 'text', required: true, help: 'For example: 30 seconds' }

export const TYPE_FIELDS: Record<string, Field[]> = {
  radio: [days('Days'), airtime, breaks, { key: 'format', label: 'Format', kind: 'suggest', required: true, options: [['Ad spot', 'Ad spot'], ['Live read', 'Live read'], ['Sponsorship', 'Sponsorship'], ['Time check', 'Time check']] }, adLength],
  tv: [days('Days'), airtime, breaks, { key: 'format', label: 'Format', kind: 'suggest', required: true, options: [['Ad spot', 'Ad spot'], ['Programme sponsorship', 'Programme sponsorship'], ['Branded segment', 'Branded segment'], ['Product placement', 'Product placement']] }, adLength],
  newspaper: [
    { key: 'frequency', label: 'Frequency', kind: 'pick', required: true, options: o(['daily', 'Daily'], ['weekdays', 'Weekdays only (Mon–Fri)'], ['six_days', 'Six days a week'], ['twice_week', 'Twice a week'], ['weekly', 'Weekly'], ['weekend', 'Weekend edition only']) },
    days('Days published'),
    { key: 'format', label: 'Format', kind: 'pick', required: true, options: o(['full_page', 'Full page'], ['half_page', 'Half page'], ['quarter_page', 'Quarter page'], ['front_strip', 'Front-page strip'], ['back_page', 'Back page'], ['insert', 'Insert'], ['advertorial', 'Advertorial']) },
    { key: 'section', label: 'Section', kind: 'pick', required: true, options: o(['news', 'News'], ['business', 'Business'], ['sport', 'Sport'], ['lifestyle', 'Lifestyle']) },
  ],
  magazine: [
    { key: 'frequency', label: 'Frequency', kind: 'pick', required: true, options: o(['weekly', 'Weekly'], ['fortnightly', 'Every 2 weeks'], ['monthly', 'Monthly'], ['bimonthly', 'Every 2 months'], ['quarterly', 'Quarterly'], ['twice_year', 'Twice a year'], ['yearly', 'Yearly'], ['special', 'One-off special issue']) },
    { key: 'format', label: 'Format', kind: 'pick', required: true, options: o(['full_page', 'Full page'], ['double_page', 'Double page'], ['back_cover', 'Back cover'], ['inside_front', 'Inside front cover'], ['inside_back', 'Inside back cover'], ['advertorial', 'Advertorial']) },
  ],
  digital: [
    days('Days available'),
    { key: 'format', label: 'Format', kind: 'pick', required: true, options: o(['homepage_takeover', 'Homepage takeover'], ['banner', 'Banner'], ['sponsored_article', 'Sponsored article'], ['video_ad', 'Video ad']) },
    { key: 'size', label: 'Size', kind: 'pick', required: true, when: d => d.format === 'banner', options: o(['970x250', '970×250'], ['728x90', '728×90'], ['300x250', '300×250'], ['320x50', '320×50']) },
    { key: 'runs', label: 'How long it runs', kind: 'pick', required: true, options: o(['24h', '24 hours'], ['1w', '1 week']) },
  ],
  newsletter: [days('Send days'), { key: 'format', label: 'Format', kind: 'pick', required: true, options: o(['top_sponsor', 'Top sponsor slot'], ['banner', 'Banner'], ['dedicated', 'Dedicated send']) }],
  podcast: [days('Release days'), { key: 'format', label: 'Format', kind: 'pick', required: true, options: o(['preroll', 'Pre-roll'], ['midroll', 'Mid-roll'], ['postroll', 'Post-roll'], ['host_read', 'Host read']) }, adLength],
  social: [
    { key: 'platform', label: 'Platform', kind: 'pick', required: true, options: o(['instagram', 'Instagram'], ['tiktok', 'TikTok'], ['x', 'X'], ['youtube', 'YouTube'], ['linkedin', 'LinkedIn'], ['snapchat', 'Snapchat']) },
    { key: 'format', label: 'Format', kind: 'pick', required: true, options: o(['post', 'Post'], ['reel', 'Reel or video'], ['story', 'Story'], ['carousel', 'Carousel']) },
  ],
  other: [days('Days available'), { key: 'format', label: 'Format', kind: 'text', required: true }],
}
/** Radio, TV and Podcast can be sold by programme; each programme has the type's own fields (not frequency or platform). */
export const HAS_PROGRAMMES = ['radio', 'tv', 'podcast']
export const PROGRAMME_FIELDS = (channel: string) => TYPE_FIELDS[channel].filter(f => ['days', 'airtime', 'breaks', 'format', 'adLength'].includes(f.key))

/** Creative specs: the file type for the media type, then its length or size. */
export const SPEC_TYPES: Record<string, Opt[]> = {
  radio: o(['MP3', 'MP3'], ['WAV', 'WAV'], ['script', 'Script for a live read']), tv: o(['MP4', 'MP4'], ['MOV', 'MOV'], ['MXF', 'MXF']),
  newspaper: o(['PDF', 'Print-ready PDF'], ['JPG', 'JPG or PNG']), magazine: o(['PDF', 'Print-ready PDF'], ['JPG', 'JPG or PNG']),
  digital: o(['JPG', 'JPG or PNG'], ['GIF', 'GIF'], ['HTML5', 'HTML5'], ['MP4', 'MP4']), newsletter: o(['JPG', 'JPG or PNG'], ['HTML', 'HTML']),
  podcast: o(['MP3', 'MP3'], ['WAV', 'WAV'], ['script', 'Script for a host read']), social: o(['JPG', 'JPG or PNG'], ['MP4', 'MP4']), other: o(['PDF', 'PDF'], ['JPG', 'JPG or PNG'], ['MP4', 'MP4']),
}

export type MediaInput = {
  channel: string; channelOther?: string; name: string; description: string; language: string; audience: string; markets: string[]
  reach?: number | null; reachUnit?: string | null; sectors: string[]; blocked: string[]; defaultPrice: number; creativeDays: number; closeDays: number
  specType: string; specDetail?: string; notes?: string; details: Record<string, any>
  /** Audience tags buyers filter by (shared/audiences.ts) and advertisers this product will not run; left as they are when not sent. */
  audiences?: string[]; blockedAdvertisers?: string[]
}
export type ProgrammeInput = { name: string; notes?: string; defaultPrice?: number | null; creativeDays?: number | null; closeDays?: number | null; details: Record<string, any> }

/** Bidding must close at least 3 days before the creative is due: 1 for the publisher to decide, 2 for the buyer to pay. */
export const deadlineProblem = (creativeDays: number, closeDays: number) =>
  closeDays < creativeDays + 3 ? 'Bidding must close at least 3 days before the creative is due (1 day for you to decide, 2 for the buyer to pay).' : null

const filled = (v: any) => Array.isArray(v) ? v.length > 0 : v != null && String(v).trim() !== ''
/** What is missing or wrong in a media type's or programme's own fields: [field, message] pairs. */
export function fieldProblems(fields: Field[], d: Record<string, any>): [string, string][] {
  const out: [string, string][] = []
  for (const f of fields) {
    if (f.when && !f.when(d)) continue
    if (f.kind === 'airtime') { if (!/^\d{2}:\d{2}$/.test(d.airStart ?? '') || !/^\d{2}:\d{2}$/.test(d.airEnd ?? '')) out.push(['airtime', 'Add the start and end time.']); continue }
    if (f.kind === 'breaks') { if (!Array.isArray(d.breaks) || !d.breaks.length || d.breaks.some((b: any) => !/^\d{2}:\d{2}$/.test(b?.at ?? ''))) out.push(['breaks', 'Add each break with its time.']); continue }
    if (f.required && !filled(d[f.key])) out.push([f.key, `Fill in ${f.label.toLowerCase()}.`])
  }
  return out
}
export function mediaProblems(m: MediaInput): [string, string][] {
  const out: [string, string][] = []
  const need = (k: string, ok: unknown, msg: string) => { if (!ok) out.push([k, msg]) }
  need('channel', TYPE_FIELDS[m.channel], 'Pick the media type.')
  if (m.channel === OTHER) need('channelOther', m.channelOther?.trim(), 'Say what the media type is.')
  need('name', m.name?.trim(), 'Add the name buyers see.')
  need('description', m.description?.trim(), 'Add a description.')
  need('language', m.language?.trim(), 'Pick the language.')
  need('audience', m.audience?.trim(), 'Describe the audience.')
  need('markets', m.markets?.length, 'Pick at least one market.')
  need('defaultPrice', m.defaultPrice >= 100, 'Add the default price.')
  need('creativeDays', Number.isInteger(m.creativeDays) && m.creativeDays >= 0, 'Add when the creative is due.')
  need('closeDays', Number.isInteger(m.closeDays) && m.closeDays >= 0, 'Add when bidding closes.')
  const dl = deadlineProblem(m.creativeDays, m.closeDays); if (dl) out.push(['closeDays', dl])
  need('specType', m.specType?.trim(), 'Pick the creative file type.')
  if (m.notes && m.notes.length > 500) out.push(['notes', 'Keep it to 500 characters.'])
  if (TYPE_FIELDS[m.channel] && !m.details?.programmes) out.push(...fieldProblems(TYPE_FIELDS[m.channel], m.details ?? {}))
  return out
}
export const label = (opts: Opt[] | undefined, v: string | undefined) => !v ? '' : opts?.find(x => x[0] === v)?.[1] ?? v
