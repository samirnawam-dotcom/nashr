import { AUDIENCES } from '../../server/shared/audiences'
import { t } from './i18n'

/** Tick the audiences an outlet or placement reaches (a fixed list Nashr curates, so buyers' filter stays clean). */
export function AudiencePicker({ value, onChange, idPrefix }: { value: string[]; onChange: (v: string[]) => void; idPrefix: string }) {
  return <div className="aud-pick" role="group" aria-label={t('Audiences')}>
    {AUDIENCES.map(([k, label, blurb]) => { const on = value.includes(k)
      return <label key={k} className={`aud-chip ${on ? 'on' : ''}`} title={t(blurb)} htmlFor={`${idPrefix}-${k}`}>
        <input id={`${idPrefix}-${k}`} type="checkbox" checked={on} onChange={() => onChange(on ? value.filter(x => x !== k) : [...value, k])} />{t(label)}</label> })}
  </div>
}

export { AUDIENCES }
