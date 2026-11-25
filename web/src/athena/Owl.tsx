import { type ReactNode, useEffect, useRef } from 'react'
import { t } from '../i18n'
import './athena.css'

/*
 * Athena's mark: the owl of Athena, in Nashr's black (white on dark pages), never in a new colour. Wherever Athena reads,
 * suggests or warns, it shows this owl, and its words sit in one panel style (grey, black edge): no owl, not Athena.
 * It is alive, quietly: it blinks now and then, its eyes scan while Athena is working (busy), and it wakes when Athena has
 * something new to say, its words sweeping in after it. Everything stands still for people who ask for reduced motion.
 */
export function Owl({ size = 18, busy = false, wake = false, className = '' }: { size?: number; busy?: boolean; wake?: boolean; className?: string }) {
  // each owl blinks on its own beat, so a page of owls never blinks in step (set after mount: pre-rendered pages stay identical)
  const ref = useRef<SVGSVGElement>(null)
  useEffect(() => { ref.current?.style.setProperty('--owl-delay', `${(Math.random() * 6).toFixed(2)}s`) }, [])
  return <svg ref={ref} className={`owl ${busy ? 'owl-busy' : ''} ${wake ? 'owl-wake' : ''} ${className}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <g className="owl-brows"><path d="M3.6 6.4 7 5.6M20.4 6.4 17 5.6" /></g>
    <g className="owl-eye"><circle className="owl-ring" cx="7.5" cy="11" r="4.6" /><circle className="owl-pupil" cx="7.5" cy="11" r="1.7" /></g>
    <g className="owl-eye"><circle className="owl-ring" cx="16.5" cy="11" r="4.6" /><circle className="owl-pupil" cx="16.5" cy="11" r="1.7" /></g>
    <path className="owl-beak" d="M10.6 17.4 12 19.6l1.4-2.2" />
  </svg>
}

/** "Athena" with its owl: the name tag used in headers, chips and the side menu. */
export function AthenaTag({ label, busy, wake, size = 16 }: { label?: string; busy?: boolean; wake?: boolean; size?: number }) {
  return <span className="ath-tag"><Owl size={size} busy={busy} wake={wake} /><b>{t('Athena')}</b>{label && <span className="ath-label">· {label}</span>}</span>
}

/**
 * Athena speaking: the one panel style. `say` keys the entrance, so new advice wakes the owl and sweeps in again;
 * while `busy`, the owl scans and the words wait.
 */
export function AthenaPanel({ label, busy, say, children, className = '', live = true }: { label?: string; busy?: boolean; say?: string | number; children: ReactNode; className?: string; live?: boolean }) {
  return <section className={`ath ${className}`} role={live ? 'status' : undefined} aria-busy={busy || undefined}>
    <header className="ath-h"><AthenaTag label={label} busy={busy} wake key={`w${say ?? ''}`} /></header>
    <div className={`ath-say ${busy ? 'ath-wait' : ''}`} key={`s${say ?? ''}`}>{children}</div>
  </section>
}
