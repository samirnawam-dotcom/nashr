import { Waitlist } from './directory/Directory'
import { t } from './i18n'

/** Athena, the planning assistant, is on hold until there is enough real data (brief section 21). Do not build the planner now. */
export function AthenaPage() {
  return (
    <main className="narrow">
      <span className="badge">{t('Coming soon')}</span>
      <h1 style={{ margin: '12px 0' }}>{t('Athena')}</h1>
      <p>{t('Athena will turn a campaign brief into a suggested set of bookable slots across UAE media, based on real winning prices, audiences and results on Nashr.')}</p>
      <p className="muted">{t("We're collecting that data now with every booking. Until then, plan with")} <a href="/campaigns">{t('Campaigns')}</a> {t('and the')} <a href="/directory">{t('Directory')}</a>.</p>
      <Waitlist topic="Athena" label={t('Tell me when Athena launches')} />
    </main>
  )
}
