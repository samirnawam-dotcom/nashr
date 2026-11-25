import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'
import { navigate } from '../nav'
import { money } from '../format'
import { t } from '../i18n'
import { CHANNEL_NAME } from '../media'
import { findPlaces, type Role } from './guide'
import { openAthena } from './open'
import { Owl } from './Owl'

/*
 * ⌘K / Ctrl+K on every signed-in page (or the search box at the top): one box to go anywhere on Nashr or ask Athena.
 * As you type it finds outlets, products, your bookings and campaigns, pages, and for Nashr's team companies, forgiving slips
 * in English and Arabic. ↑ ↓ to move, Enter to open, Tab to ask Athena instead, Esc to close.
 */
type Found = { outlets: { name: string; slug: string; channel: string; products: number }[]; products: { id: string; name: string; slug: string; price: number | null }[]
  bookings: { id: string; ref: string; name: string; status: string; href: string }[]; campaigns: { id: string; name: string }[]; companies: { id: string; name: string; type: string }[] }
type Row = { group: string; label: string; meta?: string; mark: string; go: () => void }

export const openPalette = () => window.dispatchEvent(new Event('athena:palette'))

export function Palette({ role }: { role: Role }) {
  const [open, setOpen] = useState(false), [q, setQ] = useState(''), [found, setFound] = useState<Found | null>(null), [sel, setSel] = useState(0)
  const input = useRef<HTMLInputElement>(null), back = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(o => !o) } }
    const ev = () => setOpen(true)
    addEventListener('keydown', key); addEventListener('athena:palette', ev)
    return () => { removeEventListener('keydown', key); removeEventListener('athena:palette', ev) }
  }, [])
  useEffect(() => { if (open) { back.current = document.activeElement as HTMLElement; setQ(''); setFound(null); setSel(0); setTimeout(() => input.current?.focus(), 10) } else back.current?.focus?.() }, [open])
  useEffect(() => { if (!open || q.trim().length < 2) { setFound(null); return }
    const k = setTimeout(() => api<Found>(`/athena/find?q=${encodeURIComponent(q.trim())}`).then(setFound, () => setFound(null)), 150); return () => clearTimeout(k) }, [q, open])
  const close = () => setOpen(false)
  const to = (href: string) => () => { close(); navigate(href) }
  const ask = () => { close(); openAthena({ ask: q.trim() }) }
  const rows: Row[] = useMemo(() => {
    const r: Row[] = []
    for (const p of findPlaces(q, role)) r.push({ group: t('Pages'), label: p.label, mark: '›', go: to(p.href) })
    for (const o of found?.outlets ?? []) r.push({ group: t('Outlets and products'), label: o.name, meta: `${t(CHANNEL_NAME[o.channel] ?? o.channel)} · ${t('{n} products', { n: o.products })}`, mark: o.name.slice(0, 2).toUpperCase(), go: to(`/directory/${o.slug}`) })
    for (const p of found?.products ?? []) r.push({ group: t('Outlets and products'), label: p.name, meta: p.price != null ? t('From {amount}', { amount: money(p.price) }) : undefined, mark: p.name.slice(0, 2).toUpperCase(), go: to(`/directory/${p.slug}`) })
    for (const b of found?.bookings ?? []) r.push({ group: t('Your bookings and campaigns'), label: `${b.ref} · ${b.name}`, mark: '▦', go: to(b.href) })
    for (const c of found?.campaigns ?? []) r.push({ group: t('Your bookings and campaigns'), label: c.name, meta: t('Campaign'), mark: '⚑', go: to(`/campaigns/${c.id}`) })
    for (const c of found?.companies ?? []) r.push({ group: t('Companies'), label: c.name, meta: c.type === 'publisher' ? t('Publisher') : t('Buyer'), mark: c.name.slice(0, 2).toUpperCase(), go: to(`/accounts/${c.id}`) })
    if (q.trim()) r.push({ group: t('Ask Athena'), label: t('Ask Athena: “{q}”', { q: q.trim() }), meta: 'Tab', mark: 'owl', go: ask })
    return r
  }, [found, q, role])
  useEffect(() => { setSel(0) }, [rows.length])
  if (!open) return null
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); close() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(rows.length - 1, s + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(0, s - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); rows[sel]?.go() }
    else if (e.key === 'Tab' && q.trim()) { e.preventDefault(); ask() }
  }
  let lastGroup = ''
  return <div className="cmdk-scrim" onMouseDown={close}>
    <div className="cmdk" role="dialog" aria-modal="true" aria-label={t('Search Nashr or ask Athena')} onMouseDown={e => e.stopPropagation()}>
      <div className="cmdk-q"><Owl size={20} />
        <input ref={input} value={q} onChange={e => setQ(e.target.value)} onKeyDown={keys} placeholder={t('Search Nashr or ask Athena')} dir="auto"
          role="combobox" aria-expanded={rows.length > 0} aria-controls="cmdk-list" aria-activedescendant={rows[sel] ? `cmdk-${sel}` : undefined} />
        <span className="cmdk-hint">{t('Enter to open · Tab to ask Athena')}</span></div>
      {rows.length > 0 ? <ul id="cmdk-list" className="cmdk-list" role="listbox">{rows.map((r, i) => {
        const head = r.group !== lastGroup ? r.group : ''; lastGroup = r.group
        return <li key={i} role="presentation">{head && <div className="cmdk-g">{head}</div>}
          <div id={`cmdk-${i}`} role="option" aria-selected={i === sel} className={`cmdk-it ${i === sel ? 'sel' : ''}`} onMouseEnter={() => setSel(i)} onClick={r.go}>
            <span className="cmdk-ic">{r.mark === 'owl' ? <Owl size={14} /> : r.mark}</span><span className="cmdk-l" dir="auto">{r.label}</span>{r.meta && <span className="cmdk-m">{r.meta}</span>}</div></li>
      })}</ul> : <p className="cmdk-empty">{t('Type an outlet, a product, a booking reference or a page. Or ask Athena anything.')}</p>}
    </div>
  </div>
}

/** The search box at the top of every page: opens ⌘K. */
export function PaletteButton() {
  const mac = typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform)
  return <button type="button" className="cmdk-btn" onClick={openPalette} aria-label={t('Search Nashr or ask Athena')}>
    <Owl size={15} /><span>{t('Search Nashr or ask Athena')}</span><kbd>{mac ? '⌘K' : 'Ctrl K'}</kbd></button>
}
