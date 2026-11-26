import { t } from './i18n'

/** Test mode (the server's TESTING switch): one quiet line on every page, so testers know nothing here is real. */
export function TestBar() {
  return <div className="test-bar" role="note">
    <b>{t('Test version')}</b>
    <span>{t('Payments are simulated: no real money moves. Tell us anything that looks wrong.')}</span>
    <a href="/help">{t('Send feedback')}</a>
  </div>
}
