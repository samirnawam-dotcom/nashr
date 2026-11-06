import { useState } from 'react'
import { t } from './i18n'

const STAR = 'M12 3.2l2.6 5.5 6 .8-4.4 4.1 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.5l6-.8z'

/** Read-only stars: the number is always written too, so the rating never depends on the icons alone. */
export function Stars({ value, size = 14, count }: { value: number; size?: number; count?: number }) {
  return (
    <span className="stars" aria-label={count != null ? t('Rated {score} out of 5 from {n} bookings', { score: value.toFixed(1), n: count }) : t('Rated {score} out of 5', { score: value.toFixed(1) })}>
      <span className="stars-icons" aria-hidden>{[1, 2, 3, 4, 5].map(i => {
        const fill = Math.max(0, Math.min(1, value - i + 1))
        return <svg key={i} width={size} height={size} viewBox="0 0 24 24"><defs><linearGradient id={`s${i}-${Math.round(fill * 100)}`}>
          <stop offset={`${fill * 100}%`} stopColor="currentColor" /><stop offset={`${fill * 100}%`} stopColor="transparent" /></linearGradient></defs>
          <path d={STAR} fill={`url(#s${i}-${Math.round(fill * 100)})`} stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>
      })}</span>
      <b aria-hidden>{value.toFixed(1)}</b>{count != null && <span className="stars-n" aria-hidden>({count})</span>}
    </span>
  )
}

/** Choose 1–5 stars: a radio group, so it works with the keyboard and screen readers like any other choice. */
export function StarInput({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  const [hover, setHover] = useState(0)
  const shown = hover || value
  const WORDS = ['', t('Poor'), t('Below expectations'), t('Good'), t('Very good'), t('Excellent')]
  return (
    <fieldset className="star-input" onMouseLeave={() => setHover(0)}>
      <legend className="small">{label}</legend>
      <div className="star-row">{[1, 2, 3, 4, 5].map(i => <label key={i} onMouseEnter={() => setHover(i)} className={i <= shown ? 'on' : ''}>
        <input type="radio" name="score" value={i} checked={value === i} onChange={() => onChange(i)} className="visually-hidden" />
        <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden><path d={STAR} fill="currentColor" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /></svg>
        <span className="visually-hidden">{t('{n} of 5 stars', { n: i })}, {WORDS[i]}</span>
      </label>)}<span className="star-word small" aria-hidden>{WORDS[shown]}</span></div>
    </fieldset>
  )
}
