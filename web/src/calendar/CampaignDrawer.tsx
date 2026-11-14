import { useEffect, useState } from 'react'
import { api, type Campaign } from '../api'
import { money } from '../format'
import { OutletMark } from '../LogoPicker'
import { MEDIA_LABEL } from '../../../server/shared/media'
import { Stage, type CampaignDetail } from '../campaigns/Campaigns'
import { t } from '../i18n'

/*
 * The campaign the buyer is working on (owner's buyer-side fixes): one choice shared by the Calendar's Campaign drawer, the bid
 * drawer and the Directory, remembered on this device. Campaigns are optional; with none chosen the buyer simply bids.
 */
const KEY = 'nashr:last-campaign'
let current = (() => { try { return localStorage.getItem(KEY) ?? '' } catch { return '' } })()
const subs = new Set<() => void>()
export function setCurrentCampaign(id: string) {
  current = id; try { localStorage.setItem(KEY, id) } catch { /* private mode: lasts for this visit */ }
  subs.forEach(f => f())
}
export function useCurrentCampaign(): [string, (id: string) => void] {
  const [, tick] = useState(0)
  useEffect(() => { const f = () => tick(n => n + 1); subs.add(f); return () => { subs.delete(f) } }, [])
  return [current, setCurrentCampaign]
}
/** The buyer's active campaigns; a remembered choice that is no longer active is forgotten. */
export function useCampaigns(enabled = true) {
  const [list, setList] = useState<Campaign[] | null>(null), [id] = useCurrentCampaign()
  const load = () => api<Campaign[]>('/campaigns').then(c => { const active = c.filter(x => x.status === 'active'); setList(active)
    if (id && !active.some(x => x.id === id)) setCurrentCampaign('') }, () => setList([]))
  useEffect(() => { if (enabled) load() }, [enabled])
  return { list: list ?? [], loaded: list != null, reload: load }
}

/** The Campaign drawer: switch campaigns at the top, then what is added, the estimated total and the budget left. */
export function CampaignDrawer({ onClose, onSeeDates }: { onClose: () => void; onSeeDates: (productId: string, title: string) => void }) {
  const [id, setId] = useCurrentCampaign(), { list, loaded } = useCampaigns()
  const [c, setC] = useState<CampaignDetail | null>(null), [error, setError] = useState('')
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); addEventListener('keydown', k); return () => removeEventListener('keydown', k) }, [])
  useEffect(() => { setC(null); setError(''); if (id) api<CampaignDetail>(`/campaigns/${id}`).then(setC, e => setError(e.message)) }, [id])
  async function remove(placementId: string) { await api(`/campaigns/${id}/lines/${placementId}`, { method: 'DELETE' }); setC(await api<CampaignDetail>(`/campaigns/${id}`)) }
  const left = c?.remaining
  return <div className="scrim" onClick={onClose}>
    <aside className="drawer plan" role="dialog" aria-label={t('Campaign')} onClick={e => e.stopPropagation()}>
      <header className="drawer-h"><div><h2>{t('Campaign')}</h2>
        <p className="muted small">{t('What you have added, the estimated total and the budget left. Campaigns are optional: you can always just bid.')}</p></div>
        <button className="btn" onClick={onClose} aria-label={t('Close')}>✕</button></header>
      {!loaded ? <p className="muted">{t('Loading…')}</p> : !list.length ? <div className="cd-empty">
        <p>{t('No campaign yet. A campaign holds your dates, budget and one brief that goes with every bid.')}</p>
        <a className="btn primary" href="/campaigns?new=1">{t('New campaign')}</a></div> : <>
        <div className="field"><label htmlFor="cd-pick">{t('Campaign')}</label>
          <select id="cd-pick" value={id} onChange={e => setId(e.target.value)}><option value="">{t('Choose a campaign…')}</option>
            {list.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
          <a className="small" href="/campaigns?new=1">+ {t('New campaign')}</a></div>
        {error && <p className="error">{error}</p>}
        {id && !c && !error && <p className="muted">{t('Loading…')}</p>}
        {c && <>
          <dl className="cd-sum">
            <div><dt>{t('Estimated')}</dt><dd className="num">{money(c.estimated)}</dd></div>
            <div><dt>{t('Committed')}</dt><dd className="num">{money(c.committed)}</dd></div>
            <div><dt>{t('Budget left')}</dt><dd className={`num ${left != null && left < 0 ? 'over' : ''}`}>{left == null ? t('No budget') : money(left)}</dd></div>
          </dl>
          {!c.plan.length ? <p className="empty">{t('Nothing added yet. Open a slot and press "Add to campaign", or add products from the Directory.')}</p>
            : <ul className="cd-rows">{c.plan.map(l => <li key={l.placementId}>
              <span className="cd-prod"><OutletMark name={l.brand ?? l.name} url={l.logoUrl} size={30} />
                <span><b dir="auto">{l.title}</b><span className="small muted">{t(MEDIA_LABEL[l.channel] ?? 'Other')} · {money(l.estimated)}</span><Stage s={l.stage} /></span></span>
              <span className="cd-acts">{l.openSlots > 0 && <button type="button" className="btn sm" onClick={() => onSeeDates(l.placementId, l.title)}>{t('See dates')}</button>}
                {l.stage === 'added' && <button type="button" className="btn sm" onClick={() => remove(l.placementId)} aria-label={t('Remove {name}', { name: l.title })}>✕</button>}</span>
            </li>)}</ul>}
          <footer className="drawer-f"><a className="btn" href={`/campaigns/${c.id}`}>{t('Open the campaign')}</a></footer>
        </>}
      </>}
    </aside>
  </div>
}
