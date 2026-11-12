import { useEffect, useState } from 'react'
import { api } from '../api'
import { dayLabel } from '../format'
import { todayInDubai } from '../calendar/layout'
import { t } from '../i18n'
import { tm } from '../i18n-server'
import { CHANNEL_NAME } from '../media'
import { money } from './common'

/*
 * Listing (owner's rules): put a product's media type or programme on sale for chosen dates. Four steps: the product (skipped when
 * it is already picked), the dates, how it is sold, and the price (pre-filled from its default price).
 */
export type Sellable = { id: string; kind: 'main' | 'programme'; name: string; days: number[]; startsAt: string | null; endsAt: string | null; breaks: { label: string; at?: string }[]
  format: string | null; saleType: string; startingPrice: number; defaultPrice: number | null; buyNowPrice: number | null; reservePrice: number | null
  anyBreakPrice: number | null; packagePrice: number | null; listing: string; horizonWeeks: number; creativeDays: number; closeDays: number; details: Record<string, any>
  openSlots: number; nextAt: string | null; sold: number }
export type Media = { id: string; channel: string; channelOther: string | null; name: string; description: string | null; language: string | null; audience: string | null
  markets: string[]; reach: number | null; reachUnit: string | null; sectors: string[]; blocked: string[]; defaultPrice: number | null; creativeDays: number | null; closeDays: number | null
  specType: string | null; specDetail: string | null; notes: string | null; details: Record<string, any>; coverUrl: string | null; sellable: Sellable[] }
export type Product = { id: string; name: string; description: string | null; notes: string | null; logoUrl: string | null; media: Media[] }

export const mediaName = (m: Pick<Media, 'channel' | 'channelOther'>) => m.channel === 'other' ? m.channelOther || t('Other') : CHANNEL_NAME[m.channel] ?? m.channel
/** A title always starts with the outlet's name, then the programme or the format: "Skyline FM · Morning Markets", "The National · Custom". */
export const titleOf = (p: Pick<Product, 'name'>, s: Pick<Sellable, 'name'>) => s.name && s.name !== p.name ? `${p.name} · ${s.name}` : p.name
/** A product's title: "The National · Custom" when it is sold as one, its own name ("Skyline FM Radio") when it is sold by programme. */
/** Radio, TV and podcast products can be sold show by show (also true of products made before the tick-box existed). */
export const byProgramme = (m: Media) => !!m.details?.programmes || m.sellable.some(s => s.kind === 'programme')
export const productTitle = (p: Pick<Product, 'name'>, m: Media) => { const main = byProgramme(m) ? undefined : m.sellable.find(s => s.kind === 'main')
  return main ? titleOf(p, main) : m.name && m.name !== p.name ? m.name : `${p.name} · ${mediaName(m)}` }
/** Every sellable thing the publisher can list, named the way the owner wrote it. */
export function choices(products: Product[]) {
  return products.flatMap(p => p.media.flatMap(m => m.sellable.map(s => ({ id: s.id, s, m, p, label: `${titleOf(p, s)} (${mediaName(m)})` }))))
}

const LENGTHS: [string, string, number][] = [['once', 'One time only', 0], ['4', '4 weeks', 4], ['8', '8 weeks', 8], ['12', '12 weeks', 12], ['rolling', 'Keep it on sale', 8], ['other', 'Other', 0]]
const SOLD: [string, string, string][] = [
  ['auction', 'Auction', 'Buyers bid against each other; you accept the best bid.'],
  ['fixed', 'Fixed price', 'One price. Several buyers can make offers at that price; you pick one.'],
  ['quick_sale', 'Quick sale', 'Buyers can offer lower, higher or the same as the price; you pick one.'],
]

export function ListingPanel({ products, placementId, date, onClose, onDone }: { products: Product[]; placementId?: string; date?: string; onClose: () => void; onDone?: () => void }) {
  const all = choices(products), [id, setId] = useState(placementId ?? all[0]?.id ?? '')
  const pick = all.find(x => x.id === id), s = pick?.s
  const today = todayInDubai()
  const [from, setFrom] = useState(date && date >= today ? date : today), [len, setLen] = useState('4'), [weeks, setWeeks] = useState('6')
  const [sold, setSold] = useState(s?.saleType ?? 'auction'), [price, setPrice] = useState(''), [buyNow, setBuyNow] = useState(''), [reserve, setReserve] = useState('')
  const [anyBreak, setAnyBreak] = useState(''), [allBreaks, setAllBreaks] = useState('')
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [note, setNote] = useState('')
  useEffect(() => { if (!s) return; setPrice(String((s.defaultPrice ?? s.startingPrice) / 100)); setSold(s.saleType); setBuyNow(''); setReserve(''); setAnyBreak(''); setAllBreaks('') }, [id])
  const fils = (v: string) => v.trim() ? Math.round(Number(v.replace(/,/g, '')) * 100) : null
  const isMagazine = pick?.m.channel === 'magazine'
  async function save() {
    if (!s) return
    setBusy(true); setError(''); setNote('')
    try {
      const L = LENGTHS.find(x => x[0] === len)!
      const r = await api<{ slots: number }>('/seller/listings', { method: 'POST', body: { placementId: s.id, from, length: len === 'once' ? 'once' : len === 'rolling' ? 'rolling' : 'weeks',
        ...(len === 'once' ? {} : { weeks: len === 'other' ? Math.max(1, Math.min(26, Number(weeks) || 1)) : L[2] }), saleType: sold, startingPrice: fils(price),
        ...(sold === 'auction' ? { buyNowPrice: fils(buyNow), reservePrice: fils(reserve) } : {}),
        ...(s.breaks.length ? { anyBreakPrice: fils(anyBreak), packagePrice: fils(allBreaks) } : {}) } })
      setNote(r.slots ? t('Listed: {n} new slots on sale from {date}.', { n: r.slots, date: dayLabel(from, { day: 'numeric', month: 'short' }) })
        : t('Nothing new went on sale: those dates are already listed, or too close to sell (bidding closes {n} days before).', { n: s.closeDays }))
      onDone?.()
    } catch (e: any) { setError(tm(e.message)) } finally { setBusy(false) }
  }
  return <section className="card pad form lst" aria-label={t('List it')}>
    <div className="lst-h"><h2>{t('List it')}</h2><span className="spacer" /><button type="button" className="btn" onClick={onClose}>{t('Close')}</button></div>
    {!all.length ? <p className="muted">{t('Add an outlet and a product first; then list it here.')} <a href="/listings/new">{t('Add outlet')}</a></p> : <>
      <ol className="lst-steps">
        {!placementId && <li><span className="lst-n">1</span><div className="field"><label htmlFor="lst-p">{t('Pick the product')}</label>
          <select id="lst-p" value={id} onChange={e => setId(e.target.value)}>{all.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}</select>
          <span className="small muted">{t('Not on the list?')} <a href="/listings/new">{t('Create a new one')}</a></span></div></li>}
        {placementId && pick && <li><span className="lst-n">1</span><div><span className="small muted">{t('Product')}</span><p className="lst-picked"><b>{pick.label}</b></p></div></li>}
        <li><span className="lst-n">2</span><div className="field"><span className="lbl">{isMagazine ? t('Issue date') : t('Dates')}</span>
          <div className="lst-dates"><input type="date" aria-label={t('From')} min={today} value={from} onChange={e => setFrom(e.target.value)} />
            <div className="seg" role="radiogroup" aria-label={t('For how long')}>{LENGTHS.map(([k, l]) =>
              <button type="button" key={k} role="radio" aria-checked={len === k} className={len === k ? 'on' : ''} onClick={() => setLen(k)}>{t(l)}</button>)}</div>
            {len === 'other' && <label className="lst-weeks"><input inputMode="numeric" value={weeks} onChange={e => setWeeks(e.target.value.replace(/\D/g, ''))} aria-label={t('Number of weeks')} /> {t('weeks')}</label>}</div>
          <span className="small muted">{len === 'rolling' ? t('Always open 8 weeks ahead, topped up every day until you stop it.') : t('Only the days it runs go on sale. Bidding closes {n} days before each one.', { n: s?.closeDays ?? 0 })}</span></div></li>
        <li><span className="lst-n">3</span><div className="field"><span className="lbl">{t('How it is sold')}</span>
          <div className="lst-sold" role="radiogroup" aria-label={t('How it is sold')}>{SOLD.map(([k, l, about]) =>
            <button type="button" key={k} role="radio" aria-checked={sold === k} className={sold === k ? 'on' : ''} onClick={() => setSold(k)}><b>{t(l)}</b><span className="small">{t(about)}</span></button>)}</div></div></li>
        <li><span className="lst-n">4</span><div className="field"><span className="lbl">{t('Price')}</span>
          <div className="grid2">
            <div className="field"><label htmlFor="lst-sp">{sold === 'auction' ? t('Starting price (AED)') : t('Price (AED)')}</label><input id="lst-sp" inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} />
              {s?.defaultPrice != null && <span className="small muted">{t('Default price: {amount}', { amount: money(s.defaultPrice) })}</span>}</div>
            {sold === 'auction' && <div className="field"><label htmlFor="lst-bn">{t('Buy-now price (AED, optional)')}</label><input id="lst-bn" inputMode="decimal" value={buyNow} onChange={e => setBuyNow(e.target.value)} /></div>}
            {sold === 'auction' && <div className="field"><label htmlFor="lst-mn">{t('Minimum accepted (AED, optional)')}</label><input id="lst-mn" inputMode="decimal" value={reserve} onChange={e => setReserve(e.target.value)} />
              <span className="small muted">{t('Private: buyers never see it.')}</span></div>}
            {!!s?.breaks.length && <div className="field"><label htmlFor="lst-ab">{t('Any break package (AED, optional)')}</label><input id="lst-ab" inputMode="decimal" value={anyBreak} onChange={e => setAnyBreak(e.target.value)} />
              <span className="small muted">{t('You choose which break the ad plays in.')}</span></div>}
            {!!s?.breaks.length && <div className="field"><label htmlFor="lst-al">{t('All breaks package (AED, optional)')}</label><input id="lst-al" inputMode="decimal" value={allBreaks} onChange={e => setAllBreaks(e.target.value)} />
              <span className="small muted">{t('The ad plays in every break that day.')}</span></div>}
          </div></div></li>
      </ol>
      <div className="row-flex"><button type="button" className="btn primary" disabled={busy || !s || !(fils(price)! >= 100)} onClick={save}>{t('Save listing')}</button>
        {error && <p className="error" role="alert">{error}</p>}{note && <p className="ok" role="status">{note}</p>}</div>
    </>}
  </section>
}
