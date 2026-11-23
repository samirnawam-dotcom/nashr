import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { api } from '../api'
import { navigate } from '../nav'
import { t } from '../i18n'
import './onboarding.css'

/*
 * Guided onboarding (owner's "Buying moves to the Directory"): a short tour on the first sign-in, a "Get started" list on the
 * Dashboard, and small "?" tips on words new users won't know. The tour points at one thing at a time and dims the rest; the user
 * does each step themselves (click the highlighted part, or Next when there is nothing to click). Clicking elsewhere pauses it.
 * Athena is not built yet, so its sentence and its checklist line are left out, as the document says.
 */

type Step = { at: string | string[]; text: string; click?: boolean; then?: { at: string; text: string }; after?: () => void; page?: string }
const side = (href: string) => [`.side-nav a[href="${href}"]`, `.tabbar a[href="${href}"]`, `.topbar .nav a[href="${href}"]`]

const BUYER: Step[] = [
  { at: side('/directory'), click: true, text: t('This is where you find and buy media. Type a name in the search bar.') },
  { at: '.dir-bar', page: '/directory', text: t('Browse by outlet or by product. Narrow down with the filters; More filters has sectors and dates.') },
  { at: '.outlet-card a.badge.on', page: '/directory', click: true, text: t("Open an outlet's calendar."),
    then: { at: '.oc-cal .cv-cell:not(.closed), .oc-cal .cv-items button', text: t('Click a price to bid.') } },
  { at: '.drawer', text: t("Pick a campaign, or fill in your brief and creative. Then press Bid. The seller sees your brief and creative before accepting. Your bids then show in My bids on the right. We won't send anything now."),
    after: () => (document.querySelector('.drawer [aria-label="Close"]') as HTMLElement | null)?.click() }, // Next closes the drawer; nothing is sent
  { at: side('/campaigns'), text: t('Plan many products under one budget and one brief.') },
  { at: side('/calendar'), text: t("Track everything you've bid on or booked. The colours show where each one is; tap ? to see what they mean. Anything that needs you, like paying, also shows in your Inbox.") },
]
const SELLER: Step[] = [
  { at: side('/listings'), click: true, text: t('Your outlets and the products they sell live here.') },
  { at: 'a[href="/listings/new"]', page: '/listings', text: t('Start by adding your outlet: logo, name, media type.') },
  { at: side('/schedule'), text: t('Put a product on sale for dates, and pick the sale type and price.') },
  { at: side('/inbox'), text: t('Bids arrive here with the brief and creative. Accept or decline.') },
  { at: side('/reports'), text: t("See what you've sold and what you'll be paid.") },
]

type TourState = { step: number; sub: 0 | 1; paused: boolean } | null
const keyOf = (who: string) => `nashr:tour:${who}`
const read = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const write = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* private mode: this visit only */ } }

/** "Take the tutorial again" (account menu) restarts it from anywhere. */
export const replayTour = () => dispatchEvent(new Event('nashr:tour'))

const find = (at: string | string[]) => { for (const s of Array.isArray(at) ? at : [at]) { const el = [...document.querySelectorAll<HTMLElement>(s)].find(e => e.offsetParent !== null || e.getClientRects().length); if (el) return el } return null }

export function Tour({ role, who }: { role: 'buyer' | 'seller'; who: string }) {
  const steps = role === 'buyer' ? BUYER : SELLER, k = keyOf(who)
  // nashr:tour:off: the automated journeys turn the first-visit welcome off (the tour itself has its own journey)
  const [state, setState] = useState<TourState>(null), [welcome, setWelcome] = useState(() => !read(k) && !read('nashr:tour:off')), [skip, setSkip] = useState(false), [done, setDone] = useState(false)
  const [box, setBox] = useState<DOMRect | null>(null), target = useRef<HTMLElement | null>(null)
  useEffect(() => { const f = () => { setWelcome(false); setDone(false); start() }; addEventListener('nashr:tour', f); return () => removeEventListener('nashr:tour', f) }, [])
  const start = () => { write(k, 'started'); setState({ step: 0, sub: 0, paused: false }) }
  const finish = (how: 'done' | 'skipped') => { write(k, how); setState(null); setSkip(false); if (how === 'done') setDone(true) }
  const cur = state ? steps[state.step] : null, part = cur && state!.sub === 1 && cur.then ? cur.then : cur
  const next = () => setState(s => { if (!s) return s
    const st = steps[s.step]; if (st.then && s.sub === 0) return { ...s, sub: 1 }
    st.after?.()
    if (s.step + 1 >= steps.length) { finish('done'); return null }
    return { step: s.step + 1, sub: 0, paused: false } })
  /** this part moves on when its highlighted thing is clicked (otherwise: Next) */
  const waits = (s: NonNullable<TourState>) => (s.sub === 0 && !!steps[s.step].click) || s.sub === 1
  const back = () => setState(s => s && (s.sub === 1 ? { ...s, sub: 0 } : s.step > 0 ? { step: s.step - 1, sub: 0, paused: false } : s))

  // follow the highlighted part: find it (waiting for the page to load it), keep the spotlight on it, skip the step if it never shows
  useLayoutEffect(() => {
    if (!state || state.paused || !part) { setBox(null); return }
    setBox(null); target.current = null
    if (cur?.page && state.sub === 0 && !location.pathname.startsWith(cur.page)) navigate(cur.page)
    let alive = true, tries = 0
    const tick = () => { if (!alive) return
      const el = find(part.at); target.current = el
      if (el) { if (tries === 0 || !box) el.scrollIntoView({ block: 'nearest' }); setBox(el.getBoundingClientRect()) }
      else if (++tries > 25) { next(); return } // nothing to point at (e.g. no outlets yet): this step is skipped
      raf = window.setTimeout(tick, el ? 250 : 200) }
    let raf = window.setTimeout(tick, 60)
    return () => { alive = false; clearTimeout(raf) }
  }, [state?.step, state?.sub, state?.paused])

  // clicks: on the highlighted part moves on (when the step asks for a click); anywhere else pauses the tour
  useEffect(() => {
    if (!state || state.paused) return
    const onClick = (e: MouseEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('.tour-pop, .tour-paused')) return
      if (!target.current) return // still finding what to point at
      if (target.current && target.current.contains(el)) { if (waits(state)) setTimeout(next, 30); return }
      if (cur && state.step === 3 && el.closest('.drawer')) return // the bid drawer step: they can look around inside it
      setState(s => s && { ...s, paused: true })
    }
    document.addEventListener('click', onClick, true); return () => document.removeEventListener('click', onClick, true)
  }, [state?.step, state?.sub, state?.paused])

  if (welcome) return <div className="tour-scrim" role="dialog" aria-modal="true" aria-labelledby="tour-w">
    <div className="tour-card"><h2 id="tour-w">{t('Welcome to Nashr. Want a 2-minute tour?')}</h2>
      <div className="row-flex"><button className="btn primary" autoFocus onClick={() => { setWelcome(false); start() }}>{t('Start tour')}</button>
        <button className="btn" onClick={() => { setWelcome(false); write(k, 'later') }}>{t('Not now')}</button></div></div></div>
  if (done) return <div className="tour-scrim" role="dialog" aria-modal="true" aria-labelledby="tour-d">
    <div className="tour-card"><h2 id="tour-d">{t("You're set. Your next steps are in the Get started list on your Dashboard.")}</h2>
      <div className="row-flex"><button className="btn primary" autoFocus onClick={() => { setDone(false); navigate(role === 'buyer' ? '/dashboard' : '/home') }}>{t('Go to Dashboard')}</button>
        <button className="btn" onClick={() => setDone(false)}>{t('Close')}</button></div></div></div>
  if (!state || !part) return null
  if (state.paused) return <div className="tour-paused" role="status"><span>{t('Tour paused')}</span>
    <button className="text-link" onClick={() => setState({ ...state, paused: false })}>{t('Resume')}</button>
    <button className="text-link muted" onClick={() => setSkip(true)}>{t('Skip tutorial')}</button>
    {skip && <SkipAsk onYes={() => finish('skipped')} onNo={() => setSkip(false)} />}</div>

  if (!box) return null // the popup shows once it has something to point at
  const pad = 6, r = box
  // below the highlighted part if there is room, else above it, else beside it (a tall panel such as the bid drawer)
  const W = 340, H = 220, rtl = document.dir === 'rtl', clampX = (x: number) => Math.max(12, Math.min(x, innerWidth - W - 12))
  const startX = rtl ? innerWidth - r.right : r.left
  const pos: React.CSSProperties = r.bottom + H < innerHeight ? { top: r.bottom + 12, insetInlineStart: clampX(startX) }
    : r.top - H > 0 ? { top: r.top - 12, transform: 'translateY(-100%)', insetInlineStart: clampX(startX) }
    : { top: Math.max(12, Math.min(r.top + 40, innerHeight - H - 12)), left: r.left > innerWidth - r.right ? Math.max(12, r.left - W - 16) : Math.min(innerWidth - W - 12, r.right + 16) }
  const waitsForClick = waits(state)
  return <>
    {r && <div className="tour-spot" style={{ top: r.top - pad, left: r.left - pad, width: r.width + pad * 2, height: r.height + pad * 2 }} aria-hidden />}
    <div className="tour-pop" role="dialog" aria-live="polite" aria-label={t('Tour')} style={pos}>
      <p className="small muted">{t('Step {n} of {total}', { n: state.step + 1, total: steps.length })}</p>
      <p>{part.text}</p>
      <div className="row-flex">
        {(state.step > 0 || state.sub === 1) && <button className="btn sm" onClick={back}>{t('Back')}</button>}
        {!waitsForClick && <button className="btn sm primary" onClick={next} autoFocus>{state.step + 1 === steps.length ? t('Finish') : t('Next')}</button>}
        {waitsForClick && <span className="small muted">{t('Click the highlighted part.')}</span>}
        <span className="spacer" /><button className="text-link small" onClick={() => setSkip(true)}>{t('Skip tutorial')}</button></div>
      {skip && <SkipAsk onYes={() => finish('skipped')} onNo={() => setSkip(false)} />}
    </div>
  </>
}

function SkipAsk({ onYes, onNo }: { onYes: () => void; onNo: () => void }) {
  return <div className="tour-skip" role="alertdialog" aria-label={t('Skip the tour?')}><p>{t('Skip the tour? You can replay it any time from the account menu.')}</p>
    <div className="row-flex"><button className="btn sm primary" onClick={onYes}>{t('Skip')}</button><button className="btn sm" onClick={onNo}>{t('Keep going')}</button></div></div>
}

// ---- Get started (on the Dashboard until everything is done, or it is closed) --------------------------------------------
const LINES: Record<string, [string, string]> = {
  company: [t('Add company details and logo'), ''], campaign: [t('Create a campaign'), '/campaigns?new=1'], bid: [t('Place your first bid'), '/directory?view=products'],
  outlet: [t('Add your first outlet'), '/listings/new'], product: [t('Add a product'), '/listings'], onSale: [t('Put your first dates on sale'), '/schedule'],
  payouts: [t('Add payout details'), '/profile'],
}
export function GetStarted({ role }: { role: 'buyer' | 'seller' }) {
  const k = `nashr:get-started:${role}`
  const [steps, setSteps] = useState<{ key: string; done: boolean }[] | null>(null), [closed, setClosed] = useState(() => read(k) === 'closed')
  useEffect(() => { if (!closed) api<{ steps: { key: string; done: boolean }[] }>('/me/get-started').then(r => setSteps(r.steps), () => setSteps([])) }, [])
  if (closed || !steps || steps.every(s => s.done)) return null
  const left = steps.filter(s => !s.done).length
  return <section className="card pad get-started" aria-labelledby="gs-h">
    <div className="gs-head"><h2 id="gs-h">{t('Get started')}</h2><span className="small muted">{t('{n} of {total} done', { n: steps.length - left, total: steps.length })}</span>
      <span className="spacer" /><button className="btn sm" onClick={() => { write(k, 'closed'); setClosed(true) }} aria-label={t('Close the Get started list')}>✕</button></div>
    <ol>{steps.map(s => { const [label, href] = LINES[s.key]; const to = s.key === 'company' ? (role === 'buyer' ? '/company' : '/profile') : href
      return <li key={s.key} className={s.done ? 'done' : ''}>{s.done ? <span>{label}</span> : <a href={to}>{label}</a>}</li> })}</ol>
  </section>
}

// ---- "?" tips -----------------------------------------------------------------------------------------------------------
/** A small "?" next to a word new users won't know: hover, focus or tap shows one line from the glossary. */
export function Tip({ text, label }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false), ref = useRef<HTMLSpanElement>(null)
  useEffect(() => { if (!open) return
    const close = (e: Event) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', close); return () => document.removeEventListener('pointerdown', close) }, [open])
  return <span className="tip" ref={ref} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
    <button type="button" className="tip-q" aria-label={label ? t('What is {name}?', { name: label }) : t('What does this mean?')} aria-expanded={open}
      onClick={e => { e.preventDefault(); e.stopPropagation(); setOpen(!open) }} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}>?</button>
    {open && <span className="tip-pop" role="tooltip">{text}</span>}
  </span>
}

/** The glossary's lines, for the tips. */
export const GLOSSARY = {
  auction: t('Highest bid when bidding closes wins, if the seller accepts.'),
  fixed: t('Offer at this price. The seller picks one buyer.'),
  quick_sale: t('Offer any amount. The seller picks the offer they like.'),
  buyNow: t('Skip the auction: request this price. The seller still accepts or declines.'),
  campaign: t('Pick one to send its brief and creative with this bid. Optional.'),
  brief: t('Required. The seller sees them before accepting.'),
  editForBid: t('Change the brief or creative for this bid only. The campaign stays the same.'),
  closes: t('After this, no more bids. The seller then accepts or declines.'),
  creativeDue: t("The seller's deadline for creative. Yours already goes with your bid."),
  budget: t('Only you see this. Sellers never see your budget.'),
  price: t('You pay nothing now. You pay only after the seller accepts.'),
  committed: t("What's accepted, paid or ran. Open bids don't count yet."),
  estimated: t('Products added but not yet bid on, at their listed price.'),
  closeMatch: t('Just outside the reach you asked for: within 2,000 or 2%'),
  savedOutlets: t('Outlets you starred. Tick this to show only them.'),
  savedFilters: t('Filters you saved. Nashr can alert you when new listings match.'),
  reach: t('How many people the outlet says it reaches.'),
}
