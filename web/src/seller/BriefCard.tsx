import { briefLanguage, money } from '../format'
import { OutletMark } from '../LogoPicker'
import { t } from '../i18n'

/** What the server sends a publisher about a bid before it decides (owner's buyer-side fixes, round 2). */
export type BriefView = {
  advertiser: string | null; industry: string | null; message: string | null; language: string | null; languageOther: string | null
  landingUrl: string | null; notes: string | null; disclaimer: string | null
  client: { name: string; logoUrl: string | null } | null
  creative: { fileId: string; name: string; type: string; size: number } | null
}

/** The creative itself: a picture, sound or video plays here; anything else (a PDF, a ZIP) is a download. */
function Preview({ c }: { c: NonNullable<BriefView['creative']> }) {
  const src = `/api/files/${c.fileId}`
  if (c.type.startsWith('image/')) return <img className="bc-img" src={src} alt={t('The creative')} loading="lazy" />
  if (c.type.startsWith('audio/')) return <audio className="bc-media" src={src} controls preload="none" aria-label={t('The creative')} />
  if (c.type.startsWith('video/')) return <video className="bc-media" src={src} controls preload="metadata" aria-label={t('The creative')} />
  return null
}

/**
 * A seller never accepts something blind: the advertiser (the client's name and logo, if there is one), industry, what the ad will say,
 * its language, the creative with a download, any required disclaimer and the amount, shown above Accept and Decline.
 * Never the buyer's budget, campaign name, dates or objective.
 */
export function BriefCard({ b, amount, compact }: { b: BriefView; amount?: number; compact?: boolean }) {
  const who = b.client?.name ?? b.advertiser ?? ''
  return <div className={`brief-card ${compact ? 'compact' : ''}`}>
    <div className="bc-who"><OutletMark name={who} url={b.client?.logoUrl ?? null} size={compact ? 32 : 40} />
      <div><b dir="auto">{who}</b>{b.client && b.advertiser && b.advertiser !== b.client.name && <div className="small muted" dir="auto">{b.advertiser}</div>}</div>
      {amount != null && <span className="bc-amount num">{money(amount)}</span>}</div>
    <dl className="facts">
      {b.industry && <div><dt>{t('Industry')}</dt><dd>{t(b.industry)}</dd></div>}
      {b.message && <div><dt>{t('What the ad will say')}</dt><dd dir="auto">“{b.message}”</dd></div>}
      {b.language && <div><dt>{t('Creative language')}</dt><dd dir="auto">{briefLanguage(b)}</dd></div>}
      {b.landingUrl && <div><dt>{t('Landing page')}</dt><dd dir="ltr">{b.landingUrl}</dd></div>}
      {b.notes && <div><dt>{t('Notes')}</dt><dd dir="auto">{b.notes}</dd></div>}
      {b.disclaimer && <div className="must"><dt>{t('Required disclaimer')}</dt><dd><b dir="auto">{b.disclaimer}</b></dd></div>}
    </dl>
    <div className="bc-creative"><span className="label">{t('The creative')}</span>
      {b.creative ? <><Preview c={b.creative} />
        <a className="btn sm" href={`/api/files/${b.creative.fileId}`} download={b.creative.name}>{t('Download')}</a>
        <span className="small muted"><bdi>{b.creative.name}</bdi> · {Math.max(1, Math.round(b.creative.size / 1024))} KB</span></>
        : <span className="small muted">{t('No creative was attached to this bid (sent before creatives were required).')}</span>}</div>
  </div>
}
