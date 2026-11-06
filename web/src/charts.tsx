import { useId, useLayoutEffect, useRef, useState } from 'react'
import { dayLabel, money } from './format'
import './charts.css'

/*
 * Dashboard figures and charts, one system for every role (dataviz rules: form before colour; one hue — the brand teal —
 * for the point, a quiet gray for context; thin marks with 4px rounded data ends; hairline grid; a tooltip on every mark
 * and a table view for every chart, so nothing depends on colour or hover alone).
 */

/** AED 12.9K / AED 1.2M for tiles and axes; full amounts stay in tooltips and tables. */
export function compact(fils: number, currency = 'AED') {
  const v = fils / 100, a = Math.abs(v)
  const s = a >= 1e6 ? `${(v / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M` : a >= 1e4 ? `${(v / 1e3).toFixed(0)}K` : a >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : v.toFixed(0)
  return `${currency} ${s.replace(/\.0(?=[KM])/, '')}`
}
export const weekLabel = (iso: string) => dayLabel(iso, { day: 'numeric', month: 'short' })
const pct = (x: number) => `${x > 0 ? '+' : ''}${Math.round(x * 100)}%`

/** The change vs the previous period: an arrow and a word as well as colour (never colour alone). */
export function Delta({ now, before, goodWhenUp = true, vs = 'vs previous 30 days' }: { now: number; before: number; goodWhenUp?: boolean; vs?: string }) {
  if (!before) return now ? <span className="delta neutral">New: none in the 30 days before</span> : null
  const d = (now - before) / before, up = d > 0.005, down = d < -0.005
  const tone = !up && !down ? 'neutral' : (up === goodWhenUp ? 'good' : 'bad')
  return <span className={`delta ${tone}`}><span aria-hidden>{up ? '↑' : down ? '↓' : '→'}</span> {pct(d)} <span className="muted">{vs}</span></span>
}

/** A tiny trend line: context in gray, the latest point in the brand teal. Decorative: the tile's text carries the facts. */
export function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null
  const w = 120, h = 32, max = Math.max(...values, 1), step = w / (values.length - 1)
  const pts = values.map((v, i) => [i * step, h - 3 - (v / max) * (h - 8)] as const)
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('')
  const [lx, ly] = pts[pts.length - 1]
  return <svg className="spark" viewBox={`-4 0 ${w + 8} ${h}`} aria-hidden><path d={d} /><circle cx={lx} cy={ly} r={4} /></svg>
}

export function StatTile({ label, value, sub, delta, spark, href }: { label: string; value: string; sub?: React.ReactNode; delta?: React.ReactNode; spark?: number[]; href?: string }) {
  const body = <>
    <span className="stat-label">{label}</span>
    <span className="stat-value">{value}</span>
    {delta && <span className="stat-delta">{delta}</span>}
    {sub && <span className="stat-sub">{sub}</span>}
    {spark && <Spark values={spark} />}
  </>
  return href ? <a className="stat card" href={href}>{body}</a> : <div className="stat card">{body}</div>
}

/** The one number a dashboard leads with. */
export function Hero({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return <div className="hero-fig"><span className="stat-label">{label}</span><span className="hero-value">{value}</span>{children}</div>
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null), [w, setW] = useState(600)
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return
    setW(Math.max(240, Math.round(el.clientWidth)))
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))))
    ro.observe(el); return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

const niceMax = (v: number) => { if (v <= 0) return 1; const p = 10 ** Math.floor(Math.log10(v)); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p }

/** Twelve weeks as columns: earlier weeks in gray, this week in the brand teal; hover or focus a column for its value. */
export function WeekColumns({ weeks, title, format = v => compact(v), valueName = 'Value' }: { weeks: { week: string; value: number }[]; title: string; format?: (v: number) => string; valueName?: string }) {
  const [ref, w] = useWidth<HTMLDivElement>(), [hover, setHover] = useState<number | null>(null), id = useId()
  const h = 190, left = 52, bottom = 24, top = 10, plotW = w - left - 4, plotH = h - top - bottom
  const max = niceMax(Math.max(...weeks.map(x => x.value), 0)), band = plotW / weeks.length, bw = Math.min(24, band * 0.62)
  const y = (v: number) => top + plotH - (v / max) * plotH
  const ticks = [0, max / 2, max]
  const r = (x: number, yy: number, bh: number) => { // 4px rounded data end, square at the baseline
    const rr = Math.min(4, bh, bw / 2)
    return `M${x},${yy + bh}V${yy + rr}Q${x},${yy} ${x + rr},${yy}H${x + bw - rr}Q${x + bw},${yy} ${x + bw},${yy + rr}V${yy + bh}Z`
  }
  const hv = hover == null ? null : weeks[hover]
  return (
    <figure className="chart" aria-labelledby={`${id}-t`}>
      <figcaption id={`${id}-t`} className="chart-title">{title}</figcaption>
      <div ref={ref} className="chart-plot" onPointerLeave={() => setHover(null)}>
        <svg width={w} height={h} role="img" aria-label={`${title}. ${weeks.map(x => `${weekLabel(x.week)}: ${format(x.value)}`).join('; ')}`}>
          {ticks.map(t => <g key={t}><line className="grid" x1={left} x2={w - 4} y1={y(t)} y2={y(t)} /><text className="tick" x={left - 8} y={y(t) + 4} textAnchor="end">{format(t)}</text></g>)}
          {weeks.map((x, i) => {
            const bh = Math.max((x.value / max) * plotH, x.value ? 2 : 0), cx = left + band * i + (band - bw) / 2
            const last = i === weeks.length - 1
            return <g key={x.week} className={`col ${last ? 'now' : ''} ${hover === i ? 'hot' : ''}`} tabIndex={0} onPointerEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
              aria-label={`Week of ${weekLabel(x.week)}: ${format(x.value)}`}>
              <rect className="hit" x={left + band * i} y={top} width={band} height={plotH} />
              {bh > 0 && <path d={r(cx, y(x.value), bh)} />}
              {(i % 3 === 2 || last) && <text className="tick" x={cx + bw / 2} y={h - 6} textAnchor="middle">{last ? 'This week' : weekLabel(x.week)}</text>}
            </g>
          })}
          <line className="axis" x1={left} x2={w - 4} y1={top + plotH} y2={top + plotH} />
        </svg>
        {hv && hover != null && <div className="tip" style={{ left: Math.min(Math.max(left + band * hover + band / 2, 70), w - 70) }} role="status">
          <b>{money(hv.value)}</b><span>{hover === weeks.length - 1 ? 'This week' : `Week of ${weekLabel(hv.week)}`}</span></div>}
      </div>
      <details className="chart-table"><summary>Show as table</summary>
        <div className="table-wrap"><table className="table"><thead><tr><th>Week of</th><th className="r">{valueName}</th></tr></thead>
          <tbody>{weeks.map(x => <tr key={x.week}><td>{weekLabel(x.week)}</td><td className="r num">{money(x.value)}</td></tr>)}</tbody></table></div>
      </details>
    </figure>
  )
}

/** Ranked bars, largest first, one hue: compare parts exactly (channels, top publishers). Value at the bar's tip. */
export function RankedBars({ items, title, format = v => compact(v), empty = 'Nothing yet.' }: { items: { label: string; sub?: string; value: number; href?: string }[]; title: string; format?: (v: number) => string; empty?: string }) {
  const max = Math.max(...items.map(i => i.value), 1)
  return (
    <figure className="chart">
      <figcaption className="chart-title">{title}</figcaption>
      {!items.length ? <p className="muted small">{empty}</p> : <ul className="ranked">{items.map(i => {
        const Row = i.href ? 'a' : 'div'
        return <li key={i.label}><Row className="ranked-row" {...(i.href ? { href: i.href } : {})} title={`${i.label}: ${format(i.value)}${i.sub ? ` · ${i.sub}` : ''}`}>
          <span className="ranked-label"><b>{i.label}</b>{i.sub && <span className="muted small"> · {i.sub}</span>}</span>
          <span className="ranked-track"><span className="ranked-bar" style={{ width: `${Math.max(1.5, (i.value / max) * 100)}%` }} /><span className="ranked-value num">{format(i.value)}</span></span>
        </Row></li>
      })}</ul>}
    </figure>
  )
}

/** One ratio against a limit (budget used, sell-through). The track is a lighter step of the same hue; over the limit turns amber. */
export function Meter({ value, max, label, detail, warnAt = 1 }: { value: number; max: number; label: string; detail?: React.ReactNode; warnAt?: number }) {
  const ratio = max ? value / max : 0
  return (
    <div className="meter-block">
      <div className="meter-head"><span>{label}</span><b className="num">{Math.round(ratio * 100)}%</b></div>
      <div className={`meter ${ratio >= warnAt ? 'warn' : ''}`} role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label}>
        <span style={{ width: `${Math.min(100, ratio * 100)}%` }} /></div>
      {detail && <div className="meter-detail small muted">{detail}</div>}
    </div>
  )
}

/** Stages of a funnel as bars in order, with the share kept from the first stage. */
export function Funnel({ steps, title }: { steps: { label: string; value: number }[]; title: string }) {
  const first = steps[0]?.value || 1
  return (
    <figure className="chart">
      <figcaption className="chart-title">{title}</figcaption>
      <ol className="funnel">{steps.map((s, i) => <li key={s.label}>
        <span className="funnel-label">{s.label}</span>
        <span className="ranked-track"><span className="ranked-bar" style={{ width: `${Math.max(1.5, (s.value / first) * 100)}%` }} />
          <span className="ranked-value num">{s.value}{i > 0 && <span className="muted"> · {Math.round((s.value / first) * 100)}%</span>}</span></span>
      </li>)}</ol>
    </figure>
  )
}

export const CHANNEL: Record<string, string> = { tv: 'TV', radio: 'Radio', print: 'Print', digital: 'Digital', podcast: 'Podcasts' }
