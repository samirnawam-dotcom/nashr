import { useEffect, useMemo, useState } from 'react'
import { api, type Slot } from '../api'
import { closesIn, dayLabel, money, time } from '../format'
import { addDays, DAY_END, DAY_START, dubai, isAllDay, layoutDay, monthGrid, todayInDubai, weekOf } from './layout'
import { BidDrawer } from './BidDrawer'

type View = 'day' | 'week' | 'month'
const HOUR = 60, DAY_HOUR = 96 // px per hour in week and day views
const MIN_BLOCK = 60          // a programme block is shown at least this many minutes tall
const CHANNELS = ['print', 'digital', 'radio', 'tv', 'podcast'] as const
const CHANNEL_NAME: Record<string, string> = { print: 'Print', digital: 'Digital', radio: 'Radio', tv: 'TV', podcast: 'Podcast' }

export const Gavel = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="m14 13-7.5 7.5a2.1 2.1 0 0 1-3-3L11 10M16 16l6-6M8 8l6-6M9 7l8 8M21 11l-8-8" /></svg>
export const Bolt = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" /></svg>
export const SaleType = ({ t }: { t: Slot['saleType'] }) =>
  <span className="tag">{t === 'auction' ? <Gavel /> : <Bolt />}{t === 'auction' ? 'Auction' : 'Quick sale'}</span>

/** One status line per item: you lead, outbid, closing soon, or the bid count (premium finish: dot + label). */
export function status(s: Slot) {
  if (!s.available) return <span className="muted">Not available</span>
  if (s.youLead) return <span className="dot lead">You lead</span>
  if (s.youBid && s.topBid) return <span className="dot outbid">Outbid</span>
  const soon = s.saleType === 'auction' && closesIn(s.closesAt)
  if (soon) return <span className="on-air">{soon}</span> // the on-air signal: bidding is live and about to close
  return <span className="muted">{s.saleType === 'quick_sale' ? (s.bids ? `${s.bids} interested` : 'Open to offers') : s.bids ? `${s.bids} bids` : 'Starting price'}</span>
}
const heat = (bids: number) => bids >= 6 ? 'var(--teal-3)' : bids >= 3 ? 'var(--teal-2)' : bids >= 1 ? 'var(--teal-1)' : 'var(--surface)'

/** A programme on one day: its breaks plus the any-break and package options. */
type Group = { key: string; outlet: string; placement: string; channel: string; date: string; start: number; end: number; slots: Slot[] }
function groups(slots: Slot[]): Group[] {
  const m = new Map<string, Group>()
  for (const s of slots) {
    const d = dubai(s.startsAt), key = `${s.outlet}|${s.placement}|${d.date}`
    const end = s.endsAt ? dubai(s.endsAt).minutes : d.minutes + 30
    const g = m.get(key) ?? { key, outlet: s.outlet, placement: s.placement, channel: s.channel, date: d.date, start: d.minutes, end, slots: [] }
    g.start = Math.min(g.start, d.minutes); g.end = Math.max(g.end, end, g.start + MIN_BLOCK); g.slots.push(s); m.set(key, g)
  }
  return [...m.values()]
}
const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const from = (g: Group) => Math.min(...g.slots.map(s => s.topBid ?? s.startingPrice))

/** True on phone-sized screens, where the time grid gives way to a day-by-day list. */
function useNarrow(px = 760) {
  const q = `(max-width: ${px}px)`
  const [narrow, set] = useState(() => matchMedia(q).matches)
  useEffect(() => { const m = matchMedia(q), f = () => set(m.matches); m.addEventListener('change', f); return () => m.removeEventListener('change', f) }, [q])
  return narrow
}

/** Phones: each day's programmes as a list; tapping one opens the same programme panel as the grid. */
function AgendaView({ days, slots, onPick, onNext }: { days: string[]; slots: Slot[]; onPick: (g: Group) => void; onNext: () => void }) {
  const all = groups(slots).sort((a, b) => a.start - b.start)
  const withItems = days.filter(d => all.some(g => g.date === d))
  if (!withItems.length) return <div className="empty"><p className="muted">Nothing open for these days. Bidding closes a few days before air.</p><button className="btn primary" onClick={onNext}>Show the next week</button></div>
  return <div className="agenda">{withItems.map(d => <section key={d}>
    <h2 className={d === todayInDubai() ? 'today' : ''}>{dayLabel(d, { weekday: 'long', day: 'numeric', month: 'short' })}</h2>
    {all.filter(g => g.date === d).map(g => { const one = g.slots[0], allDay = isAllDay(one)
      return <button key={g.key} className="agenda-item" onClick={() => onPick(g)}>
        <span className="agenda-time num">{allDay ? 'All day' : time(one.startsAt)}</span>
        <span className="agenda-body"><b>{g.outlet}</b><span className="muted">{g.placement}{g.slots.length > 1 ? `, ${g.slots.length} options` : ''}</span>
          <span className="agenda-meta"><SaleType t={one.saleType} /><span className="num">from {money(from(g))}</span>{status(g.slots.find(s => s.youLead) ?? one)}</span></span>
      </button> })}
  </section>)}</div>
}

export function CalendarPage() {
  const narrow = useNarrow()
  const [view, setView] = useState<View>('week')
  const [anchor, setAnchor] = useState(todayInDubai())
  const [slots, setSlots] = useState<Slot[]>([])
  const [channels, setChannels] = useState<Set<string>>(new Set(CHANNELS))
  const [saleTypes, setSaleTypes] = useState<Set<string>>(new Set(['auction', 'quick_sale']))
  const [picked, setPicked] = useState<Group | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [error, setError] = useState('')

  const days = view === 'day' ? [anchor] : view === 'week' ? weekOf(anchor) : monthGrid(anchor).flat()
  const load = () => api<Slot[]>(`/slots?from=${days[0]}T00:00:00%2B04:00&to=${addDays(days.at(-1)!, 1)}T00:00:00%2B04:00`).then(setSlots, e => setError(e.message))
  useEffect(() => { load() }, [view, anchor])

  const shown = useMemo(() => slots.filter(s => channels.has(s.channel) && saleTypes.has(s.saleType)), [slots, channels, saleTypes])
  const step = (n: number) => setAnchor(addDays(anchor, view === 'day' ? n : view === 'week' ? 7 * n : 0) as string)
  const stepMonth = (n: number) => { const d = new Date(anchor + 'T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n, 1); setAnchor(d.toISOString().slice(0, 10)) }
  const toggle = (set: Set<string>, v: string, put: (s: Set<string>) => void) => { const n = new Set(set); n.has(v) ? n.delete(v) : n.add(v); put(n) }
  const title = view === 'month' ? dayLabel(anchor, { month: 'long', year: 'numeric' })
    : view === 'day' ? dayLabel(anchor, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : `Week of ${dayLabel(days[0], { day: 'numeric', month: 'short' })} – ${dayLabel(days[6], { day: 'numeric', month: 'short', year: 'numeric' })}`

  return (
    <div className="cal">
      <details className="cal-side" open={!narrow || undefined}>
        <summary className="btn">Filters</summary>
        <h3 className="side-h">Channels</h3>
        {CHANNELS.map(c => <label key={c} className="check"><input type="checkbox" checked={channels.has(c)} onChange={() => toggle(channels, c, setChannels)} />{CHANNEL_NAME[c]}</label>)}
        <h3 className="side-h">Sale type</h3>
        <label className="check"><input type="checkbox" checked={saleTypes.has('auction')} onChange={() => toggle(saleTypes, 'auction', setSaleTypes)} /><Gavel /> Auction</label>
        <label className="check"><input type="checkbox" checked={saleTypes.has('quick_sale')} onChange={() => toggle(saleTypes, 'quick_sale', setSaleTypes)} /><Bolt /> Quick sale</label>
        <h3 className="side-h">Key</h3>
        <ul className="cal-key"><li><span className="dot lead">You lead</span></li><li><span className="on-air">Closes soon</span></li><li><span className="dot outbid">Outbid</span></li></ul>
        <p className="small muted" style={{ marginTop: 24 }}>All times are Dubai time. Prices exclude VAT.</p>
      </details>

      <section className="cal-main">
        <header className="cal-head">
          <h1>Calendar</h1>
          <span className="muted">{title}</span>
          <div className="spacer" />
          <button className="btn" onClick={() => setAnchor(todayInDubai())}>Today</button>
          <button className="btn" aria-label="Previous" onClick={() => view === 'month' ? stepMonth(-1) : step(-1)}>‹</button>
          <button className="btn" aria-label="Next" onClick={() => view === 'month' ? stepMonth(1) : step(1)}>›</button>
          <div className="seg">{(['day', 'week', 'month'] as View[]).map(v => <button key={v} className={v === view ? 'on' : ''} onClick={() => setView(v)}>{v[0].toUpperCase() + v.slice(1)}</button>)}</div>
        </header>
        {error && <p className="error">{error}</p>}
        {narrow && view !== 'month' && <AgendaView days={days} slots={shown} onPick={setPicked} onNext={() => step(1)} />}
        {!narrow && view === 'week' && <WeekView days={days} slots={shown} onPick={setPicked} />}
        {!narrow && view === 'day' && <DayView date={anchor} slots={shown} onOpen={setOpen} />}
        {!narrow && view !== 'month' && <p className="cal-foot small muted">Your payment is held until the publisher proves the ad ran. You pay only once the publisher accepts.</p>}
        {view === 'month' && <MonthView weeks={monthGrid(anchor)} month={anchor.slice(0, 7)} slots={shown} onPick={setPicked} onDay={d => { setAnchor(d); setView('day') }} />}
      </section>

      {picked && <ProgrammePanel g={picked} onClose={() => setPicked(null)} onOpen={id => { setPicked(null); setOpen(id) }} />}
      {open && <BidDrawer slotId={open} onClose={() => setOpen(null)} onDone={() => { load() }} />}
    </div>
  )
}

function AllDayLane({ cols, slots, onPick, style }: { cols: { key: string; date: string; outlet?: string }[]; slots: Slot[]; onPick: (g: Group) => void; style?: React.CSSProperties }) {
  const all = groups(slots.filter(isAllDay))
  return (
    <div className="allday" style={style}>
      <div className="gutter small muted">All day</div>
      {cols.map(c => <div key={c.key} className="allday-cell">
        {all.filter(g => g.date === c.date && (!c.outlet || g.outlet === c.outlet)).map(g => <button key={g.key} className="chip" style={{ background: heat(g.slots[0].bids) }} onClick={() => onPick(g)}>
          <b>{g.outlet}</b> · {g.placement} · {money(from(g))} <SaleType t={g.slots[0].saleType} /></button>)}
      </div>)}
    </div>
  )
}

function Hours({ hour = HOUR }: { hour?: number }) {
  return <div className="hours">{Array.from({ length: (DAY_END - DAY_START) / 60 }, (_, i) =>
    <div key={i} style={{ height: hour }} className="small muted">{String(DAY_START / 60 + i).padStart(2, '0')}:00</div>)}</div>
}
const top = (min: number, hour = HOUR) => ((Math.max(min, DAY_START) - DAY_START) / 60) * hour

function WeekView({ days, slots, onPick }: { days: string[]; slots: Slot[]; onPick: (g: Group) => void }) {
  const timed = groups(slots.filter(s => !isAllDay(s)))
  const today = todayInDubai()
  return (
    <div className="grid card">
      <div className="grid-head"><div className="gutter" />{days.map(d => <div key={d} className={`day-h ${d === today ? 'today' : ''} ${[6, 7].includes(dubai(d + 'T08:00:00Z').weekday) ? 'weekend' : ''}`}>
        <span className="small muted">{dayLabel(d, { weekday: 'short' })}</span><b>{dayLabel(d, { day: 'numeric' })}</b></div>)}</div>
      <AllDayLane cols={days.map(d => ({ key: d, date: d }))} slots={slots} onPick={onPick} />
      <div className="grid-body">
        <Hours />
        {days.map(d => {
          const evs = timed.filter(g => g.date === d)
          const lay = layoutDay(evs.map(g => ({ id: g.key, start: g.start, end: g.end })))
          return <div key={d} className={`day-col ${[6, 7].includes(dubai(d + 'T08:00:00Z').weekday) ? 'weekend' : ''}`} style={{ height: ((DAY_END - DAY_START) / 60) * HOUR }}>
            {evs.map(g => { const l = lay.get(g.key)!, single = g.slots.length === 1 ? g.slots[0] : null
              const leads = g.slots.filter(s => s.youLead).length
              return <button key={g.key} className="ev" onClick={() => onPick(g)} style={{ top: top(g.start), height: top(g.end) - top(g.start) - 2,
                left: `calc(${(l.col / l.cols) * 100}% + 2px)`, width: `calc(${100 / l.cols}% - 4px)`, background: heat(Math.max(...g.slots.map(s => s.bids))) }}>
                <span className="ev-t"><span className="small num ev-time">{hhmm(g.start)}–{hhmm(g.end)}</span><SaleType t={g.slots[0].saleType} /></span>
                <b className="ev-name">{g.outlet}</b><span className="small muted">{g.placement}</span>
                <span className="small num">{single ? `${single.label} · ` : `${g.slots.filter(s => s.kind === 'single').length} breaks · from `}{money(from(g))}</span>
                <span className="small">{single ? status(single) : leads ? <span className="dot lead">You lead on {leads}</span> : null}</span>
              </button> })}
          </div>
        })}
      </div>
    </div>
  )
}

function DayView({ date, slots, onOpen }: { date: string; slots: Slot[]; onOpen: (id: string) => void }) {
  const day = slots.filter(s => dubai(s.startsAt).date === date)
  const outlets = [...new Set(day.map(s => s.outlet))]
  const cols = { gridTemplateColumns: `64px repeat(${Math.max(outlets.length, 1)}, minmax(300px, 1fr))` }
  return (
    <div className="grid card scroll-x"><div style={{ minWidth: 64 + outlets.length * 300 }}>
      <div className="grid-head" style={cols}><div className="gutter" />{outlets.map(o => <div key={o} className="day-h"><b>{o}</b></div>)}</div>
      <AllDayLane style={cols} cols={outlets.map(o => ({ key: o, date, outlet: o }))} slots={day} onPick={g => onOpen(g.slots[0].id)} />
      <div className="grid-body" style={cols}>
        <Hours hour={DAY_HOUR} />
        {outlets.map(o => {
          const timed = day.filter(s => s.outlet === o && !isAllDay(s))
          // breaks that share a start time (podcast positions) are options of the programme, like "any break" and the package
          const sameTime = (s: Slot) => timed.filter(t => t.kind === 'single' && t.startsAt === s.startsAt).length > 1
          const options = timed.filter(s => s.kind !== 'single' || sameTime(s)), singles = timed.filter(s => s.kind === 'single' && !sameTime(s))
          const lay = layoutDay(singles.map(s => ({ id: s.id, start: dubai(s.startsAt).minutes, end: dubai(s.startsAt).minutes + 24 })))
          const band = groups(timed).filter(g => g.slots.length > 1)
          return <div key={o} className="day-col day-tall" style={{ height: ((DAY_END - DAY_START) / 60) * DAY_HOUR }}>
            {band.map(g => <div key={g.key} className="band" style={{ top: top(g.start, DAY_HOUR), height: top(g.end, DAY_HOUR) - top(g.start, DAY_HOUR) }}>
              <span className="small muted">{g.placement}</span>
              {options.filter(s => g.slots.includes(s)).map(s => <button key={s.id} className="opt small" onClick={() => onOpen(s.id)}>{s.label} · {money(s.topBid ?? s.startingPrice)}</button>)}
            </div>)}
            {singles.map(s => { const l = lay.get(s.id)!, m = dubai(s.startsAt).minutes
              return <button key={s.id} className="ev single" onClick={() => onOpen(s.id)} style={{ top: top(m, DAY_HOUR), height: (24 / 60) * DAY_HOUR,
                left: `calc(${42 + (l.col / l.cols) * 58}% )`, width: `calc(${58 / l.cols}% - 4px)`, background: heat(s.bids) }}>
                <span className="small ell"><b>{s.label}</b> · <span className="num">{time(s.startsAt)} · {money(s.topBid ?? s.startingPrice)}</span></span>
                <span className="small ell">{status(s)}</span>
              </button> })}
          </div>
        })}
      </div>
      {!outlets.length && <p className="muted empty">Nothing on sale this day. Try the next day or the week view.</p>}
    </div></div>
  )
}

function MonthView({ weeks, month, slots, onPick, onDay }: { weeks: string[][]; month: string; slots: Slot[]; onPick: (g: Group) => void; onDay: (d: string) => void }) {
  const all = groups(slots)
  return (
    <div className="month card">
      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => <div key={d} className="month-h small muted">{d}</div>)}
      {weeks.flat().map(d => { const gs = all.filter(g => g.date === d)
        return <div key={d} className={`month-cell ${d.slice(0, 7) !== month ? 'out' : ''}`}>
          <button className="month-date" onClick={() => onDay(d)}>{Number(d.slice(8))}</button>
          {gs.slice(0, 3).map(g => <button key={g.key} className="chip" style={{ background: heat(Math.max(...g.slots.map(s => s.bids))) }} onClick={() => onPick(g)}>
            {g.slots[0].saleType === 'auction' ? <Gavel /> : <Bolt />} {g.outlet} · {money(from(g))}</button>)}
          {gs.length > 3 && <button className="more small" onClick={() => onDay(d)}>+{gs.length - 3} more</button>}
        </div> })}
    </div>
  )
}

function ProgrammePanel({ g, onClose, onOpen }: { g: Group; onClose: () => void; onOpen: (id: string) => void }) {
  const order = { single: 0, any: 1, package: 2 }
  return (
    <div className="scrim" onClick={onClose}>
      <aside className="drawer" onClick={e => e.stopPropagation()}>
        <header className="drawer-h"><div><h2>{g.outlet} · {g.placement}</h2><p className="muted small">{dayLabel(g.date, { weekday: 'long', day: 'numeric', month: 'long' })}</p></div>
          <button className="btn" onClick={onClose} aria-label="Close">✕</button></header>
        <ul className="list">
          {[...g.slots].sort((a, b) => order[a.kind] - order[b.kind] || a.startsAt.localeCompare(b.startsAt)).map(s =>
            <li key={s.id}><button className="row" onClick={() => onOpen(s.id)} disabled={!s.available}>
              <span><b>{s.label}</b>{s.kind === 'single' && !isAllDay(s) ? <span className="muted num"> · {time(s.startsAt)}</span> : null}<br /><SaleType t={s.saleType} /></span>
              <span className="right"><b className="num">{money(s.topBid ?? s.startingPrice)}</b><br /><span className="small">{status(s)}</span></span>
            </button></li>)}
        </ul>
      </aside>
    </div>
  )
}
