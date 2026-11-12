import { useState } from 'react'
import { t } from '../i18n'
import { REACH_UNITS, label } from '../../../server/shared/products'

/** Who the product reaches, kept short for a side panel: audience, reach with what it counts, and the "anything else" line (full text a tap away). */
export function Reach({ audience, reach, reachUnit, notes }: { audience?: string | null; reach?: number | null; reachUnit?: string | null; notes?: string | null }) {
  const [all, setAll] = useState(false)
  if (!audience && !reach && !notes) return null
  return <dl className="sp-reach">
    {audience && <div><dt>{t('Audience')}</dt><dd dir="auto">{audience}</dd></div>}
    {reach ? <div><dt>{t('Reach')}</dt><dd className="num">{reach.toLocaleString('en-US')}{reachUnit ? ` ${t(label(REACH_UNITS, reachUnit)).toLowerCase()}` : ''}</dd></div> : null}
    {notes && <div className="sp-notes"><dt>{t('Anything else buyers should know')}</dt><dd dir="auto" className={all ? 'all' : ''}>{notes}</dd>
      {notes.length > 70 && <button type="button" className="text-link small" aria-expanded={all} onClick={() => setAll(!all)}>{all ? t('Show less') : t('Show all')}</button>}</div>}
  </dl>
}

