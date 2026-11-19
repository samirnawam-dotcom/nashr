import { t } from './i18n'
import { setThemePref, useTheme, useThemePref, type ThemePref } from './theme'

const MOON = 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z'
const SUN = 'M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z'

/** One tap between light and dark, for the headers (outline icon, 1.7 stroke, as the guide's icons). */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const theme = useTheme(), next = theme === 'dark' ? 'light' : 'dark'
  const label = next === 'dark' ? t('Switch to the dark theme') : t('Switch to the light theme')
  return <button type="button" className={`theme-toggle ${className}`} onClick={() => setThemePref(next)} aria-label={label} title={label}>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={theme === 'dark' ? SUN : MOON} /></svg>
  </button>
}

/** Light, Dark or Device (follow the phone or computer), for the account menu and the account page. */
export function ThemeChoice() {
  const pref = useThemePref()
  const options: [ThemePref, string][] = [['light', t('Light')], ['dark', t('Dark')], ['system', t('Device')]]
  return <div className="seg theme-choice" role="radiogroup" aria-label={t('Theme')}>
    {options.map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={pref === v} className={pref === v ? 'on' : ''} onClick={() => setThemePref(v)}>{l}</button>)}
  </div>
}
