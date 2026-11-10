import { useEffect, useState } from 'react'
import { api, type Campaign, type Client, type Slot } from '../api'
import { dayLabel, money, time } from '../format'
import { dubai } from './layout'
import { SaleType } from './CalendarPage'
import { INDUSTRIES } from './BidDrawer'
import { t } from '../i18n'

/*
 * The buyer's plan: slots from any outlets collected while browsing, with the total against a budget, then sent together.
 * An auction gets a bid at the minimum next bid, a fixed price is booked, a quick sale gets the buyer's interest at the asking
 * price. One brief goes with all of them. The plan is kept in this browser until it is sent.
 */
const KEY = 'nashr:plan', LAST_BRIEF = 'nashr:last-brief', MAX = 30
const read = (): string[] => { try { const v = JSON.parse(localStorage.getItem(KEY) ?? '[]'); return Array.isArray(v) ? v.filter(x => typeof x === 'string').slice(0, MAX) : [] } catch { return [] } }
let ids = read()
const subs = new Set<() => void>()
function write(next: string[]) { ids = next.slice(0, MAX); try { localStorage.setItem(KEY, JSON.stringify(ids)) } catch { /* private mode: the plan lasts for this visit */ } subs.forEach(f => f()) }
export function usePlan() {
  const [, tick] = useState(0)
  useEffect(() => { const f = () => tick(n => n + 1); subs.add(f); return () => { subs.delete(f) } }, [])
  return { ids, full: ids.length >= MAX, has: (id: string) => ids.includes(id), toggle: (id: string) => write(ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]), remove: (id: string) => write(ids.filter(x => x !== id)) }
}

type Detail = Slot & { minNextBid: number; briefOnFile: boolean; yourDeal?: { id: string } | null }
type Row = { id: string; s?: Detail; gone?: boolean; sent?: string; error?: string }
const priceOf = (s: Detail) => s.saleType === 'auction' ? s.minNextBid : s.startingPrice

export function PlanDrawer({ onClose, onDone, onOpen }: { onClose: () => void; onDone: () => void; onOpen: (id: string) => void }) {
  const plan = usePlan()
  const [rows, setRows] = useState<Row[]>(() => plan.ids.map(id => ({ id }))), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [campaigns, setCampaigns] = useState<Campaign[]>([]), [clients, setClients] = useState<Client[]>([]), [campaignId, setCampaignId] = useState(''), [clientId, setClientId] = useState('')
  const [brief, setBrief] = useState(() => {
    const blank = { advertiser: '', industry: 'Banking', message: '', language: 'english', creativeToFollow: true }
    try { const b = JSON.parse(localStorage.getItem(LAST_BRIEF) ?? '{}'); return { ...blank, advertiser: b.advertiser ?? '', industry: b.industry ?? 'Banking', message: b.message ?? '', language: b.language ?? 'english' } } catch { return blank }
  })
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); addEventListener('keydown', k)
    api<Campaign[]>('/campaigns').then(c => setCampaigns(c.filter(x => x.status === 'active')), () => {})
    api<Client[]>('/clients').then(c => setClients(c.filter(x => x.status === 'active')), () => {})
    for (const id of plan.ids) api<Detail>(`/slots/${id}`).then(s => setRows(r => r.map(x => x.id === id ? { ...x, s, gone: !s.available } : x)), () => setRows(r => r.map(x => x.id === id ? { ...x, gone: true } : x)))
    return () => removeEventListener('keydown', k)
  }, [])
  const live = rows.filter(r => r.s && !r.gone && !r.sent), total = live.reduce((n, r) => n + priceOf(r.s!), 0)
  const campaign = campaigns.find(c => c.id === campaignId), campaignClient = campaign?.clientId ?? '', forClient = campaignClient || clientId
  const left = campaign ? campaign.remaining : clients.find(c => c.id === forClient)?.remaining ?? null
  const needBrief = live.some(r => !r.s!.briefOnFile), briefOk = !needBrief || (brief.advertiser.trim() && brief.message.trim())
  const drop = (id: string) => { plan.remove(id); setRows(r => r.filter(x => x.id !== id)) }

  async function sendAll() {
    setBusy(true); setError('')
    const extra = { ...(campaignId ? { campaignId } : {}), ...(forClient && !campaignClient ? { clientId: forClient } : {}) }
    for (const r of live) {
      const s = r.s!, body = { ...(s.briefOnFile ? {} : { brief }), ...extra }
      try {
        if (s.saleType === 'auction') await api(`/slots/${s.id}/bids`, { method: 'POST', body: { amount: s.minNextBid, ...body } })
        else await api(`/slots/${s.id}/${s.saleType === 'fixed' ? 'book' : 'interest'}`, { method: 'POST', body })
        plan.remove(s.id)
        setRows(x => x.map(y => y.id === s.id ? { ...y, error: undefined, sent: t(s.saleType === 'auction' ? 'Bid placed' : s.saleType === 'fixed' ? 'Booked' : 'Interest sent') } : y))
      } catch (e: any) { setRows(x => x.map(y => y.id === s.id ? { ...y, error: e.message } : y)) }
    }
    if (needBrief) try { localStorage.setItem(LAST_BRIEF, JSON.stringify({ ...JSON.parse(localStorage.getItem(LAST_BRIEF) ?? '{}'), ...brief })) } catch { /* fine */ }
    setBusy(false); onDone()
  }
  const sentCount = rows.filter(r => r.sent).length

  return <div className="scrim" onClick={onClose}>
    <aside className="drawer plan" role="dialog" aria-label={t('Your plan')} onClick={e => e.stopPropagation()}>
      <header className="drawer-h"><div><h2>{t('Your plan')}</h2>
        <p className="muted small">{t('Collect slots from any outlet, check the total, then send them together.')}</p></div>
        <button className="btn" onClick={onClose} aria-label={t('Close')}>✕</button></header>
      {!rows.length ? <p className="empty">{t('Your plan is empty. Open a slot in the calendar and press "Add to plan".')}</p> : <>
        <ul className="plan-rows">{rows.map(r => <li key={r.id} className={r.sent ? 'sent' : r.gone ? 'gone' : ''}>
          {!r.s ? <span className="muted small">{r.gone ? t('This slot is no longer on sale.') : t('Loading…')}</span> : <>
            <button type="button" className="plan-what" onClick={() => onOpen(r.id)} title={t('Open this slot')}>
              <b>{r.s.outlet} · {r.s.placement}</b>
              <span className="small muted">{r.s.label} · {dayLabel(dubai(r.s.startsAt).date, { weekday: 'short', day: 'numeric', month: 'short' })} · {time(r.s.startsAt)}</span>
              <span className="plan-tags"><SaleType t={r.s.saleType} />
                {r.sent ? <span className="dot lead">{r.sent}</span> : r.gone ? <span className="dot outbid">{t('No longer on sale')}</span> : r.s.youLead ? <span className="dot lead">{t('You lead')}</span> : null}</span>
              {r.error && <span className="small outbid">{r.error}</span>}
            </button>
            <span className="plan-price num">{money(priceOf(r.s))}<span className="small muted">{t(r.s.saleType === 'auction' ? 'minimum bid' : r.s.saleType === 'fixed' ? 'fixed price' : 'asking price')}</span></span></>}
          {!r.sent && <button type="button" className="btn sm plan-x" onClick={() => drop(r.id)} aria-label={t('Remove from plan')}>✕</button>}
        </li>)}</ul>

        {live.length > 0 && <>
          <div className="plan-total"><span>{t(live.length === 1 ? '1 slot to send' : '{n} slots to send', { n: live.length })}<span className="small muted">{t('Excluding VAT, at today\'s prices')}</span></span><b className="num">{money(total)}</b></div>
          {left != null && <div className={`plan-budget ${total > left ? 'over' : ''}`} role="note">
            <span className="plan-meter" aria-hidden><i style={{ width: `${Math.min(100, left > 0 ? total / left * 100 : 100)}%` }} /></span>
            <span className="small">{total > left ? t('{amount} over what is left in this budget ({left}).', { amount: money(total - left), left: money(left) }) : t('{amount} of the {left} left in this budget.', { amount: money(total), left: money(left) })}</span></div>}
          <div className="grid2">
            {campaigns.length > 0 && <div className="field"><label htmlFor="pl-camp">{t('Campaign')}</label>
              <select id="pl-camp" value={campaignId} onChange={e => setCampaignId(e.target.value)}><option value="">{t('No campaign')}</option>
                {campaigns.map(c => <option key={c.id} value={c.id}>{c.name} · {t('{amount} left', { amount: money(c.remaining) })}</option>)}</select></div>}
            {clients.length > 0 && <div className="field"><label htmlFor="pl-client">{t('For client')}</label>
              <select id="pl-client" value={forClient} disabled={!!campaignClient} onChange={e => { const c = clients.find(x => x.id === e.target.value); setClientId(e.target.value)
                if (c && !brief.advertiser) setBrief({ ...brief, advertiser: c.name, ...(c.industry && INDUSTRIES.includes(c.industry) ? { industry: c.industry } : {}) }) }}><option value="">{t('No client')}</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>}
          </div>
          {needBrief && <section className="form"><h3>{t('One brief for all of them')}</h3>
            <div className="grid2">
              <div className="field"><label htmlFor="pl-adv">{t('Advertiser or brand')}</label><input id="pl-adv" value={brief.advertiser} onChange={e => setBrief({ ...brief, advertiser: e.target.value })} /></div>
              <div className="field"><label htmlFor="pl-ind">{t('Industry')}</label><select id="pl-ind" value={brief.industry} onChange={e => setBrief({ ...brief, industry: e.target.value })}>{INDUSTRIES.map(i => <option key={i} value={i}>{t(i)}</option>)}</select></div>
            </div>
            <div className="field"><label htmlFor="pl-msg">{t('What the ad will say')} <span className="muted">({brief.message.length}/280)</span></label>
              <textarea id="pl-msg" rows={2} maxLength={280} value={brief.message} onChange={e => setBrief({ ...brief, message: e.target.value })} /></div>
            <div className="field"><label htmlFor="pl-lang">{t('Creative language')}</label><select id="pl-lang" value={brief.language} onChange={e => setBrief({ ...brief, language: e.target.value })}>
              <option value="english">{t('English')}</option><option value="arabic">{t('Arabic')}</option><option value="bilingual">{t('Bilingual')}</option></select></div>
          </section>}
          <p className="small muted">{t('Auctions get a bid at the minimum next bid, fixed prices are booked, quick sales get your interest at the asking price. Bids are binding. You pay only when a publisher accepts.')}</p>
        </>}
        {sentCount > 0 && !live.length && <p className="ok" role="status">{t('All sent.')} <a href="/bookings">{t('See them in Bookings')}</a></p>}
        {error && <p className="error" role="alert">{error}</p>}
        {live.length > 0 && <footer className="drawer-f">
          <button className="btn primary" disabled={busy || !briefOk} onClick={sendAll}>{busy ? t('Sending…') : t(live.length === 1 ? 'Send 1 slot · {amount}' : 'Send all {n} · {amount}', { n: live.length, amount: money(total) })}</button>
          {!briefOk && <span className="small muted">{t('Add the advertiser and what the ad will say.')}</span>}
        </footer>}
      </>}
    </aside>
  </div>
}
