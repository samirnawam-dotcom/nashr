import { useEffect, useState } from 'react'
import { api, type Campaign, type Slot } from '../api'
import { dayLabel, money, time } from '../format'
import { dubai, isAllDay } from './layout'
import { SaleType, status } from './CalendarPage'
import { SignInPrompt, useGuest } from '../guest'

type Detail = Slot & { minNextBid: number; yourMax: number | null; briefOnFile: boolean; creativeDueAt: string }
const INDUSTRIES = ['Banking', 'Real estate', 'Retail', 'Technology', 'Hospitality', 'Health', 'Automotive', 'Education', 'Government', 'Other']
const LAST_BRIEF = 'nashr:last-brief', LAST_CAMPAIGN = 'nashr:last-campaign'
const seconds = (s: Slot) => Math.round((new Date(s.endsAt!).getTime() - new Date(s.startsAt).getTime()) / 1000)
const toFils = (aed: string) => Math.round(Number(aed.replace(/,/g, '')) * 100)

export function BidDrawer({ slotId, onClose, onDone }: { slotId: string; onClose: () => void; onDone: () => void }) {
  const guest = useGuest()
  const [s, setS] = useState<Detail | null>(null)
  const [amount, setAmount] = useState(''), [auto, setAuto] = useState(false), [max, setMax] = useState('')
  // The brief goes with every first bid on a slot; the last one is offered again so buyers type it once per campaign.
  const [brief, setBrief] = useState(() => {
    const blank = { advertiser: '', industry: 'Banking', message: '', language: 'english', landingUrl: '', creativeToFollow: true, notes: '' }
    try { return { ...blank, ...JSON.parse(localStorage.getItem(LAST_BRIEF) ?? '{}') } } catch { return blank }
  })
  const [error, setError] = useState(''), [done, setDone] = useState(''), [busy, setBusy] = useState(false)
  // Tag the booking to a campaign so it counts against that budget; the last choice is offered again.
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [campaignId, setCampaignId] = useState(() => { try { return localStorage.getItem(LAST_CAMPAIGN) ?? '' } catch { return '' } })
  useEffect(() => { if (!guest) api<Campaign[]>('/campaigns').then(c => { const active = c.filter(x => x.status === 'active'); setCampaigns(active)
    if (!active.some(x => x.id === campaignId)) setCampaignId('') }, () => {}) }, [])

  const load = () => api<Detail>(`/slots/${slotId}`).then(d => { setS(d); setAmount(String(d.minNextBid / 100)) }, e => setError(e.message))
  useEffect(() => { load() }, [slotId])

  async function send(path: string, body: object, message: string) {
    setBusy(true); setError('')
    try {
      const b = s!.briefOnFile ? {} : { brief: { ...brief, landingUrl: brief.landingUrl || undefined, notes: brief.notes || undefined } }
      await api(path, { method: 'POST', body: { ...body, ...b, ...(campaignId ? { campaignId } : {}) } })
      try { localStorage.setItem(LAST_CAMPAIGN, campaignId) } catch { /* fine */ }
      if (!s!.briefOnFile) try { localStorage.setItem(LAST_BRIEF, JSON.stringify(brief)) } catch { /* private mode: nothing to remember */ }
      setDone(message); onDone(); await load()
    } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }
  if (!s) return <Shell onClose={onClose}>{error ? <p className="error">{error}</p> : <p className="muted">Loading…</p>}</Shell>

  const when = isAllDay(s) ? dayLabel(dubai(s.startsAt).date, { weekday: 'short', day: 'numeric', month: 'short' })
    : `${dayLabel(dubai(s.startsAt).date)} · ${time(s.startsAt)}${!s.endsAt ? '' : seconds(s) < 120 ? ` · ${seconds(s)} seconds` : `–${time(s.endsAt)}`}`
  const closes = new Date(s.closesAt)
  return (
    <Shell onClose={onClose} title={`${s.outlet} · ${s.placement}`} sub={`${s.label} · ${when}`}>
      <div className="row-flex"><SaleType t={s.saleType} /><span className="small">{status(s)}</span></div>
      {s.saleType === 'auction' && <p className="small muted">Bidding closes {dayLabel(dubai(s.closesAt).date, { weekday: 'short', day: 'numeric', month: 'short' })}, {time(s.closesAt)} (Dubai time)</p>}

      <dl className="prices">
        <div><dt>{s.saleType === 'auction' ? 'Starting price' : 'Asking price'}</dt><dd className="num">{money(s.startingPrice)}</dd></div>
        {s.saleType === 'auction' && <div><dt>Current top bid</dt><dd className="num">{s.topBid ? money(s.topBid) : 'No bids yet'}<small>{s.bids} bids · bidders anonymous</small></dd></div>}
        {s.saleType === 'auction' && <div><dt>Minimum next bid</dt><dd className="num">{money(s.minNextBid)}<small>+3%</small></dd></div>}
        {s.buyNowPrice && <div><dt>Buy now</dt><dd className="num">{money(s.buyNowPrice)}<small>Request to book: the publisher must accept</small></dd></div>}
      </dl>

      {s.available && guest && <SignInPrompt to={s.saleType === 'auction' ? 'bid on this slot' : 'book this slot'} />}
      {s.available && !guest && <>
        {s.saleType === 'auction' ? <section className="form">
          <div className="field"><label htmlFor="amt">Your bid (excl. VAT)</label>
            <div className="money-input"><span aria-hidden>AED</span><input id="amt" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></div>
            <div className="quick-add" aria-label="Raise your bid">{[100, 250, 500].map(n => <button key={n} type="button" className="btn"
              onClick={() => setAmount(String(Math.max(Number(amount.replace(/,/g, '')) || 0, s.minNextBid / 100) + n))}>+{n}</button>)}</div></div>
          <label className="check"><input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} /> Auto-bid</label>
          {auto && <div className="field"><label htmlFor="max">Maximum bid</label><div className="money-input"><span aria-hidden>AED</span><input id="max" inputMode="decimal" value={max} onChange={e => setMax(e.target.value)} /></div>
            <span className="small muted">We raise your bid in 3% steps when you're outbid, up to this maximum.</span></div>}
          {s.yourMax ? <p className="small muted">Your current maximum: {money(s.yourMax)}</p> : null}
        </section> : <section className="form">
          <div className="field"><label htmlFor="offer">Your offer (AED, optional, not below the asking price)</label><input id="offer" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></div>
        </section>}

        {!s.briefOnFile && <section className="form">
          <h3>Booking brief</h3>
          <div className="field"><label htmlFor="adv">Advertiser or brand</label><input id="adv" value={brief.advertiser} onChange={e => setBrief({ ...brief, advertiser: e.target.value })} /></div>
          <div className="field"><label htmlFor="ind">Industry</label><select id="ind" value={brief.industry} onChange={e => setBrief({ ...brief, industry: e.target.value })}>{INDUSTRIES.map(i => <option key={i}>{i}</option>)}</select></div>
          <div className="field"><label htmlFor="msg">What the ad will say <span className="muted">({brief.message.length}/280)</span></label>
            <textarea id="msg" rows={3} maxLength={280} value={brief.message} onChange={e => setBrief({ ...brief, message: e.target.value })} /></div>
          <div className="field"><label htmlFor="lang">Creative language</label><select id="lang" value={brief.language} onChange={e => setBrief({ ...brief, language: e.target.value })}>
            <option value="english">English</option><option value="arabic">Arabic</option><option value="bilingual">Bilingual</option></select></div>
          {s.channel === 'digital' && <div className="field"><label htmlFor="url">Landing page link</label><input id="url" placeholder="https://" value={brief.landingUrl} onChange={e => setBrief({ ...brief, landingUrl: e.target.value })} /></div>}
          <label className="check"><input type="checkbox" checked={brief.creativeToFollow} onChange={e => setBrief({ ...brief, creativeToFollow: e.target.checked })} /> Creative to follow</label>
          <div className="field"><label htmlFor="notes">Notes for the publisher</label><textarea id="notes" rows={2} value={brief.notes} onChange={e => setBrief({ ...brief, notes: e.target.value })} />
            <span className="small muted">Emails and phone numbers are not allowed. Talk to the publisher through Nashr.</span></div>
        </section>}

        {campaigns.length > 0 && <div className="field"><label htmlFor="camp">Campaign</label>
          <select id="camp" value={campaignId} onChange={e => setCampaignId(e.target.value)}><option value="">No campaign</option>
            {campaigns.map(c => <option key={c.id} value={c.id}>{c.name} · {money(c.remaining)} left</option>)}</select></div>}

        {error && <p className="error" role="alert">{error}</p>}
        {done && <p className="ok" role="status">{done}</p>}
        <p className="small muted">You'll be asked to pay once the publisher accepts. Nothing is charged now.</p>
        <footer className="drawer-f">
          {s.saleType === 'auction'
            ? <button className="btn primary" disabled={busy || new Date() >= closes} onClick={() => send(`/slots/${s.id}/bids`, { amount: toFils(amount), ...(auto && max ? { maxAmount: toFils(max) } : {}) }, 'Your bid is in.')}>Place bid {money(toFils(amount) || 0)}</button>
            : <button className="btn primary" disabled={busy} onClick={() => send(`/slots/${s.id}/interest`, amount && toFils(amount) !== s.startingPrice ? { amount: toFils(amount) } : {}, 'The publisher has your interest.')}>Show interest</button>}
          {s.buyNowPrice && s.saleType === 'auction' && <button className="btn" disabled={busy} onClick={() => send(`/slots/${s.id}/buy-now`, {}, 'Request sent. The publisher will reply within 24 hours.')}>Request at {money(s.buyNowPrice)}</button>}
        </footer>
      </>}
    </Shell>
  )
}

function Shell({ title, sub, onClose, children }: { title?: string; sub?: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); addEventListener('keydown', k); return () => removeEventListener('keydown', k) }, [])
  return (
    <div className="scrim" onClick={onClose}>
      <aside className="drawer" role="dialog" aria-label={title} onClick={e => e.stopPropagation()}>
        <header className="drawer-h"><div>{title && <h2>{title}</h2>}{sub && <p className="muted small">{sub}</p>}</div>
          <button className="btn" onClick={onClose} aria-label="Close">✕</button></header>
        {children}
      </aside>
    </div>
  )
}
