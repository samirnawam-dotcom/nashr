import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { money, slotWhen } from '../format'
import { t } from '../i18n'
import { tm } from '../i18n-server'
import { OutletMark } from '../LogoPicker'
import { CHANNEL_NAME } from '../media'
import { audienceLabel } from '../../../server/shared/audiences'
import { saleLabel } from '../calendar/CalendarPage'

/*
 * "Plan your campaign with Athena" (owner's doc), built from rules, no outside AI. Athena reads the campaign's dates, budget,
 * industry and brief plus what the buyer types, and suggests a split by media type and the best products for each part, each with
 * one line on why. The buyer changes the shares, keeps, removes or swaps lines, and adds the kept ones to the campaign as Added.
 * Bidding still happens one by one in the bid drawer. Athena never bids by itself.
 */
type Line = { placementId: string; slotId: string; title: string; brand: string; channel: string; logoUrl: string | null; saleType: string
  price: number; estimate: number; at: string; onSale: number; why: string[] }
type Part = { channel: string; share: number; amount: number; count: number; picks: Line[]; spare: Line[] }
type Plan = { read: { channels: string[]; sectors: string[]; dateFrom: string | null; dateTo: string | null; budget: number | null; audiences: string[]; languages: string[] }
  question: 'dates' | 'amount' | null; parts: Part[]; total: number }

/** One line on why a product fits, from what Athena matched. */
const why = (l: Line) => {
  const bits: string[] = []
  for (const w of l.why) { const [k, v] = w.split(':')
    if (k === 'aud') bits.push(t('reaches {who}', { who: t(audienceLabel(v)).toLowerCase() }))
    else if (k === 'dp') bits.push(v === 'morning' ? t('morning show') : v === 'evening' ? t('evening show') : t('afternoon show'))
    else if (k === 'sector') bits.push(t('accepts {sector}', { sector: t(v) }))
    else if (k === 'reach') bits.push(t('reach {n}', { n: Number(v).toLocaleString('en-US') }))
    else if (k === 'onSale') bits.push(t('{n} dates on sale in your dates', { n: Number(v) })) }
  const s = bits.join(', '); return s.charAt(0).toUpperCase() + s.slice(1) + '.'
}
const key = (l: Line) => `${l.placementId}:${l.slotId}`

export function AthenaPlan({ campaignId, autoFocus, onAdded }: { campaignId: string; autoFocus?: boolean; onAdded: (n: number) => void }) {
  const [text, setText] = useState(''), [plan, setPlan] = useState<Plan | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [shares, setShares] = useState<Record<string, number> | null>(null), [drop, setDrop] = useState<Set<string>>(new Set())
  const [swapped, setSwapped] = useState<Record<string, Line>>({}), [answer, setAnswer] = useState(''), [adding, setAdding] = useState(false)
  const box = useRef<HTMLInputElement>(null)
  useEffect(() => { if (autoFocus) box.current?.focus() }, [])
  async function run(words = text, s = shares) {
    setBusy(true); setError('')
    try { const p = await api<Plan>('/athena/plan', { method: 'POST', body: { campaignId, text: words, ...(s ? { shares: s } : {}) } })
      setPlan(p); setDrop(new Set()); setSwapped({}); if (!s) setShares(p.parts.length ? Object.fromEntries(p.parts.map(x => [x.channel, x.share])) : null) }
    catch (e: any) { setError(tm(e.message)) } finally { setBusy(false) }
  }
  const lines = (p: Part) => p.picks.map(l => swapped[key(l)] ?? l)
  const kept = plan ? plan.parts.flatMap(p => lines(p).filter(l => !drop.has(key(l)))) : []
  const total = kept.reduce((n, l) => n + l.estimate, 0)
  async function add() {
    setAdding(true); setError('')
    try { for (const l of kept) await api(`/campaigns/${campaignId}/lines`, { method: 'POST', body: { placementId: l.placementId, slotId: l.slotId } })
      const n = kept.length; setPlan(null); setText(''); setShares(null); onAdded(n) }
    catch (e: any) { setError(tm(e.message)) } finally { setAdding(false) }
  }
  const shareSum = shares ? Object.values(shares).reduce((a, b) => a + b, 0) : 100
  const budget = plan?.read.budget ?? null

  return <section className="card athena-plan" aria-labelledby="ap-h">
    <form className="ap-ask" onSubmit={e => { e.preventDefault(); setShares(null); run(text, null) }}>
      <h3 id="ap-h" className="visually-hidden">{t('Plan your campaign with Athena')}</h3>
      <span className="pc-why-a">{t('Athena')}</span>
      <input ref={box} className="search" value={text} onChange={e => setText(e.target.value)} maxLength={500}
        placeholder={t('Plan your campaign with Athena')} aria-label={t('Plan your campaign with Athena')} />
      <button className="btn primary" disabled={busy}>{busy ? t('Planning…') : t('Plan')}</button>
      {plan && <button type="button" className="text-link" onClick={() => { setPlan(null); setText(''); setShares(null) }}>{t('Clear')}</button>}
    </form>
    {!plan && <p className="small muted">{t('Athena uses the campaign\'s dates, budget, industry and brief. Add anything else, for example: "mostly radio and online, business people".')}</p>}
    {error && <p className="error" role="alert">{error}</p>}

    {plan?.question && <form className="row-flex athena-q" onSubmit={e => { e.preventDefault(); const both = `${text} ${answer}`; setText(both); setAnswer(''); run(both, null) }}>
      <label htmlFor="ap-q">{plan.question === 'dates' ? t('Which dates? For example: 1–14 Dec.') : t("What's the budget? For example: AED 55,000.")}</label>
      <input id="ap-q" className="search" value={answer} onChange={e => setAnswer(e.target.value)} placeholder={plan.question === 'dates' ? t('1–14 Dec') : 'AED 55,000'} />
      <button className="btn sm">{t('OK')}</button></form>}

    {plan && !plan.question && !plan.parts.length && <p className="muted">{t('Nothing on sale in these dates for this industry. Try other dates or another media type.')}</p>}

    {plan && plan.parts.length > 0 && <>
      <p className="ap-total"><b className="num">{t('Estimated {a} of {b}', { a: money(total), b: budget != null ? money(budget) : '—' })}</b>
        {budget != null && total > budget && <span className="error small"> · {t('Over budget: remove a line or lower a share.')}</span>}
        <span className="small muted"> · {t('Auctions are costed 10% above their price now, in case bids go up.')}</span></p>
      <div className="table-wrap"><table className="table ap-split"><thead><tr><th>{t('Part')}</th><th className="r">{t('Share')}</th><th className="r">{t('Amount')}</th><th>{t('Why')}</th></tr></thead>
        <tbody>{plan.parts.map(p => <tr key={p.channel}><td><b>{CHANNEL_NAME[p.channel] ?? p.channel}</b></td>
          <td className="r"><span className="ap-share"><input type="number" min={0} max={100} step={5} aria-label={t('Share for {part}', { part: CHANNEL_NAME[p.channel] ?? p.channel })}
            value={shares?.[p.channel] ?? p.share} onChange={e => setShares({ ...(shares ?? {}), [p.channel]: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} />%</span></td>
          <td className="r num">{money(p.amount)}</td>
          <td className="small">{plan.read.sectors.length ? t('{n} products accept {sector} with dates on sale in your dates', { n: p.count, sector: plan.read.sectors.map(s => t(s)).join(', ') })
            : t('{n} products with dates on sale in your dates', { n: p.count })}</td></tr>)}</tbody></table></div>
      {shares && JSON.stringify(shares) !== JSON.stringify(Object.fromEntries(plan.parts.map(x => [x.channel, x.share]))) && <p className="row-flex">
        <button className="btn" disabled={busy || shareSum !== 100} onClick={() => run(text, shares)}>{t('Update the options')}</button>
        {shareSum !== 100 && <span className="small error">{t('The shares add up to {n}%. Make them 100%.', { n: shareSum })}</span>}</p>}

      {plan.parts.map(p => <div key={p.channel} className="ap-part"><h4>{CHANNEL_NAME[p.channel] ?? p.channel} <span className="small muted">· {money(p.amount)}</span></h4>
        {!p.picks.length && <p className="small muted">{t('Nothing fits this amount. Give this part a bigger share.')}</p>}
        <ul className="ap-lines">{lines(p).map((l, i) => { const k = key(l), off = drop.has(k), orig = p.picks[i]
          return <li key={key(orig)} className={off ? 'off' : ''}>
            <label className="check"><input type="checkbox" checked={!off} onChange={() => setDrop(d => { const n = new Set(d); n.has(k) ? n.delete(k) : n.add(k); return n })} />
              <span className="visually-hidden">{t('Keep {name}', { name: l.title })}</span></label>
            <OutletMark name={l.brand} url={l.logoUrl} size={30} />
            <span className="ap-what"><b dir="auto">{l.title}</b><span className="small muted">{slotWhen(l.at, l.channel)} · {saleLabel(l.saleType)}</span><span className="small">{why(l)}</span></span>
            <span className="num ap-price">{money(l.estimate)}</span>
            {p.spare.length > 0 && <select className="cal-input ap-swap" aria-label={t('Swap {name}', { name: l.title })} value="" onChange={e => {
                const to = p.spare.find(x => key(x) === e.target.value); if (to) setSwapped(s => ({ ...s, [key(orig)]: to })) }}>
              <option value="">{t('Swap…')}</option>{p.spare.map(x => <option key={key(x)} value={key(x)}>{x.title} · {money(x.estimate)}</option>)}</select>}
          </li> })}</ul></div>)}
      <p className="row-flex"><button className="btn primary" disabled={adding || !kept.length} onClick={add}>
        {adding ? t('Adding…') : t('Add {n} to campaign', { n: kept.length })}</button>
        <span className="small muted">{t('They are added as Added. You bid on each one in the bid drawer, as usual.')}</span></p>
    </>}
  </section>
}
