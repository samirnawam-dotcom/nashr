import { useEffect, useMemo, useState } from 'react'
import { navigate } from '../nav'
import { api } from '../api'
import { addDays, todayInDubai } from '../calendar/layout'
import { Bolt, ChannelMark, Gavel, SaleIcon, saleLabel, Tag } from '../calendar/CalendarPage'
import { LANGUAGE } from '../calendar/BidDrawer'
import { dayLabel, money } from '../format'
import { ltr, sep, t } from '../i18n'
import { tm } from '../i18n-server'
import { AudiencePicker } from '../Audiences'

/*
 * Add placement, as Omar's brief describes it (prototype "Add a placement" + SPEC 12.1): pick a ready-made format for the outlet's
 * channel, say what the buyer gets, the creative specs and language, when it runs (by airing or a whole week), how it is sold,
 * and how long it stays on sale. A live preview shows the listing as buyers will see it and what saving will put on the calendar.
 */

type Outlet = { id: string; name: string; channel: string }
export type PlacementRow = { id: string; outletId: string; name: string; saleType: string; days: number[]; startsAt: string | null; endsAt: string | null
  breaks: { label: string; at?: string; seconds?: number }[]; startingPrice: number; anyBreakPrice: number | null; packagePrice: number | null
  buyNowPrice: number | null; reservePrice: number | null; autoAccept: boolean; creativeLeadHours: number; closeLeadHours: number
  format: string | null; description: string | null; specs: string | null; language: string | null; unit: 'day' | 'week'; listing: 'rolling' | 'manual'
  horizonWeeks: number; separation: boolean; audiences: string[] }
type Profile = { windows: { sellerHours: number; paymentHours: number }; company: { payoutsEnabled: boolean }; outlets: Outlet[]; placements: PlacementRow[] }
type Brk = { label: string; at: string; seconds: string }
type Format = { key: string; title?: string; name: string; about: string; unit?: 'day' | 'week'; days?: number[]; startsAt?: string; endsAt?: string; breaks?: Brk[]
  description: string; specs: string; creativeDays?: number; closeDays?: number }

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const WEEKDAYS = [1, 2, 3, 4, 5], EVERY_DAY = [1, 2, 3, 4, 5, 6, 7]
const aed = (v: string) => v.trim() ? Math.round(Number(v.replace(/,/g, '')) * 100) : undefined
const toAed = (fils: number | null) => fils == null ? '' : String(fils / 100)
const brk = (label: string, at = '', seconds = '') => ({ label, at, seconds })

/** Ready-made formats per channel. Choosing one fills the form; every field stays editable. */
function formats(channel: string): Format[] {
  switch (channel) {
    case 'radio': return [
      { key: 'spots', title: t('Spots in a programme'), name: t('Morning Drive'), about: t('30-second spots in the ad breaks of a programme'), days: WEEKDAYS, startsAt: '07:00', endsAt: '10:00',
        breaks: [brk(t('Break {n}', { n: 1 }), '07:30', '30'), brk(t('Break {n}', { n: 2 }), '08:30', '30'), brk(t('Break {n}', { n: 3 }), '09:30', '30')],
        description: t('A 30-second spot in one ad break of the programme.'), specs: t('MP3 or WAV, 30 seconds, broadcast-ready.'), creativeDays: 2, closeDays: 6 },
      { key: 'sponsorship', name: t('Programme sponsorship'), about: t('Your brand presents the whole programme'), days: WEEKDAYS, startsAt: '07:00', endsAt: '10:00',
        description: t('Opening and closing credits naming your brand, plus two mentions during the programme.'), specs: t('Brand name and a tag line of up to 10 seconds, as text or audio.'), creativeDays: 3, closeDays: 7 },
      { key: 'live_read', name: t('Live read'), about: t('The presenter reads your message live'), days: WEEKDAYS, startsAt: '07:00', endsAt: '10:00',
        breaks: [brk(t('Live read'), '08:15', '60')], description: t('The presenter reads your message live, about 60 seconds.'), specs: t('Script of up to 150 words in the ad language.'), creativeDays: 2, closeDays: 6 },
    ]
    case 'tv': return [
      { key: 'spots', title: t('Spots in a programme'), name: t('Prime time'), about: t('30-second spots in the ad breaks of a programme'), days: EVERY_DAY, startsAt: '20:00', endsAt: '22:00',
        breaks: [brk(t('Break {n}', { n: 1 }), '20:30', '30'), brk(t('Break {n}', { n: 2 }), '21:00', '30'), brk(t('Break {n}', { n: 3 }), '21:30', '30')],
        description: t('A 30-second spot in one ad break of the programme.'), specs: t('MP4 (H.264), 1920 × 1080, 30 seconds, loudness −23 LUFS.'), creativeDays: 3, closeDays: 7 },
      { key: 'sponsorship', name: t('Programme sponsorship'), about: t('Billboards at the start and end of each episode'), days: EVERY_DAY, startsAt: '20:00', endsAt: '21:00',
        description: t('A 5-second billboard before and after the episode, and your logo on screen during it.'), specs: t('5-second billboard, MP4 1920 × 1080, and a logo as PNG.'), creativeDays: 3, closeDays: 7 },
    ]
    case 'newspaper': case 'print': return [
      { key: 'full_page', name: t('Full page'), about: t('A full page in one edition'), days: EVERY_DAY, description: t('A full page in one edition.'), specs: t('26 × 36 cm, PDF/X-1a, 300 dpi.'), creativeDays: 3, closeDays: 7 },
      { key: 'half_page', name: t('Half page'), about: t('A horizontal half page in one edition'), days: EVERY_DAY, description: t('A horizontal half page in one edition.'), specs: t('26 × 17 cm, PDF/X-1a, 300 dpi.'), creativeDays: 3, closeDays: 7 },
      { key: 'front_strip', name: t('Front-page strip'), about: t('The strip across the bottom of the front page'), days: EVERY_DAY, description: t('The strip across the bottom of the front page, one edition.'), specs: t('25 cm × 5 columns, PDF/X-1a, 300 dpi.'), creativeDays: 3, closeDays: 7 },
    ]
    case 'magazine': return [
      { key: 'weekly_page', name: t('Magazine page'), about: t('A page in a weekly issue, sold by the week'), unit: 'week', days: [4], description: t('A full page in one weekly issue.'), specs: t('21 × 28 cm with 3 mm bleed, PDF/X-1a, 300 dpi.'), creativeDays: 5, closeDays: 9 },
      { key: 'spread', name: t('Double-page spread'), about: t('Two facing pages in one issue'), unit: 'week', days: [4], description: t('Two facing pages in one weekly issue.'), specs: t('42 × 28 cm with 3 mm bleed, PDF/X-1a, 300 dpi.'), creativeDays: 5, closeDays: 9 },
    ]
    case 'digital': return [
      { key: 'takeover', name: t('Homepage takeover'), about: t('The whole homepage for 24 hours'), days: EVERY_DAY, description: t('Your brand on the homepage skin and the main banner for 24 hours.'), specs: t('Skin 1920 × 1080 and MPU 300 × 250, HTML5 or JPG, up to 150 KB.'), creativeDays: 2, closeDays: 6 },
      { key: 'banner_week', name: t('Banner for a week'), about: t('Run-of-site banners, Monday to Sunday'), unit: 'week', days: [1], description: t('Your banners across the site for seven days.'), specs: t('MPU 300 × 250 and leaderboard 728 × 90, JPG, PNG or HTML5, up to 150 KB.'), creativeDays: 2, closeDays: 6 },
      { key: 'article', name: t('Sponsored article'), about: t('A labelled article that stays published'), days: WEEKDAYS, description: t('An article labelled "Sponsored", published on the day and shared once on social media.'), specs: t('600–800 words and 3 images (JPG, 1600 px wide).'), creativeDays: 4, closeDays: 8 },
      { key: 'contest', name: t('Sponsored contest'), about: t('A contest page for seven days'), unit: 'week', days: [1], description: t('A contest page with your prize for seven days, promoted twice.'), specs: t('Prize text (100 words), hero image 1200 × 630 and a link to the terms.'), creativeDays: 3, closeDays: 7 },
    ]
    case 'newsletter': return [
      { key: 'newsletter', name: t('Newsletter sponsorship'), about: t('A featured block in one newsletter send'), days: [2, 4], startsAt: '08:00', description: t('A featured block in one send to the newsletter list.'), specs: t('Logo 600 × 200 PNG, 40 words of text and a link.'), creativeDays: 2, closeDays: 6 },
      { key: 'dedicated', name: t('Dedicated send'), about: t('A whole email about your brand'), days: [3], startsAt: '10:00', description: t('One email to the whole list about your brand only.'), specs: t('Subject line, 300 words, 2 images (1200 px wide) and a link.'), creativeDays: 3, closeDays: 7 },
    ]
    case 'social': return [
      { key: 'ig_post', name: t('Instagram post'), about: t('A branded post in the feed'), days: EVERY_DAY, startsAt: '18:00', description: t('One branded feed post, labelled as a paid partnership.'), specs: t('Square or 4:5 image or carousel, caption of up to 150 words.'), creativeDays: 2, closeDays: 5 },
      { key: 'ig_reel', name: t('Instagram Reel'), about: t('A branded short video'), days: EVERY_DAY, startsAt: '18:00', description: t('One branded Reel of up to 60 seconds, labelled as a paid partnership.'), specs: t('9:16 MP4, up to 60 seconds, or a brief for the outlet to film.'), creativeDays: 4, closeDays: 7 },
      { key: 'story', name: t('Story set'), about: t('Three stories with a link'), days: EVERY_DAY, startsAt: '12:00', description: t('Three stories in a row with a link sticker to your page.'), specs: t('Three 9:16 images or videos, up to 15 seconds each, and a link.'), creativeDays: 2, closeDays: 5 },
      { key: 'tiktok', name: t('TikTok video'), about: t('A branded TikTok'), days: EVERY_DAY, startsAt: '19:00', description: t('One branded TikTok video, labelled as paid.'), specs: t('9:16 MP4, up to 60 seconds, or a brief for the outlet to film.'), creativeDays: 4, closeDays: 7 },
      { key: 'x_post', name: t('X post'), about: t('A post on X with a link'), days: EVERY_DAY, startsAt: '09:00', description: t('One post on X with your message and link.'), specs: t('Up to 280 characters, one image (1600 × 900) and a link.'), creativeDays: 1, closeDays: 4 },
    ]
    case 'podcast': return [
      { key: 'positions', title: t('Ad positions in an episode'), name: t('Weekly episode'), about: t('Pre-roll, mid-roll and post-roll, each sold on its own'), days: [2], startsAt: '06:00',
        breaks: [brk(t('Pre-roll'), '', '15'), brk(t('Mid-roll'), '', '60'), brk(t('Post-roll'), '', '30')],
        description: t('A host-read or produced ad in one position of the episode.'), specs: t('MP3, 48 kHz, or a script for the host to read.'), creativeDays: 3, closeDays: 7 },
      { key: 'episode_sponsor', name: t('Episode sponsorship'), about: t('Your brand presents a whole episode'), days: [2], startsAt: '06:00',
        description: t('The episode is presented by your brand, with a mention at the start and end.'), specs: t('Brand name and a 30-second message as a script.'), creativeDays: 3, closeDays: 7 },
    ]
    default: return []
  }
}

type F = { outletId: string; format: string; name: string; description: string; specs: string; language: string; unit: 'day' | 'week'; saleType: 'auction' | 'quick_sale' | 'fixed' | 'fixed'
  days: number[]; startsAt: string; endsAt: string; startingPrice: string; anyBreakPrice: string; packagePrice: string; buyNowPrice: string; reservePrice: string
  autoAccept: boolean; creativeDays: string; closeDays: string; listing: 'rolling' | 'manual'; horizonWeeks: string; listNowWeeks: string; separation: boolean; audiences: string[] }

const blank = (outletId: string): F => ({ outletId, format: '', name: '', description: '', specs: '', language: 'english', unit: 'day', saleType: 'auction', days: WEEKDAYS,
  startsAt: '', endsAt: '', startingPrice: '', anyBreakPrice: '', packagePrice: '', buyNowPrice: '', reservePrice: '', autoAccept: false, creativeDays: '2', closeDays: '6',
  listing: 'rolling', horizonWeeks: '8', listNowWeeks: '4', separation: false, audiences: [] })

/** The first airing that can still be sold, given when bidding closes (Dubai dates). */
function firstSellable(days: number[], closeDays: number, from = todayInDubai()) {
  for (let i = 0; i < 60; i++) { const d = addDays(from, i); const wd = new Date(d + 'T12:00:00Z').getUTCDay() || 7; if (i >= closeDays && days.includes(wd)) return d }
  return null
}

export function NewPlacementPage() {
  const [p, setP] = useState<Profile | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [f, setF] = useState<F>(blank('')), [breaks, setBreaks] = useState<Brk[]>([])
  const [done, setDone] = useState<{ slots: number; warnings: string[]; first: string | null; name: string } | null>(null)
  useEffect(() => { api<Profile>('/seller/profile').then(x => {
    setP(x)
    const from = new URLSearchParams(location.search).get('from'), src = from && x.placements.find(y => y.id === from)
    if (src) { // Duplicate: everything but the name carries over
      setF({ ...blank(src.outletId), format: src.format ?? '', name: t('{name} (copy)', { name: src.name }), description: src.description ?? '', specs: src.specs ?? '',
        language: src.language ?? 'english', unit: src.unit, saleType: src.saleType as F['saleType'], days: src.days, startsAt: src.startsAt?.slice(0, 5) ?? '', endsAt: src.endsAt?.slice(0, 5) ?? '',
        startingPrice: toAed(src.startingPrice), anyBreakPrice: toAed(src.anyBreakPrice), packagePrice: toAed(src.packagePrice), buyNowPrice: toAed(src.buyNowPrice),
        reservePrice: toAed(src.reservePrice), autoAccept: src.autoAccept, creativeDays: String(Math.round(src.creativeLeadHours / 24)), closeDays: String(Math.round(src.closeLeadHours / 24)),
        listing: src.listing, horizonWeeks: String(src.horizonWeeks), listNowWeeks: '4', separation: src.separation, audiences: src.audiences ?? [] })
      setBreaks(src.breaks.map(b => brk(b.label, b.at ?? '', b.seconds ? String(b.seconds) : '')))
    } else setF(v => ({ ...v, outletId: x.outlets[0]?.id ?? '' }))
  }, e => setError(e.message)) }, [])

  const outlet = p?.outlets.find(o => o.id === f.outletId)
  const channel = outlet?.channel ?? 'radio'
  const list = useMemo(() => formats(channel), [channel])
  const set = <K extends keyof F>(k: K, v: F[K]) => setF(x => ({ ...x, [k]: v }))
  const input = (k: keyof F) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => set(k, e.target.value as never)

  function choose(fm: Format | null) {
    if (!fm) { setF(x => ({ ...x, format: 'custom' })); return }
    setF(x => ({ ...x, format: fm.key, name: fm.name, description: fm.description, specs: fm.specs, unit: fm.unit ?? 'day', days: fm.days ?? x.days,
      startsAt: fm.startsAt ?? '', endsAt: fm.endsAt ?? '', creativeDays: String(fm.creativeDays ?? 2), closeDays: String(fm.closeDays ?? 6) }))
    setBreaks(fm.breaks ?? [])
  }

  if (!p) return <main>{error ? <p className="error">{error}</p> : <p className="muted">{t('Loading…')}</p>}</main>
  if (!p.outlets.length) return <main className="narrow"><h1>{t('Add placement')}</h1><p>{t('Add your outlet first.')} <a href="/profile">{t('Outlet profile')}</a></p></main>
  if (done) return <main className="narrow pl-done">
    <h1>{t('{name} is saved', { name: done.name })}</h1>
    <p className="lead">{done.slots ? t('{n} slots are on sale, the first on {date}.', { n: done.slots, date: done.first ? dayLabel(done.first, { weekday: 'long', day: 'numeric', month: 'long' }) : '—' })
      : p.company.payoutsEnabled ? t('Nothing is on sale yet. List weeks from Listings when you are ready.') : t('Slots go on sale once your payout account is verified.')}</p>
    {done.warnings.map(w => <p key={w} className="warn">{tm(w)} {t("Check the times if that's not intended.")}</p>)}
    <div className="row-flex"><a className="btn primary" href="/schedule?view=list">{t('See it on the calendar')}</a><a className="btn" href="/listings/new">{t('Add another')}</a><a className="btn" href="/listings">{t('Go to listings')}</a></div>
  </main>

  const week = f.unit === 'week', slotted = !week && breaks.length > 0, auction = f.saleType === 'auction', fixed = f.saleType === 'fixed'
  const creativeH = Number(f.creativeDays) * 24, closeH = Number(f.closeDays) * 24
  const minClose = Math.ceil((creativeH + p.windows.sellerHours + p.windows.paymentHours) / 24)
  const price = aed(f.startingPrice), buyNow = aed(f.buyNowPrice), reserve = aed(f.reservePrice)
  const problem = !f.name.trim() ? t('Give the placement a name.')
    : !f.days.length ? t('Choose the days it runs.')
    : !price ? t('Set a price.')
    : auction && buyNow && buyNow <= price ? t('The buy-now price must be above the starting price.')
    : auction && reserve && buyNow && reserve > buyNow ? t('The reserve cannot be above the buy-now price.')
    : !(Number(f.creativeDays) >= 0) || !(Number(f.closeDays) >= 1) ? t('Set the deadlines in days.')
    : Number(f.closeDays) < minClose ? t('With these settings, bidding must close at least {n} days before air.', { n: minClose })
    : f.startsAt && f.endsAt && f.startsAt === f.endsAt ? t('The end time must be after the start time.')
    : ''
  const first = firstSellable(f.days, Number(f.closeDays) || 0)
  const perWeek = week ? 1 : f.days.length * (slotted ? breaks.length + (aed(f.anyBreakPrice) ? 1 : 0) + (breaks.length > 1 && aed(f.packagePrice) ? 1 : 0) : 1)
  const listDays = f.listing === 'rolling' ? Number(f.horizonWeeks) * 7 : Number(f.listNowWeeks) * 7

  async function save() {
    setBusy(true); setError('')
    try {
      const body = { outletId: f.outletId, name: f.name.trim(), saleType: f.saleType, days: week ? f.days.slice(0, 1) : f.days, unit: f.unit,
        ...(f.startsAt ? { startsAt: f.startsAt } : {}), ...(f.endsAt && !week ? { endsAt: f.endsAt } : {}),
        breaks: slotted ? breaks.filter(b => b.label.trim()).map(b => ({ label: b.label.trim(), ...(b.at ? { at: b.at } : {}), ...(b.seconds ? { seconds: Number(b.seconds) } : {}) })) : [],
        startingPrice: price, anyBreakPrice: slotted ? aed(f.anyBreakPrice) : undefined, packagePrice: slotted && breaks.length > 1 ? aed(f.packagePrice) : undefined,
        buyNowPrice: auction ? buyNow : undefined, reservePrice: auction ? reserve : undefined, autoAccept: fixed ? f.autoAccept : auction && !!reserve && f.autoAccept,
        creativeLeadHours: creativeH, closeLeadHours: closeH, format: f.format || undefined, description: f.description.trim() || undefined, specs: f.specs.trim() || undefined,
        language: f.language, listing: f.listing, horizonWeeks: Number(f.horizonWeeks), separation: f.separation, audiences: f.audiences,
        ...(p!.company.payoutsEnabled && listDays > 0 ? { listFrom: todayInDubai(), listDays } : {}) }
      const r = await api<{ slots: number; warnings: string[] }>('/seller/placements', { method: 'POST', body: JSON.parse(JSON.stringify(body)) })
      setDone({ slots: r.slots, warnings: r.warnings ?? [], first: r.slots ? first : null, name: f.name.trim() }); scrollTo(0, 0)
    } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }

  const breakWord = channel === 'podcast' ? t('position') : t('break')
  return (
    <main className="pl-page">
      <p className="small"><a href="/listings">{t('Listings')}</a> › {t('Add placement')}</p>
      <div className="pl-head"><h1>{t('Add placement')}</h1><a className="btn" href="/listings/import">{t('Import a rate card file')}</a></div>
      <div className="pl-grid">
        <div className="pl-form">
          <section className="card pad form">
            <h2>{t("What you're selling")}</h2>
            {p.outlets.length > 1 && <div className="field"><label htmlFor="o">{t('Outlet')}</label>
              <select id="o" value={f.outletId} onChange={e => { set('outletId', e.target.value); set('format', '') }}>{p.outlets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>}
            <div className="field"><span className="small muted">{t('Format')}</span>
              <div className="pl-formats" role="radiogroup" aria-label={t('Format')}>
                {list.map(fm => <button type="button" role="radio" aria-checked={f.format === fm.key} key={fm.key} className={`pl-format ${f.format === fm.key ? 'on' : ''}`} onClick={() => choose(fm)}>
                  <b>{fm.title ?? fm.name}</b><span>{fm.about}</span></button>)}
                <button type="button" role="radio" aria-checked={f.format === 'custom'} className={`pl-format ${f.format === 'custom' ? 'on' : ''}`} onClick={() => choose(null)}>
                  <b>{t('Something else')}</b><span>{t('Start from a blank form')}</span></button>
              </div></div>
            <div className="field"><label htmlFor="n">{t('Name buyers see')}</label><input id="n" dir="auto" maxLength={200} value={f.name} onChange={input('name')} placeholder={t('Morning Drive')} /></div>
            <div className="field"><label htmlFor="ds">{t('What the buyer gets')}</label><textarea id="ds" dir="auto" rows={2} maxLength={600} value={f.description} onChange={input('description')} placeholder={t('A 30-second spot in one ad break of the programme.')} /></div>
            <div className="grid2">
              <div className="field"><label htmlFor="sx">{t('Creative specs')}</label><input id="sx" dir="auto" maxLength={400} value={f.specs} onChange={input('specs')} placeholder={t('MP3 or WAV, 30 seconds, broadcast-ready.')} /></div>
              <div className="field"><label htmlFor="lg">{t('Ad language')}</label><select id="lg" value={f.language} onChange={input('language')}>
                {Object.entries(LANGUAGE).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}</select></div>
            </div>
            <span className="small muted">{t('Buyers read this before they bid. Emails and phone numbers are not allowed.')}</span>
            <div className="field"><span className="small muted">{t("Who it reaches (optional: leave empty to use the outlet's audiences)")}</span>
              <AudiencePicker idPrefix="pl-aud" value={f.audiences} onChange={v => set('audiences', v)} /></div>
          </section>

          <section className="card pad form">
            <h2>{t('When it runs')}</h2>
            {['newspaper', 'magazine', 'print', 'digital', 'newsletter'].includes(channel) && <div className="seg pl-unit" role="radiogroup" aria-label={t('Sold by')}>
              <button type="button" role="radio" aria-checked={!week} className={!week ? 'on' : ''} onClick={() => set('unit', 'day')}>{['newspaper', 'magazine', 'print'].includes(channel) ? t('Each edition') : t('Each day')}</button>
              <button type="button" role="radio" aria-checked={week} className={week ? 'on' : ''} onClick={() => { set('unit', 'week'); set('days', f.days.slice(0, 1).length ? f.days.slice(0, 1) : [1]) }}>{t('A whole week')}</button></div>}
            <div className="field"><span className="small muted">{week ? t('The week starts on') : t('Days')}</span>
              <div className="days">{DAYS.map((d, i) => <label key={d} className={f.days.includes(i + 1) ? 'on' : ''}>
                <input type="checkbox" hidden checked={f.days.includes(i + 1)} onChange={() => set('days', week ? [i + 1] : f.days.includes(i + 1) ? f.days.filter(x => x !== i + 1) : [...f.days, i + 1].sort())} />{t(d)}</label>)}</div>
              {!week && <div className="pl-quick"><button type="button" onClick={() => set('days', WEEKDAYS)}>{t('Mon–Fri')}</button>
                <button type="button" onClick={() => set('days', EVERY_DAY)}>{t('Every day')}</button>
                <button type="button" onClick={() => set('days', [6, 7])}>{t('Weekend')}</button></div>}</div>
            {!week && <div className="grid2">
              <div className="field"><label htmlFor="sa">{['newspaper', 'magazine', 'print'].includes(channel) ? t('Edition time (optional)') : ['podcast', 'digital', 'newsletter', 'social'].includes(channel) ? t('Goes live at (optional)') : t('Programme starts')}</label><input id="sa" type="time" value={f.startsAt} onChange={input('startsAt')} /></div>
              {!['newspaper', 'magazine', 'print', 'podcast', 'newsletter', 'social'].includes(channel) && <div className="field"><label htmlFor="ea">{t('Ends')}</label><input id="ea" type="time" value={f.endsAt} onChange={input('endsAt')} /></div>}
            </div>}
            {!week && <span className="small muted">{t('Dubai time. Leave empty for the whole day. Overnight like 23:00–02:00 works.')}</span>}
            {!week && <div className="field"><span className="small muted">{channel === 'podcast' ? t('Positions: each one is sold on its own. Leave none to sell the whole episode.') : t('Ad breaks: each one is sold on its own. Leave none to sell the whole slot.')}</span>
              {breaks.map((b, i) => <div className="breaks-row" key={i}>
                <div className="field"><label htmlFor={`bl${i}`} className={i ? 'visually-hidden' : ''}>{t('Label')}</label><input id={`bl${i}`} dir="auto" maxLength={60} value={b.label} onChange={e => setBreaks(breaks.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} /></div>
                <div className="field"><label htmlFor={`bt${i}`} className={i ? 'visually-hidden' : ''}>{t('Time')}</label><input id={`bt${i}`} type="time" value={b.at} onChange={e => setBreaks(breaks.map((x, j) => j === i ? { ...x, at: e.target.value } : x))} /></div>
                <div className="field"><label htmlFor={`bs${i}`} className={i ? 'visually-hidden' : ''}>{t('Seconds')}</label><input id={`bs${i}`} inputMode="numeric" value={b.seconds} onChange={e => setBreaks(breaks.map((x, j) => j === i ? { ...x, seconds: e.target.value.replace(/\D/g, '') } : x))} /></div>
                <button type="button" className="btn" aria-label={t('Remove {name}', { name: b.label || breakWord })} onClick={() => setBreaks(breaks.filter((_, j) => j !== i))}>✕</button></div>)}
              <button type="button" className="btn" style={{ justifySelf: 'start' }} onClick={() => setBreaks([...breaks, channel === 'podcast'
                ? brk([t('Pre-roll'), t('Mid-roll'), t('Post-roll')][breaks.length] ?? t('Position {n}', { n: breaks.length + 1 }), '', '')
                : brk(t('Break {n}', { n: breaks.length + 1 }), '', '30')])}>{channel === 'podcast' ? t('Add position') : t('Add break')}</button></div>}
          </section>

          <section className="card pad form">
            <h2>{t('How it is sold')}</h2>
            <div className="pl-sale" role="radiogroup" aria-label={t('Sold as')}>
              <button type="button" role="radio" aria-checked={auction} className={`pl-sale-card ${auction ? 'on' : ''}`} onClick={() => set('saleType', 'auction')}>
                <b><Gavel /> {t('Auction')}</b><span>{t('Buyers bid until bidding closes. You accept the top bid, or it is accepted for you at your reserve.')}</span></button>
              <button type="button" role="radio" aria-checked={fixed} className={`pl-sale-card ${fixed ? 'on' : ''}`} onClick={() => set('saleType', 'fixed')}>
                <b><Tag /> {t('Fixed price')}</b><span>{t('Book now at your price. The first buyer to book takes it; you confirm within 24 hours, or automatically.')}</span></button>
              <button type="button" role="radio" aria-checked={f.saleType === 'quick_sale'} className={`pl-sale-card ${f.saleType === 'quick_sale' ? 'on' : ''}`} onClick={() => set('saleType', 'quick_sale')}>
                <b><Bolt /> {t('Quick sale')}</b><span>{t('A price buyers can offer on or above. Buyers show interest and you choose one of them.')}</span></button>
            </div>
            {fixed && <><label className="switch"><input type="checkbox" role="switch" checked={f.autoAccept} onChange={e => set('autoAccept', e.target.checked)} />
              <span className="switch-track" aria-hidden><span /></span><b>{t('Confirm bookings automatically')}</b></label>
              <span className="small muted">{t('A booking at your price is confirmed at once and the buyer is asked to pay. Off: you confirm each one within 24 hours.')}</span></>}
            <div className="grid2">
              <div className="field"><label htmlFor="sp">{slotted ? (auction ? t('Starting price per {thing}', { thing: breakWord }) : t('Price per {thing}', { thing: breakWord })) : auction ? t('Starting price') : t('Price')}</label>
                <div className="money-input"><span aria-hidden>{t('AED')}</span><input id="sp" inputMode="decimal" value={f.startingPrice} onChange={input('startingPrice')} /></div></div>
              {auction && <div className="field"><label htmlFor="bn">{t('Buy-now price (optional)')}</label>
                <div className="money-input"><span aria-hidden>{t('AED')}</span><input id="bn" inputMode="decimal" value={f.buyNowPrice} onChange={input('buyNowPrice')} /></div></div>}
            </div>
            <details className="pl-more" open={!!(f.reservePrice || f.anyBreakPrice || f.packagePrice)}>
              <summary>{t('More pricing options')}</summary>
              <div className="grid2">
                {auction && <div className="field"><label htmlFor="rp">{t('Reserve (optional, hidden from buyers)')}</label>
                  <div className="money-input"><span aria-hidden>{t('AED')}</span><input id="rp" inputMode="decimal" value={f.reservePrice} onChange={input('reservePrice')} /></div></div>}
                {slotted && <div className="field"><label htmlFor="ab">{channel === 'podcast' ? t('“Any position” price (optional)') : t('“Any break” price (optional)')}</label>
                  <div className="money-input"><span aria-hidden>{t('AED')}</span><input id="ab" inputMode="decimal" value={f.anyBreakPrice} onChange={input('anyBreakPrice')} /></div></div>}
                {slotted && breaks.length > 1 && <div className="field"><label htmlFor="pk">{t('All {n} as a package (optional)', { n: breaks.length })}</label>
                  <div className="money-input"><span aria-hidden>{t('AED')}</span><input id="pk" inputMode="decimal" value={f.packagePrice} onChange={input('packagePrice')} /></div></div>}
              </div>
              {auction && <label className="switch"><input type="checkbox" role="switch" checked={f.autoAccept && !!reserve} disabled={!reserve} onChange={e => set('autoAccept', e.target.checked)} />
                <span className="switch-track" aria-hidden><span /></span><b>{t('Accept automatically at the reserve')}</b></label>}
              {auction && <span className="small muted">{reserve ? t('When bidding closes at or above your reserve, the top bid is accepted for you and the buyer is asked to pay. Below the reserve, you still decide.') : t('Set a reserve price first.')}</span>}
            </details>
          </section>

          <section className="card pad form">
            <h2>{t('Deadlines and listing')}</h2>
            <div className="grid2">
              <div className="field"><label htmlFor="cl">{t('Creative due (days before air)')}</label><input id="cl" inputMode="numeric" value={f.creativeDays} onChange={e => set('creativeDays', e.target.value.replace(/\D/g, ''))} /></div>
              <div className="field"><label htmlFor="cd">{auction ? t('Bidding closes (days before air)') : t('Sale closes (days before air)')}</label><input id="cd" inputMode="numeric" value={f.closeDays} onChange={e => set('closeDays', e.target.value.replace(/\D/g, ''))} />
                <span className="small muted">{t('At least {n} days: {a}h for you to decide, {b}h for the buyer to pay, then the creative deadline.', { n: minClose, a: p.windows.sellerHours, b: p.windows.paymentHours })}</span></div>
            </div>
            <div className="pl-sale" role="radiogroup" aria-label={t('How long it stays on sale')}>
              <button type="button" role="radio" aria-checked={f.listing === 'rolling'} className={`pl-sale-card ${f.listing === 'rolling' ? 'on' : ''}`} onClick={() => set('listing', 'rolling')}>
                <b>{t('Keep it on sale')}</b><span>{t('Always open a set number of weeks ahead. New dates are added every day.')}</span></button>
              <button type="button" role="radio" aria-checked={f.listing === 'manual'} className={`pl-sale-card ${f.listing === 'manual' ? 'on' : ''}`} onClick={() => set('listing', 'manual')}>
                <b>{t('I list weeks myself')}</b><span>{t('List some weeks now and add more from Listings when you choose.')}</span></button>
            </div>
            {f.listing === 'rolling'
              ? <div className="field"><label htmlFor="hz">{t('Weeks ahead')}</label><select id="hz" value={f.horizonWeeks} onChange={input('horizonWeeks')}>{[4, 8, 12, 26].map(n => <option key={n} value={n}>{t('{n} weeks', { n })}</option>)}</select></div>
              : <div className="field"><label htmlFor="ln">{t('List now')}</label><select id="ln" value={f.listNowWeeks} onChange={input('listNowWeeks')}>
                  <option value="0">{t('Nothing yet')}</option>{[1, 2, 4, 8].map(n => <option key={n} value={n}>{t('The next {n} weeks', { n })}</option>)}</select></div>}
            <label className="switch"><input type="checkbox" role="switch" checked={f.separation} onChange={e => set('separation', e.target.checked)} />
              <span className="switch-track" aria-hidden><span /></span><b>{t('Competitive separation')}</b></label>
            <span className="small muted">{t('Warn me before I accept a booking when an advertiser in the same industry is already booked on that day.')}</span>
          </section>
        </div>

        <aside className="pl-side">
          <section className="card pad pl-preview" aria-label={t('Preview')}>
            <span className="small muted">{t('How buyers see it')}</span>
            <div className="row-flex"><ChannelMark c={channel} label /><span className="sale"><SaleIcon k={f.saleType} /> {saleLabel(f.saleType)}</span></div>
            <h3 dir="auto">{f.name || t('Name buyers see')}</h3>
            <p className="small muted">{outlet?.name}{sep}{week ? t('A whole week from {day}', { day: t(DAYS[(f.days[0] ?? 1) - 1]) }) : f.days.map(d => t(DAYS[d - 1])).join(sep) || '—'}
              {!week && f.startsAt ? ` · ${ltr(f.startsAt + (f.endsAt ? `–${f.endsAt}` : ''))}` : ''}</p>
            {slotted && <ul className="pl-breaks">{breaks.map((b, i) => <li key={i}><span dir="auto">{b.label}</span><span className="num muted">{[b.at, b.seconds ? `${b.seconds}s` : ''].filter(Boolean).join(' · ')}</span></li>)}</ul>}
            <p className="pl-price"><span className="muted small">{auction ? t('Starting price') : t('Price')}</span> <b className="num">{price ? money(price) : '—'}</b>
              {auction && buyNow ? <span className="small muted"> · {t('buy now {price}', { price: money(buyNow) })}</span> : null}</p>
            {f.description && <p className="small" dir="auto">{f.description}</p>}
            {f.specs && <p className="small muted" dir="auto">{f.specs}</p>}
          </section>
          <section className="card pad pl-summary">
            <h3>{t('When you save')}</h3>
            <ul>
              <li>{!p.company.payoutsEnabled ? t('Nothing goes on sale until your payout account is verified.')
                : f.listing === 'rolling' ? t('{n} weeks are on sale at all times, topped up every day.', { n: f.horizonWeeks })
                : Number(f.listNowWeeks) ? t('The next {n} weeks go on sale now.', { n: f.listNowWeeks }) : t('Nothing goes on sale yet.')}</li>
              <li>{perWeek === 1 ? t('1 slot a week.') : t('{n} slots a week.', { n: perWeek })}</li>
              {first && p.company.payoutsEnabled && listDays > 0 && <li>{t('First date buyers can book: {date}.', { date: dayLabel(first, { weekday: 'short', day: 'numeric', month: 'short' }) })}</li>}
              <li>{auction ? t('Bidding closes {n} days before each airing; creative is due {m} days before.', { n: f.closeDays || '—', m: f.creativeDays || '—' })
                : t('The sale closes {n} days before each airing; creative is due {m} days before.', { n: f.closeDays || '—', m: f.creativeDays || '—' })}</li>
            </ul>
            {(problem || error) && <p className={error ? 'error' : 'warn'} role="alert">{error ? tm(error) : problem}</p>}
            <button className="btn primary lg" style={{ width: '100%' }} disabled={busy || !!problem} onClick={save}>{busy ? t('Saving…') : t('Save placement')}</button>
            <a className="btn" style={{ width: '100%' }} href="/listings">{t('Cancel')}</a>
          </section>
        </aside>
      </div>
    </main>
  )
}
