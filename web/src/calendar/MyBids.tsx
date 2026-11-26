import { useEffect, useRef, useState } from 'react'
import { Modal } from '../Modal'
import { api } from '../api'
import { dayLabel, money, slotWhen } from '../format'
import { OutletMark } from '../LogoPicker'
import { useLive } from '../live'
import { navigate } from '../nav'
import { dubai } from './layout'
import { t } from '../i18n'
import { tmTitle } from '../i18n-server'

type Line = { slotId: string; title: string; logoUrl: string | null; channel: string; startsAt: string; label: string; amount: number
  endsAt: string | null; dealId: string | null; status: 'lead' | 'outbid' | 'waiting' | 'pay' }

const STATUS: Record<Line['status'], [string, string]> = { lead: ['You lead', 'lead'], outbid: ['Outbid', 'outbid'], waiting: ['Waiting for seller', 'soon'], pay: ['Accepted, pay now', 'pay'] }

/** Time left in the shortest useful form: "2d 4h", "5h 20m", "12m". */
function left(iso: string | null, now: number) {
  if (!iso) return ''
  const m = Math.floor((new Date(iso).getTime() - now) / 60_000)
  if (m <= 0) return t('Ending now')
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60)
  return d ? t('{d}d {h}h left', { d, h }) : h ? t('{h}h {m}m left', { h, m: m % 60 }) : t('{m}m left', { m })
}

const KEY = 'nashr:mybids-open'
/**
 * "My bids", always beside the calendar (owner's buyer-side fixes, round 2), so the buyer can track bids while browsing. It folds to
 * a thin bar with the count. Outbid lines come first, in red, with "Bid again". A paid booking leaves (it is in Reports → Bookings),
 * and so does a lost bid. The Campaign drawer opens over it; closing the drawer shows it again.
 */
export function MyBids({ onOpen, reload, narrow, folded }: { onOpen: (slotId: string) => void; reload: number; narrow: boolean; folded?: boolean }) {
  const [items, setItems] = useState<Line[] | null>(null), [now, setNow] = useState(() => Date.now())
  // On the Calendar it starts as the buyer left it (open by default); on the Directory and outlet profile it starts folded
  // and opens by itself when the buyer is outbid (owner's "Buying moves to the Directory")
  const [open, setOpenRaw] = useState(() => { if (folded) return false; try { return localStorage.getItem(KEY) !== '0' && !narrow } catch { return !narrow } })
  const setOpen = (v: boolean) => { setOpenRaw(v); if (!folded) try { localStorage.setItem(KEY, v ? '1' : '0') } catch { /* private mode: this visit only */ } }
  const outbid = items?.filter(i => i.status === 'outbid').length ?? 0, seen = useRef<number | null>(null)
  // only a new outbid opens it: the ones already there when the page loaded show as the "!" on the folded bar
  useEffect(() => { if (!items) return; if (folded && !narrow && seen.current != null && outbid > seen.current) setOpenRaw(true); seen.current = outbid }, [outbid, folded, items])
  const load = () => api<{ items: Line[] }>('/buyer/my-bids').then(r => setItems(r.items), () => setItems([]))
  useEffect(() => { load() }, [reload])
  useLive('slot', () => load(), 1500)            // someone outbid you, or the publisher answered
  useLive('notification', () => load(), 1500)
  useEffect(() => { const x = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(x) }, [])
  const n = items?.length ?? 0
  const head = <button type="button" className="mb-head" aria-expanded={open} onClick={() => setOpen(!open)}>
    <b>{t('My bids ({n})', { n })}</b>
    {items?.some(i => i.status === 'outbid') && <span className="mb-alert" aria-label={t('Outbid')}>!</span>}
    <svg className={`mb-arrow ${open ? 'open' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden><path d="M9 6l6 6-6 6" /></svg>
  </button>
  // phones (owner's "Buying moves to the Directory"): a "My bids · N" button at the bottom of the screen opens the list full screen
  if (narrow && !open) return <button type="button" className={`mb-fab ${outbid ? 'alert' : ''}`} onClick={() => setOpenRaw(true)} aria-haspopup="dialog">
    {t('My bids · {n}', { n })}{outbid > 0 && <span className="mb-alert" aria-label={t('Outbid')}>!</span>}</button>
  if (!open) return <aside className="mybids folded" aria-label={t('My bids')}>{head}</aside>
  const sheet = (body: React.ReactNode) => narrow ? <Modal scrim="scrim mb-scrim" onClose={() => setOpenRaw(false)} label={t('My bids')}>
    <div className="mybids mb-sheet">{body}</div></Modal> : body
  const close = () => { setOpenRaw(false); if (!narrow && !folded) try { localStorage.setItem(KEY, '0') } catch { /* fine */ } }
  return sheet(
    <aside className={`mybids ${narrow ? 'narrow' : ''}`} aria-label={t('My bids')}>
      {narrow ? <div className="mb-head"><b>{t('My bids ({n})', { n })}</b><button type="button" className="btn sm" onClick={close} aria-label={t('Close')}>✕</button></div> : head}
      {!items ? <p className="muted small mb-empty">{t('Loading…')}</p>
        : !items.length ? <div className="mb-empty"><p className="muted small">{t('No bids yet. Click Bid / Buy on a product, or a price on an outlet\'s calendar.')}</p>
          {location.pathname !== '/directory' && <a className="btn sm" href="/directory">{t('Go to Directory')}</a>}</div>
        : <ul className="mb-list">{items.map(i => { const [label, cls] = STATUS[i.status]
          const go = () => { if (narrow) setOpenRaw(false); i.status === 'pay' && i.dealId ? navigate(`/bookings/${i.dealId}`) : onOpen(i.slotId) }
          return <li key={`${i.slotId}-${i.dealId ?? ''}`} className={`mb-line ${i.status}`}>
            <button type="button" className="mb-row" onClick={go}>
              <OutletMark name={i.title} url={i.logoUrl} size={28} />
              <span className="mb-what"><b dir="auto">{tmTitle(i.title)}</b>
                <span className="small muted">{i.channel ? slotWhen(i.startsAt, i.channel) : dayLabel(dubai(i.startsAt).date, { day: 'numeric', month: 'short' })}</span>
                <span className="mb-meta"><span className={`dot ${cls}`}>{t(label)}</span><span className="num">{money(i.amount)}</span></span>
                {i.endsAt && <span className="small muted">{left(i.endsAt, now)}</span>}</span>
            </button>
            {i.status === 'outbid' && <button type="button" className="btn sm mb-again" onClick={() => { if (narrow) setOpenRaw(false); onOpen(i.slotId) }}>{t('Bid again')}</button>}
            {i.status === 'pay' && i.dealId && <a className="btn sm mb-again" href={`/bookings/${i.dealId}`}>{t('Pay now')}</a>}
          </li> })}</ul>}
    </aside>
  )
}
