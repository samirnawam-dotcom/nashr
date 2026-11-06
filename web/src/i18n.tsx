import { AR } from './i18n-ar'

/*
 * Arabic and English. The English sentence is the key: t('Sign in') returns the Arabic when the visitor chose Arabic,
 * and the English otherwise (also when a translation is missing, so a gap is never a blank). The language is chosen
 * once per page load, before anything renders, so module-level labels translate too; switching reloads the page.
 * A visitor can share an Arabic link with ?lang=ar. Digits stay Latin (0-9), as UAE business documents use them.
 */
export type Lang = 'en' | 'ar'
const KEY = 'nashr:lang'

function initial(): Lang {
  if (typeof window === 'undefined') return 'en' // pre-rendering for search engines
  try {
    const q = new URLSearchParams(location.search).get('lang')
    if (q === 'ar' || q === 'en') { localStorage.setItem(KEY, q); return q }
    return localStorage.getItem(KEY) === 'ar' ? 'ar' : 'en'
  } catch { return 'en' }
}

export const lang: Lang = initial()
export const isAr = lang === 'ar'
/** For Intl: Arabic month and day names with Latin digits; English as before. */
export const locale = isAr ? 'ar-AE-u-nu-latn' : 'en-GB'

export function t(s: string, vars?: Record<string, string | number>) {
  let out = isAr ? (AR[s] ?? s) : s
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v))
  return out
}

/** Keep a time range, code or Latin run in its own left-to-right order inside Arabic text (09:00–10:30 never flips). */
export const ltr = (s: string) => isAr ? `\u2066${s}\u2069` : s
/** The list separator: Arabic comma in Arabic. */
export const sep = isAr ? '، ' : ', '

/** Set the page's language and direction. Called before the first render. */
export function applyLang() {
  document.documentElement.lang = lang
  document.documentElement.dir = isAr ? 'rtl' : 'ltr'
}

export function setLang(next: Lang) {
  try { localStorage.setItem(KEY, next) } catch { /* private mode: this page only */ }
  const u = new URL(location.href); u.searchParams.delete('lang')
  location.replace(u.toString())
}

/** The switch: shows the other language in its own script. */
export function LangSwitch({ className = '' }: { className?: string }) {
  return isAr
    ? <button type="button" className={`lang-switch ${className}`} lang="en" onClick={() => setLang('en')}>English</button>
    : <button type="button" className={`lang-switch ${className}`} lang="ar" onClick={() => setLang('ar')}>العربية</button>
}
