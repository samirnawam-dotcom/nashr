import { useEffect, useState } from 'react'
import { api } from '../api'
import { todayInDubai } from '../calendar/layout'
import { money } from '../format'
import { t } from '../i18n'
import { tm, tmTitle } from '../i18n-server'
import { HAS_PROGRAMMES, TYPE_FIELDS } from '../../../server/shared/products'
import { byProgramme, mediaName, titleOf, type Media, type Product, type Sellable } from './Listing'
import './portal.css'
import './products.css'

/*
 * Import a rate card file (CSV), in the owner's names: Outlet, Product, Programme, Listing. Each row puts something on sale and
 * keeps it on sale 8 weeks ahead. A row with a programme is one show of a radio, TV or podcast product (the programme is added if
 * it is new); a row without one lists the product itself, as newspapers, magazines and websites are sold.
 */
const HEADERS = ['outlet', 'product', 'programme', 'sold_as', 'days', 'start', 'end', 'breaks', 'format', 'ad_length', 'price', 'buy_now', 'reserve', 'creative_days', 'close_days', 'notes']
// files made for the older import still read: "name" was the programme, "seconds" the ad length, "description" the notes
const ALIAS: Record<string, string> = { name: 'programme', seconds: 'ad_length', description: 'notes' }

/** A small CSV reader: commas, quoted fields with "" escapes, CRLF or LF. */
function parseCsv(text: string) {
  const rows: string[][] = []; let row: string[] = [], cell = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ } else if (c === '"') q = false; else cell += c }
    else if (c === '"') q = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = '' }
    else cell += c
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows.filter(r => r.some(x => x.trim()))
}
const DAY_NAMES = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
function parseDays(v: string) {
  const out = new Set<number>()
  for (const part of v.toLowerCase().split(/[;/ ]+|,/).filter(Boolean)) {
    const ends = part.split('-').map(x => DAY_NAMES.indexOf(x.trim().slice(0, 3)) + 1)
    if (ends.length > 2 || ends.some(x => !x)) return null
    if (ends.length === 2) for (let d = ends[0]; ; d = d % 7 + 1) { out.add(d); if (d === ends[1]) break }
    else out.add(ends[0])
  }
  return out.size ? [...out].sort() : null
}
const hhmm = (v: string) => /^\d{1,2}:\d{2}$/.test(v.trim()) ? v.trim().padStart(5, '0') : null
const aed = (v: string) => v.trim() ? Math.round(Number(v.replace(/,/g, '')) * 100) || undefined : undefined
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
const csv = (cells: (string | number)[]) => cells.map(c => /[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c).join(',')

type Row = { line: number; title: string; kind: string; what: string; problem?: string; result?: string; ok?: boolean
  media?: Media; programme?: { id?: string; body?: any; key: string }; target?: Sellable; listing?: any }

/** The template uses the publisher's own outlet and product names, so the first rows can be edited rather than typed. */
function template(tree: Product[]) {
  const all = tree.flatMap(p => p.media.map(m => ({ p, m }))), show = all.find(x => HAS_PROGRAMMES.includes(x.m.channel)), one = all.find(x => !HAS_PROGRAMMES.includes(x.m.channel))
  const rows = [
    csv([show?.p.name ?? 'Skyline FM', show?.m.name ?? 'Skyline FM Radio', 'Morning Drive', 'auction', 'Mon-Fri', '07:00', '10:00', '07:30;08:30;09:30', 'Ad spot', '30 seconds', 2000, 3500, '', 2, 5, 'A 30-second spot in one ad break.']),
    csv([show?.p.name ?? 'Skyline FM', show?.m.name ?? 'Skyline FM Radio', 'Weekend Brunch', 'quick sale', 'Sat-Sun', '10:00', '12:00', '10:30;11:30', 'Live read', '20 seconds', 1500, '', '', '', '', '']),
    csv([one?.p.name ?? 'The National', one?.m.name ?? 'The National newspaper', '', 'fixed price', '', '', '', '', '', '', 12000, '', '', '', '', '']),
  ]
  return HEADERS.join(',') + '\n' + rows.join('\n') + '\n'
}

export function ImportRateCardPage() {
  const [tree, setTree] = useState<Product[] | null>(null), [payouts, setPayouts] = useState(true), [rows, setRows] = useState<Row[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState(false), [file, setFile] = useState('')
  useEffect(() => { api<Product[]>('/seller/products').then(setTree, e => setError(e.message))
    api<{ company: { payoutsEnabled: boolean } }>('/seller/profile').then(p => setPayouts(p.company.payoutsEnabled), () => {}) }, [])
  function read(text: string) {
    const all = parseCsv(text), products = tree!.flatMap(p => p.media.map(m => ({ p, m })))
    if (!all.length) return setRows([])
    const head = all[0].map(h => { const k = h.trim().toLowerCase().replace(/\s+/g, '_'); return ALIAS[k] ?? k })
    const at = (r: string[], k: string) => (r[head.indexOf(k)] ?? '').trim()
    const fresh = new Set<string>()   // programmes an earlier row of this file adds
    setRows(all.slice(1).map((r, i): Row => {
      const outletName = at(r, 'outlet'), productName = at(r, 'product'), programmeName = at(r, 'programme'), line = i + 2
      // the outlet is the brand; an older file may carry the product's name in that column, which still finds it
      const inOutlet = products.filter(x => !outletName || same(x.p.name, outletName)), pool = inOutlet.length ? inOutlet : products.filter(x => same(x.m.name, outletName))
      const named = productName ? pool.filter(x => same(x.m.name, productName) || same(mediaName(x.m), productName)) : pool.filter(x => !programmeName || HAS_PROGRAMMES.includes(x.m.channel))
      const hit = named.length === 1 ? named[0] : pool.length === 1 && !productName ? pool[0] : undefined
      const title = [hit?.p.name ?? outletName, programmeName || (hit ? '' : productName)].filter(Boolean).join(' · ') || '—'
      const bad = (problem: string): Row => ({ line, title: hit && !programmeName ? titleOf(hit.p, hit.m.sellable[0] ?? { name: hit.m.name }) : title, kind: hit ? mediaName(hit.m) : '', what: '', problem })
      if (!tree!.length) return bad(t('Add an outlet and a product first; then import your rate card.'))
      if (!pool.length) return bad(t('Outlet "{name}" is not one of yours.', { name: outletName }))
      if (!hit) return bad(productName ? t('Product "{name}" was not found in this outlet.', { name: productName }) : t('This outlet has several products. Say which one in the product column.'))
      // (an older newspaper or website may still be sold through items it had before; naming one of those relists it)
      if (programmeName && !HAS_PROGRAMMES.includes(hit.m.channel) && !hit.m.sellable.some(x => x.kind === 'programme' && same(x.name, programmeName))) return bad(t('Only Radio, TV and Podcast have programmes.'))
      const m = hit.m, sold = at(r, 'sold_as').toLowerCase().replace(/[\s-]+/g, '_').replace(/^fixed_price$/, 'fixed'), price = aed(at(r, 'price'))
      if (!['auction', 'quick_sale', 'fixed'].includes(sold)) return bad(t('Sold as must be auction, fixed price or quick sale.'))
      if (!price) return bad(t('Price is missing.'))
      const listing = { from: todayInDubai(), length: 'rolling', weeks: 8, saleType: sold, startingPrice: price,
        ...(sold === 'auction' ? { buyNowPrice: aed(at(r, 'buy_now')) ?? null, reservePrice: aed(at(r, 'reserve')) ?? null } : {}) }
      const soldAs = `${t(sold === 'auction' ? 'Auction' : sold === 'fixed' ? 'Fixed price' : 'Quick sale')} · ${money(price)}`
      if (!programmeName) {
        if (byProgramme(m)) return bad(t('This product is sold by programme. Add the programme name.'))
        const target = m.sellable.find(s => s.kind === 'main')
        if (!target) return bad(t('This product has nothing to list yet. Open it and save its details first.'))
        return { line, title: titleOf(hit.p, target), kind: mediaName(m), what: `${t('List the product')} · ${soldAs}`, media: m, target, listing }
      }
      const key = `${m.id}\n${programmeName.toLowerCase()}`, existing = m.sellable.find(s => s.kind === 'programme' && same(s.name, programmeName))
      if (existing) return { line, title: titleOf(hit.p, existing), kind: mediaName(m), what: `${t('List the programme')} · ${soldAs}`, media: m, programme: { id: existing.id, key }, listing }
      if (fresh.has(key)) return { line, title: `${hit.p.name} · ${programmeName}`, kind: mediaName(m), what: `${t('List the programme')} · ${soldAs}`, media: m, programme: { key }, listing }
      // a new programme: the fields its media type asks for
      const timed = ['radio', 'tv'].includes(m.channel), days = parseDays(at(r, 'days') || 'mon-sun'), start = hhmm(at(r, 'start')), end = hhmm(at(r, 'end'))
      const breakTimes = at(r, 'breaks').split(/[;|]/).map(x => x.trim()).filter(Boolean), length = at(r, 'ad_length')
      const fmt = at(r, 'format'), options = TYPE_FIELDS[m.channel].find(f => f.key === 'format')?.options ?? []
      const format = fmt ? (options.find(o => same(o[0], fmt) || same(o[1], fmt))?.[m.channel === 'podcast' ? 0 : 1] ?? fmt) : options[0]?.[m.channel === 'podcast' ? 0 : 1] ?? ''
      if (!days) return bad(t('Days are not readable (use Mon-Fri or Mon;Wed).'))
      if (timed && (!start || !end)) return bad(t('A new programme needs its start and end time, like 07:30.'))
      if (timed && (!breakTimes.length || breakTimes.some(b => !hhmm(b)))) return bad(t('A new programme needs its break times, like 07:30;08:30.'))
      // deadlines: the file's, else the product's own; a product made before it had any gets 2 and 5 days
      const cd = at(r, 'creative_days'), bc = at(r, 'close_days')
      fresh.add(key)
      const body = { name: programmeName, ...(at(r, 'notes') ? { notes: at(r, 'notes') } : {}), defaultPrice: price, creativeDays: cd ? Number(cd) : m.creativeDays == null ? 2 : null, closeDays: bc ? Number(bc) : m.closeDays == null ? 5 : null,
        details: { days, ...(timed ? { airStart: start, airEnd: end, breaks: breakTimes.map(b => ({ at: hhmm(b) })) } : {}), format, adLength: !length ? '30 seconds' : /^\d+$/.test(length) ? `${length} seconds` : length } }
      return { line, title: `${hit.p.name} · ${programmeName}`, kind: mediaName(m), what: `${t('Add the programme and list it')} · ${soldAs}`, media: m, programme: { body, key }, listing }
    }))
  }
  async function importAll() {
    setBusy(true)
    const next = [...rows], made = new Map<string, string>()   // programmes added in this run, so two rows for one new show add it once
    for (const r of next) if (!r.problem && !r.ok) {
      try {
        let id = r.target?.id ?? r.programme?.id ?? (r.programme ? made.get(r.programme.key) : undefined), added = false
        if (!id && r.programme?.body) { id = (await api<{ id: string }>(`/seller/media/${r.media!.id}/programmes`, { method: 'POST', body: r.programme.body })).id; made.set(r.programme.key, id); added = true }
        if (!id) throw new Error(t('The programme was not added, so this row was not listed.'))
        if (!payouts) { r.ok = added; r.result = added ? t('Programme added. List it once your payout account is verified.') : t('Not listed: slots can go on sale once your payout account is verified.') }
        else { const x = await api<{ slots: number }>('/seller/listings', { method: 'POST', body: { placementId: id, ...r.listing } })
          r.ok = true; r.result = [added ? t('Programme added.') : '', x.slots ? t('{n} slots on sale.', { n: x.slots }) : t('Already on sale for these dates; price and way of selling updated.')].filter(Boolean).join(' ') }
      } catch (e: any) { r.result = tm(e.message) }
      setRows([...next])
    }
    setBusy(false)
  }
  if (!tree) return <main>{error ? <p className="error">{error}</p> : <p className="muted">{t('Loading…')}</p>}</main>
  const ready = rows.filter(r => !r.problem && !r.ok).length, done = rows.filter(r => r.ok).length, wrong = rows.filter(r => r.problem).length
  return (
    <main className="narrow wide rc">
      <p className="small"><a href="/listings">{t('Products')}</a> › {t('Import a rate card file')}</p>
      <div className="pt-head"><div><h1>{t('Import a rate card file')}</h1>
        <p className="muted">{t('List many programmes and products at once from a spreadsheet saved as CSV. Each row goes on sale and is kept on sale 8 weeks ahead; you can change any of them afterwards.')}</p></div></div>
      {!tree.length ? <section className="card pad pd-empty"><h2>{t('Add your first outlet')}</h2>
        <p className="muted">{t('The file lists products you already have. Add an outlet and its products first; then import your rate card.')}</p>
        <a className="btn primary" href="/listings/new">+ {t('Add outlet')}</a></section> : <>
      <section className="card pad form section">
        <ol className="rc-how">
          <li><b>{t('Outlet')}</b><span>{t('Your brand, as on the Products page.')}</span></li>
          <li><b>{t('Product')}</b><span>{t('What the outlet sells: its radio station, newspaper or website.')}</span></li>
          <li><b>{t('Programme')}</b><span>{t('For radio, TV and podcasts. A new name adds the programme; leave it empty to list the product itself.')}</span></li>
        </ol>
        <div className="row-flex"><a className="btn" href={'data:text/csv;charset=utf-8,' + encodeURIComponent(template(tree))} download="nashr-rate-card-template.csv">{t('Download the template')}</a>
          <label className="btn primary">{t('Choose a CSV file')}<input type="file" accept=".csv,text/csv" hidden onChange={e => { const f = e.target.files?.[0]; if (f) { setFile(f.name); f.text().then(read) } }} /></label>
          {file && <span className="small muted" dir="auto">{file}</span>}</div>
        <p className="small muted">{t('Columns: {cols}. Days like Mon-Fri or Sat;Sun. Break times separated by semicolons. Prices in AED excluding VAT.', { cols: HEADERS.join(', ') })}</p>
        {!payouts && <p className="warn">{t('Your payout account is not verified yet, so programmes are added but nothing goes on sale.')}</p>}
      </section>
      {rows.length > 0 && <section className="section">
        <p className="small muted" role="status">{[t(rows.length === 1 ? '1 row' : '{n} rows', { n: rows.length }), wrong ? t('{n} to fix in the file', { n: wrong }) : '', done ? t('{n} imported', { n: done }) : ''].filter(Boolean).join(' · ')}</p>
        <div className="table-wrap card"><table className="table"><thead><tr><th>{t('Row')}</th><th>{t('Product or programme')}</th><th>{t('What happens')}</th><th>{t('Status')}</th></tr></thead>
          <tbody>{rows.map(r => <tr key={r.line}><td className="num small">{r.line}</td><td className="cell2"><b dir="auto">{tmTitle(r.title)}</b>{r.kind && <span>{r.kind}</span>}</td>
            <td className="small">{r.what || '—'}</td>
            <td className="small">{r.result ? <span className={r.ok ? 'lead' : 'outbid'}>{r.result}</span> : r.problem ? <span className="outbid">{r.problem}</span> : <span className="dot soon">{t('Ready')}</span>}</td></tr>)}</tbody></table></div>
        <div className="row-flex section">
          <button className="btn primary" disabled={busy || !ready} onClick={importAll}>{busy ? t('Importing…') : !ready ? t('Nothing left to import') : ready === 1 ? t('Import 1 row') : t('Import {n} rows', { n: ready })}</button>
          {done > 0 && <a className="btn" href="/listings">{t('Go to Products')}</a>}</div>
      </section>}</>}
    </main>
  )
}
