import { t } from './i18n'

/*
 * The Nashr logo, always from the brand files (web/public/brand/logo), never retyped (brand guide: Logo).
 * full: the noon mark, "nashr" and "نشر"; english: where the full logo would be under 120 px wide; mark: avatars and loading.
 * primary is black with the red dot (light pages), reversed is white with the red dot (dark pages and photos under a veil).
 * The logo is never mirrored on Arabic pages; only its position moves.
 */
type Variant = 'full' | 'english' | 'mark'
const FILE: Record<Variant, string> = { full: 'nashr-logo', english: 'nashr-logo-english', mark: 'nashr-mark' }
const RATIO: Record<Variant, number> = { full: 3620 / 588, english: 2480 / 588, mark: 812 / 588 }

export function LogoImage({ variant = 'full', tone = 'primary', height = 24, className }: { variant?: Variant; tone?: 'primary' | 'reversed'; height?: number; className?: string }) {
  return <img className={`logo-img-brand ${className ?? ''}`} src={`/brand/logo/${FILE[variant]}-${tone}.svg`} alt="Nashr"
    width={Math.round(height * RATIO[variant])} height={height} decoding="async" />
}

/** The logo as a link home: 22–28 px tall in headers, at the start of the row (the right on Arabic pages). */
export function Logo({ href = '/', variant = 'full', tone = 'primary', height = 24 }: { href?: string; variant?: Variant; tone?: 'primary' | 'reversed'; height?: number }) {
  return <a className="logo" href={href} aria-label={t('Nashr home')}><LogoImage variant={variant} tone={tone} height={height} /></a>
}
