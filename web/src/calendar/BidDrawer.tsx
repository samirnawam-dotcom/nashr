import { useEffect, useState } from 'react'
import { tm, tmTitle } from '../i18n-server'
import { api, upload, type CampaignBrief, type Client, type Slot } from '../api'
import { dayLabel, hasTime, money, slotWhen, time } from '../format'
import { OutletMark } from '../LogoPicker'
import { Reach } from './Reach'
import { addDays, dubai, isAllDay } from './layout'
import { SaleType, status } from './CalendarPage'
import { SignInPrompt, useGuest } from '../guest'
import { t } from '../i18n'
import { CompanyCard, type CompanyProfile } from '../CompanyCard'
import { useLive } from '../live'
import { useCampaigns, useCurrentCampaign } from './CampaignDrawer'
import { IndustryPick } from '../IndustryPick'

type Detail = Slot & { placementId?: string; yourDeal?: { id: string; status: string; kind: string } | null; minNextBid: number; yourMax: number | null; yourAutoMax: number | null; briefOnFile: boolean; creativeDueAt: string
  details?: { description: string | null; specs: string | null; language: string | null; unit: string | null; notAccepted?: string[] }; publisher?: CompanyProfile | null }
export const LANGUAGE: Record<string, string> = { english: 'English', arabic: 'Arabic', both: 'English or Arabic', hindi: 'Hindi', urdu: 'Urdu', other: 'Other' }
export { INDUSTRIES } from '../industries'
import { INDUSTRIES } from '../industries'
const LAST_BRIEF = 'nashr:last-brief', LAST_CLIENT = 'nashr:last-client'
const seconds = (s: Slot) => Math.round((new Date(s.endsAt!).getTime() - new Date(s.startsAt).getTime()) / 1000)
const toFils = (aed: string) => Math.round(Number(aed.replace(/,/g, '')) * 100)

export function BidDrawer({ slotId, onClose, onDone }: { slotId: string; onClose: () => void; onDone: () => void }) {
  const guest = useGuest()
  const [s, setS] = useState<Detail | null>(null)
  const [amount, setAmount] = useState(''), [auto, setAuto] = useState(false), [max, setMax] = useState('')
  // No campaign: the brief is filled in for this bid (the last one is offered again). With a campaign, its brief goes instead.
  type B = CampaignBrief & { notes?: string; fileName?: string }
  const [brief, setBrief] = useState<B>(() => {
    const blank: B = { advertiser: '', industry: '', message: '', language: 'english', languageOther: '', landingUrl: '', creativeToFollow: true, notes: '', disclaimer: '' }
    try { const { draftFileKey: _, ...last } = JSON.parse(localStorage.getItem(LAST_BRIEF) ?? '{}'); return { ...blank, ...last } } catch { return blank }
  })
  const [error, setError] = useState(''), [done, setDone] = useState(''), [warn, setWarn] = useState(''), [busy, setBusy] = useState(false), [uploading, setUploading] = useState(false)
  // The campaign comes first (owner's buyer-side fixes): its brief and creative go with the bid unless "Edit for this bid" is chosen.
  const { list: campaigns, reload: reloadCampaigns } = useCampaigns(!guest), [campaignId, setCampaignId] = useCurrentCampaign()
  const campaign = campaigns.find(c => c.id === campaignId), [ownBrief, setOwnBrief] = useState(false), [adding, setAdding] = useState(false), [added, setAdded] = useState('')
  const editHere = !campaign || ownBrief
  function editForThisBid() { if (campaign?.brief) setBrief({ ...brief, ...campaign.brief, notes: brief.notes, fileName: campaign.brief.draftFileKey ? t('Campaign creative') : undefined }); setOwnBrief(true) }
  // Agencies: the client the booking is for (its budget, its brand safety, its receipts). A campaign made for a client decides it.
  const [clients, setClients] = useState<Client[]>([])
  const [clientId, setClientId] = useState(() => { try { return localStorage.getItem(LAST_CLIENT) ?? '' } catch { return '' } })
  useEffect(() => { if (!guest) api<Client[]>('/clients').then(c => { const active = c.filter(x => x.status === 'active'); setClients(active)
    if (!active.some(x => x.id === clientId)) setClientId('') }, () => {}) }, [])
  const campaignClient = campaign?.clientId ?? ''
  const forClient = campaignClient || clientId
  function pickClient(id: string) {
    const was = clients.find(c => c.id === forClient), next = clients.find(c => c.id === id)
    setClientId(id)
    // the brief follows the client unless the buyer typed another advertiser
    if (next && (!brief.advertiser || brief.advertiser === was?.name))
      setBrief({ ...brief, advertiser: next.name, ...(next.industry ? { industry: next.industry } : {}) })
  }
  async function file(x: File) {
    setUploading(true); setError('')
    try { const u = await upload(x); setBrief({ ...brief, draftFileKey: `files/${u.id}`, fileName: u.name, creativeToFollow: false }) } catch (e: any) { setError(e.message) } finally { setUploading(false) }
  }
  /** "+ Add to campaign": the product this slot belongs to goes into the chosen campaign's plan. */
  async function addToCampaign(id = campaignId) {
    if (!id) { setAdding(true); return }
    setError('')
    try { await api(`/campaigns/${id}/lines`, { method: 'POST', body: { placementId: s!.placementId } }); setCampaignId(id); setAdding(false)
      setAdded(t('Added to {name}.', { name: campaigns.find(c => c.id === id)?.name ?? '' })); reloadCampaigns() } catch (e: any) { setError(e.message) }
  }

  const load = () => api<Detail>(`/slots/${slotId}`).then(d => { setS(d); setAmount(String(d.minNextBid / 100))
    if (d.yourAutoMax) { setAuto(true); setMax('') } }, e => setError(e.message))
  // What the buyer is already committed to if every bid it leads wins and every request is accepted (a warning, never a block).
  const [exposure, setExposure] = useState<{ total: number; leading: { count: number }; requests: { count: number }; toPay: { count: number } } | null>(null)
  useEffect(() => { load(); if (!guest) api('/buyer/exposure').then(setExposure, () => {}) }, [slotId])
  // Another buyer bid or the slot was booked: show the new state at once. What the buyer typed stays, unless it is now too low.
  useLive('slot', d => { if (d.id === slotId) api<Detail>(`/slots/${slotId}`).then(n => { setS(n)
    setAmount(a => toFils(a || '0') < n.minNextBid ? String(n.minNextBid / 100) : a) }, () => {}) }, 200)
  // In the last hour of bidding, count down the minutes.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const x = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(x) }, [])

  async function send(path: string, body: object, message: string | ((r: any) => string)) {
    setBusy(true); setError(''); setDone(''); setWarn('')
    try {
      const { fileName: _, ...own } = brief
      // with a campaign, its brief goes unless edited here; without one, the brief filled in here (once per slot)
      const b = !editHere || (!campaign && s!.briefOnFile) ? {} : { brief: { ...own, languageOther: own.language === 'other' ? own.languageOther?.trim() : undefined, landingUrl: own.landingUrl || undefined,
        notes: own.notes || undefined, disclaimer: own.disclaimer?.trim() || undefined, draftFileKey: own.draftFileKey || undefined, creativeToFollow: !own.draftFileKey || !!own.creativeToFollow } }
      const r = await api<any>(path, { method: 'POST', body: { ...body, ...b, ...(campaignId ? { campaignId } : {}), ...(forClient && !campaignClient ? { clientId: forClient } : {}) } })
      if (r?.beatenByAutoBid) message = () => ''
      if (r?.beatenByAutoBid) setWarn(t("Your bid is in, but another buyer's auto-bid is higher, so you are not leading. The top bid is now {top}. Bid at least {min}, or set a higher maximum.", { top: money(r.topAmount), min: money(r.minNextBid) }))
      message = typeof message === 'string' ? message : message(r)
      try { localStorage.setItem(LAST_CLIENT, clientId) } catch { /* fine */ }
      if (!campaign && !s!.briefOnFile) try { localStorage.setItem(LAST_BRIEF, JSON.stringify({ ...own, draftFileKey: undefined })) } catch { /* private mode: nothing to remember */ }
      if (message) setDone(message); onDone(); await load(); if (campaign) reloadCampaigns()
    } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }
  if (!s) return <Shell onClose={onClose}>{error ? <p className="error">{error}</p> : <p className="muted">{t("Loading…")}</p>}</Shell>

  const weekLong = !!s.endsAt && new Date(s.endsAt).getTime() - new Date(s.startsAt).getTime() >= 86_400_000
  const when = weekLong ? `${dayLabel(dubai(s.startsAt).date, { day: 'numeric', month: 'short' })} – ${dayLabel(addDays(dubai(s.endsAt!).date, -1), { day: 'numeric', month: 'short' })}`
    : isAllDay(s) ? dayLabel(dubai(s.startsAt).date, { weekday: 'short', day: 'numeric', month: 'short' })
    : !hasTime(s.channel) ? dayLabel(dubai(s.startsAt).date, { weekday: 'short', day: 'numeric', month: 'short' })
    : `${dayLabel(dubai(s.startsAt).date)} · ${time(s.startsAt)}${!s.endsAt ? '' : seconds(s) < 120 ? ` · ${t('{n} seconds', { n: seconds(s) })}` : `–${time(s.endsAt)}`}`
  const closes = new Date(s.closesAt)
  return (
    <Shell onClose={onClose} title={tmTitle(s.title ?? `${s.outlet} · ${s.placement}`)} sub={[s.label !== s.placement ? tm(s.label) : '', when].filter(Boolean).join(' · ')} mark={<OutletMark name={s.brand ?? s.outlet} url={s.logoUrl} size={48} />}>
      <div className="row-flex"><SaleType t={s.saleType} /><span className="small">{status(s)}</span></div>
      {s.saleType === 'auction' && s.available && closes.getTime() - now < 3_600_000 && closes.getTime() > now && <p className="bid-countdown" role="timer" aria-live="off">
        {t('Bidding closes in {time}', { time: `${Math.floor((closes.getTime() - now) / 60_000)}:${String(Math.floor((closes.getTime() - now) / 1000) % 60).padStart(2, '0')}` })}</p>}
      {s.saleType === 'auction' && <p className="small muted">{hasTime(s.channel) ? t('Bidding closes {date}, {time} (Dubai time)', { date: dayLabel(dubai(s.closesAt).date, { weekday: 'short', day: 'numeric', month: 'short' }), time: time(s.closesAt) })
        : t('Bidding closes {when}', { when: slotWhen(s.closesAt, s.channel) })}</p>}

      {s.details && !!(s.details.description || s.details.specs || s.details.language || s.details.notAccepted?.length) && <dl className="facts placement-facts">
        {s.details.description && <div><dt>{t('What you get')}</dt><dd>{s.details.description}</dd></div>}
        {s.details.specs && <div><dt>{t('Creative specs')}</dt><dd>{s.details.specs}</dd></div>}
        {s.details.language && <div><dt>{t('Ad language')}</dt><dd>{t(LANGUAGE[s.details.language] ?? s.details.language)}</dd></div>}
        {s.details.notAccepted?.length ? <div><dt>{t('Does not accept')}</dt><dd>{s.details.notAccepted.map(i => t(i)).join(', ')}</dd></div> : null}
        <div><dt>{t('Creative due')}</dt><dd>{slotWhen(s.creativeDueAt, s.channel)}</dd></div>
      </dl>}
      <Reach audience={s.audience} reach={s.reach} reachUnit={s.reachUnit} notes={s.notes} />
      {s.publisher && <div className="drawer-seller"><span className="small muted">{t('Sold by')}</span><CompanyCard p={s.publisher} compact /></div>}
      <dl className="prices">
        <div><dt>{s.saleType === 'auction' ? t('Starting price') : s.saleType === 'fixed' ? t('Price') : t('Asking price')}</dt><dd className="num">{money(s.startingPrice)}</dd></div>
        {s.saleType === 'auction' && <div><dt>{t("Current top bid")}</dt><dd className="num">{s.topBid ? money(s.topBid) : t('No bids yet')}<small>{t('{n} bids · bidders anonymous', { n: s.bids })}</small></dd></div>}
        {s.saleType === 'auction' && <div><dt>{t("Minimum next bid")}</dt><dd className="num">{money(s.minNextBid)}<small>+3%</small></dd></div>}
        {s.buyNowPrice && <div><dt>{t("Buy now")}</dt><dd className="num">{money(s.buyNowPrice)}<small>{t("Request to book: the publisher must accept")}</small></dd></div>}
      </dl>

      {s.saleType === 'auction' && !guest && s.yourDeal?.kind === 'auction' && <p className="ok">{t('You won this slot.')} <a href={`/bookings/${s.yourDeal.id}`}>{t('See it in Bookings')}</a></p>}
      {s.available && guest && <SignInPrompt to={s.saleType === 'auction' ? 'bid on this slot' : 'book this slot'} />}
      {s.available && !guest && <>
        {/* the campaign first (owner's buyer-side fixes); optional */}
        <section className="form bd-campaign">
          <div className="field"><label htmlFor="camp">{t('Campaign (optional)')}</label>
            <select id="camp" value={campaignId} onChange={e => { setCampaignId(e.target.value); setOwnBrief(false) }}><option value="">{t('No campaign')}</option>
              {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          {campaign && !ownBrief && <div className="bd-brief" role="note">
            <p className="small">{t('Your campaign brief and creative will be sent to {outlet}.', { outlet: s.brand ?? s.outlet })}</p>
            {campaign.brief ? <p className="bd-brief-p"><b dir="auto">{campaign.brief.advertiser}</b> · {t(campaign.brief.industry)}<br /><span dir="auto">{campaign.brief.message}</span></p>
              : <p className="small warn">{t('This campaign has no brief yet.')}</p>}
            <button type="button" className="linkish small" onClick={editForThisBid}>{t('Edit for this bid')}</button></div>}
        </section>

        {clients.length > 0 && <div className="field"><label htmlFor="client">{t('Client (optional)')}</label>
          <select id="client" value={forClient} disabled={!!campaignClient} onChange={e => pickClient(e.target.value)}><option value="">{t('No client')}</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          {campaignClient && <span className="small muted">{t('Set by the campaign.')}</span>}</div>}

        {editHere && !(!campaign && s.briefOnFile) && <section className="form">
          <h3>{ownBrief ? t('Brief for this bid') : t('Booking brief')}</h3>
          {ownBrief && <p className="small muted">{t('Only this bid uses these changes; the campaign keeps its brief.')} <button type="button" className="linkish" onClick={() => setOwnBrief(false)}>{t('Use the campaign brief')}</button></p>}
          <div className="field"><label htmlFor="adv">{t("Advertiser or brand")} <span className="req">*</span></label><input id="adv" dir="auto" value={brief.advertiser} onChange={e => setBrief({ ...brief, advertiser: e.target.value })} /></div>
          <div className="field"><label htmlFor="ind">{t("Industry")} <span className="req">*</span></label><IndustryPick id="ind" value={brief.industry} onChange={v => setBrief({ ...brief, industry: v })} /></div>
          <div className="field"><label htmlFor="msg">{t('What the ad will say')} <span className="req">*</span> <span className="muted">({brief.message.length}/280)</span></label>
            <textarea id="msg" dir="auto" rows={3} maxLength={280} value={brief.message} onChange={e => setBrief({ ...brief, message: e.target.value })} /></div>
          <div className="field"><label htmlFor="lang">{t("Creative language")} <span className="req">*</span></label><div className="ed-pick"><select id="lang" value={brief.language} onChange={e => setBrief({ ...brief, language: e.target.value as B['language'] })}>
            <option value="english">{t("English")}</option><option value="arabic">{t("Arabic")}</option><option value="bilingual">{t("Bilingual")}</option><option value="other">{t('Other')}</option></select>
            {brief.language === 'other' && <input aria-label={t('Which language')} placeholder={t('Which language')} dir="auto" maxLength={60} value={brief.languageOther ?? ''} onChange={e => setBrief({ ...brief, languageOther: e.target.value })} />}</div></div>
          {s.channel === 'digital' && <div className="field"><label htmlFor="url">{t("Landing page link")} <span className="req">*</span></label><input id="url" dir="ltr" placeholder="https://" value={brief.landingUrl ?? ''} onChange={e => setBrief({ ...brief, landingUrl: e.target.value })} /></div>}
          <div className="field"><span className="label">{t('Creative')} <span className="req">*</span></span><div className="cp-creative">
            <label className={`btn ${uploading ? 'disabled' : ''}`}><input type="file" className="visually-hidden" disabled={uploading} onChange={e => e.target.files?.[0] && file(e.target.files[0])} />
              {uploading ? t('Uploading…') : brief.draftFileKey ? t('Replace file') : t('Upload a file')}</label>
            {brief.draftFileKey ? <span className="small"><bdi>{brief.fileName}</bdi> <button type="button" className="linkish" onClick={() => setBrief({ ...brief, draftFileKey: undefined, fileName: undefined, creativeToFollow: true })}>{t('Remove')}</button></span>
              : <label className="check"><input type="checkbox" checked={!!brief.creativeToFollow} onChange={e => setBrief({ ...brief, creativeToFollow: e.target.checked })} /> {t("Creative to follow")}</label>}</div></div>
          <div className="field"><label htmlFor="disc">{t('Required disclaimer or licence number (optional)')}</label>
            <input id="disc" dir="auto" maxLength={500} value={brief.disclaimer ?? ''} onChange={e => setBrief({ ...brief, disclaimer: e.target.value })} placeholder={t('e.g. Licensed by the Central Bank of the UAE')} />
            <span className="small muted">{t('The publisher must include it and confirm it in their proof.')}</span></div>
          <div className="field"><label htmlFor="notes">{t("Notes for the publisher (optional)")}</label><textarea id="notes" dir="auto" rows={2} value={brief.notes ?? ''} onChange={e => setBrief({ ...brief, notes: e.target.value })} />
            <span className="small muted">{t("Emails and phone numbers are not allowed. Talk to the publisher through Nashr.")}</span></div>
        </section>}

        {s.saleType === 'auction' ? <section className="form">
          <BidStatus s={s} />
          <div className="seg bid-mode" role="radiogroup" aria-label={t('How to bid')}>
            <button type="button" role="radio" aria-checked={!auto} className={!auto ? 'on' : ''} onClick={() => setAuto(false)}>{t('Single bid')}</button>
            <button type="button" role="radio" aria-checked={auto} className={auto ? 'on' : ''} onClick={() => setAuto(true)}>{t('Auto-bid')}</button></div>
          {!auto ? <div className="field"><label htmlFor="amt">{t("Your bid (excl. VAT)")}</label>
            <div className="money-input"><span aria-hidden>{t("AED")}</span><input id="amt" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></div>
            <div className="quick-add" aria-label={t("Raise your bid")}>{[100, 250, 500].map(n => <button key={n} type="button" className="btn"
              onClick={() => setAmount(String(Math.max(Number(amount.replace(/,/g, '')) || 0, s.minNextBid / 100) + n))}>+{n}</button>)}</div></div>
          : <div className="field"><label htmlFor="max">{s.youLead && s.yourAutoMax ? t('New maximum (excl. VAT)') : t('Your maximum (excl. VAT)')}</label>
            <div className="money-input"><span aria-hidden>{t("AED")}</span><input id="max" inputMode="decimal" value={max} placeholder={String(Math.max(s.minNextBid, (s.yourAutoMax ?? 0) + 100) / 100)} onChange={e => setMax(e.target.value)} /></div>
            <div className="quick-add" aria-label={t("Raise your maximum")}>{[500, 1000, 2500].map(n => <button key={n} type="button" className="btn"
              onClick={() => setMax(String(Math.max(Number(max.replace(/,/g, '')) || 0, (s.yourAutoMax ?? s.minNextBid) / 100) + n))}>+{n}</button>)}</div>
            <span className="small muted">{s.youLead
              ? t('You lead at {top}. Raising your maximum does not raise your bid; we only bid more when someone challenges you.', { top: money(s.topBid!) })
              : t('We bid {min} for you now, then only what it takes to stay ahead, in 3% steps, up to your maximum. Other buyers never see it. If you win, you pay the final bid, not your maximum.', { min: money(s.minNextBid) })}</span></div>}
        </section> : s.saleType === 'fixed' ? <p className="small">{t('A fixed price: the first buyer to book takes the slot. The publisher confirms within 24 hours, and you pay only then.')}</p> : <section className="form">
          <div className="field"><label htmlFor="offer">{t("Your offer (AED, optional, not below the asking price)")}</label><input id="offer" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></div>
        </section>}

        {/* the campaign's budget, the buyer's only: what is left, and what is left after this bid */}
        {campaign && campaign.remaining != null && (() => {
          const price = s.saleType === 'auction' ? (auto ? toFils(max) || s.minNextBid : toFils(amount) || 0) : s.saleType === 'fixed' ? s.startingPrice : toFils(amount) || s.startingPrice
          const after = campaign.remaining - price
          return <p className={`bd-budget small ${after < 0 ? 'over' : ''}`} role="note">{t('{left} left · after this bid {after}', { left: money(campaign.remaining), after: money(after) })}
            <span className="muted"> · {t('Only you see this.')}</span></p> })()}

        {exposure && s.saleType === 'auction' && (() => {
          const bid = (auto ? toFils(max) : toFils(amount)) || 0, mine = s.youLead && s.topBid ? s.topBid : 0, withThis = exposure.total - mine + bid
          const n = exposure.leading.count + exposure.requests.count + exposure.toPay.count
          return <div className="exposure" role="note">
            <span className="small muted">{n ? t('If everything you lead or requested goes through') : t('Nothing else you lead or requested yet')}</span>
            <dl className="exposure-sum num"><div><dt>{t('Now')}</dt><dd>{money(exposure.total)}</dd></div><div><dt>{t('With this bid')}</dt><dd><b>{money(withThis)}</b></dd></div></dl>
            <span className="small muted">{t('Excluding VAT. Bids are binding, so plan within your budget.')}</span></div> })()}
        {adding && <div className="bd-add" role="group" aria-label={t('Add to campaign')}>
          {campaigns.length ? <><select aria-label={t('Campaign')} defaultValue="" onChange={e => e.target.value && addToCampaign(e.target.value)}><option value="">{t('Choose a campaign…')}</option>
            {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select><a className="small" href="/campaigns?new=1">+ {t('New campaign')}</a></>
            : <span className="small">{t('No campaign yet.')} <a href="/campaigns?new=1">{t('New campaign')}</a></span>}</div>}
        {added && <p className="ok small" role="status">{added} <a href={`/campaigns/${campaignId}`}>{t('Open the campaign')}</a></p>}
        {error && <p className="error" role="alert">{error}</p>}
        {done && <p className="ok" role="status">{done}</p>}
        {warn && <p className="warn" role="status">{warn}</p>}
        <p className="small muted">{t("You'll be asked to pay once the publisher accepts. Nothing is charged now.")}</p>
        <footer className="drawer-f">
          {s.saleType === 'auction'
            ? (auto
              ? <button className="btn primary" disabled={busy || new Date() >= closes || !(toFils(max) >= (s.youLead ? (s.yourAutoMax ?? s.topBid ?? 0) + 1 : s.minNextBid))}
                  onClick={() => send(`/slots/${s.id}/bids`, { amount: s.youLead && s.topBid ? s.topBid : s.minNextBid, maxAmount: toFils(max) },
                    r => r.leading ? t('Auto-bid is on. You lead at {top}; we bid for you up to {max}.', { top: money(r.topAmount), max: money(r.yourMax) }) : '')}>
                  {s.youLead && s.yourAutoMax ? t('Raise maximum to {amount}', { amount: money(toFils(max) || 0) }) : t('Start auto-bid up to {amount}', { amount: money(toFils(max) || 0) })}</button>
              : <button className="btn primary" disabled={busy || new Date() >= closes} onClick={() => send(`/slots/${s.id}/bids`, { amount: toFils(amount) }, r => r.leading ? t('Your bid is in. You lead at {top}.', { top: money(r.topAmount) }) : '')}>{t('Place bid {amount}', { amount: money(toFils(amount) || 0) })}</button>)
            : s.saleType === 'fixed'
              ? <button className="btn primary" disabled={busy} onClick={() => send(`/slots/${s.id}/book`, {}, r => r.status === 'accepted_pay_now'
                  ? t('Booked and confirmed. Pay from Bookings to secure it.') : t('Booked. The publisher confirms within 24 hours; you pay only then.'))}>{t('Book for {price}', { price: money(s.startingPrice) })}</button>
            : <button className="btn primary" disabled={busy} onClick={() => send(`/slots/${s.id}/interest`, amount && toFils(amount) !== s.startingPrice ? { amount: toFils(amount) } : {}, t('Interest sent. The publisher accepts one buyer before bidding closes; you will be told either way, and pay only if accepted.'))}>{t("Show interest")}</button>}
          {s.placementId && <button type="button" className="btn plan-add" onClick={() => addToCampaign()}>+ {t('Add to campaign')}</button>}
          {s.buyNowPrice && s.saleType === 'auction' && <button className="btn" disabled={busy} onClick={() => send(`/slots/${s.id}/buy-now`, {}, t('Request sent. The publisher will reply within 24 hours.'))}>{t('Request at {price}', { price: money(s.buyNowPrice) })}</button>}
        </footer>
      </>}
    </Shell>
  )
}

function Shell({ title, sub, mark, onClose, children }: { title?: string; sub?: string; mark?: React.ReactNode; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); addEventListener('keydown', k); return () => removeEventListener('keydown', k) }, [])
  return (
    <div className="scrim" onClick={onClose}>
      <aside className="drawer" role="dialog" aria-label={title} onClick={e => e.stopPropagation()}>
        <header className="drawer-h">{mark}<div className="drawer-t">{title && <h2>{title}</h2>}{sub && <p className="muted small">{sub}</p>}</div>
          <button className="btn" onClick={onClose} aria-label={t("Close")}>✕</button></header>
        {children}
      </aside>
    </div>
  )
}

/** Where the buyer stands on this slot, in one line: leading (and how far auto-bid will go) or outbid (and whether the maximum was passed). */
function BidStatus({ s }: { s: Detail }) {
  if (!s.youBid || !s.topBid) return null
  const auto = s.yourAutoMax
  if (s.youLead) return <p className="bid-status lead"><span className="dot lead">{t('You lead at {top}', { top: money(s.topBid) })}</span>
    <span className="small">{auto && auto > s.topBid ? t('Auto-bid is on, up to {max}.', { max: money(auto) })
      : auto ? t('Your maximum is reached. Raise it to stay ahead if someone bids.') : t('Turn on auto-bid to stay ahead without watching.')}</span></p>
  return <p className="bid-status outbid"><span className="dot outbid">{t('Outbid: the top bid is {top}', { top: money(s.topBid) })}</span>
    <span className="small">{auto ? t('Your maximum of {max} was passed. Set a higher one to get back in front.', { max: money(auto) }) : t('Bid again, or let auto-bid do it up to a maximum.')}</span></p>
}
