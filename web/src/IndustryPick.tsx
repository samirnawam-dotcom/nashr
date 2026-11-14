import { useState } from 'react'
import { INDUSTRIES } from './industries'
import { t } from './i18n'

const LIST = INDUSTRIES.filter(x => x !== 'Other')

/**
 * The industry, picked from the same sector list publishers use (so their sector blocking works), or Other with the buyer's own
 * words. A value not on the list is shown as Other with that text.
 */
export function IndustryPick({ id, value, onChange, required }: { id: string; value: string; onChange: (v: string) => void; required?: boolean }) {
  const known = LIST.includes(value), [other, setOther] = useState(!!value && !known)
  return <div className="ed-pick">
    <select id={id} value={other ? 'Other' : value} required={required} onChange={e => { const v = e.target.value
      if (v === 'Other') { setOther(true); onChange(known ? '' : value) } else { setOther(false); onChange(v) } }}>
      <option value="">{t('Choose…')}</option>{LIST.map(x => <option key={x} value={x}>{t(x)}</option>)}<option value="Other">{t('Other')}</option></select>
    {other && <input aria-label={t('Other: say what it is')} placeholder={t('Say what it is')} dir="auto" maxLength={80} value={known ? '' : value} onChange={e => onChange(e.target.value)} />}
  </div>
}
