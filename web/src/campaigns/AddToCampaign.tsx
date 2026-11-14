import { useState } from 'react'
import { api } from '../api'
import { useCampaigns, useCurrentCampaign } from '../calendar/CampaignDrawer'
import { tm } from '../i18n-server'
import { t } from '../i18n'

/**
 * "+ Add to campaign" (owner's buyer-side fixes): the product goes into the campaign the buyer is working on. With none chosen yet,
 * a short list asks which; with no campaign at all, it offers to start one.
 */
export function AddToCampaign({ placementId, small }: { placementId: string; small?: boolean }) {
  const [id, setId] = useCurrentCampaign(), { list, reload } = useCampaigns()
  const [picking, setPicking] = useState(false), [note, setNote] = useState(''), [error, setError] = useState('')
  async function add(cid: string) {
    setError('')
    try { await api(`/campaigns/${cid}/lines`, { method: 'POST', body: { placementId } }); setId(cid); setPicking(false)
      setNote(t('Added to {name}.', { name: list.find(c => c.id === cid)?.name ?? '' })); reload() } catch (e: any) { setError(tm(e.message)) }
  }
  return <span className="atc">
    {!picking ? <button type="button" className={`btn ${small ? 'sm' : ''}`} onClick={() => id && list.some(c => c.id === id) ? add(id) : setPicking(true)}>+ {t('Add to campaign')}</button>
      : list.length ? <select className={small ? 'sm' : ''} aria-label={t('Campaign')} defaultValue="" autoFocus onChange={e => e.target.value && add(e.target.value)} onBlur={() => setPicking(false)}>
        <option value="">{t('Choose a campaign…')}</option>{list.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      : <a className={`btn ${small ? 'sm' : ''}`} href="/campaigns?new=1">{t('New campaign')}</a>}
    {note && <span className="small ok" role="status">{note}</span>}
    {error && <span className="small error" role="alert">{error}</span>}
  </span>
}
