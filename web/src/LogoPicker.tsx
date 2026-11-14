import { useRef, useState } from 'react'
import { ApiError } from './api'
import { t } from './i18n'
import { tm } from './i18n-server'

const SIZE = 512, MIN = 160

export const initials = (name: string) => name.split(/\s+/).filter(w => /\w/.test(w)).slice(0, 2).map(w => w[0]).join('').toUpperCase()

/** An outlet's logo, or its initials on the brand colour when there is none: the same mark everywhere it appears. */
export const OutletMark = ({ name, url, size = 40 }: { name: string; url?: string | null; size?: number }) => url
  ? <img className="logo-img" src={url} width={size} height={size} alt="" loading="lazy" decoding="async" />
  : <span className="logo-img initials" style={{ width: size, height: size, fontSize: Math.round(size * .36) }} aria-hidden>{initials(name)}</span>

/**
 * The logo on an outlet's profile, directory card, bookings and admin. Centre-cropped to a square and resized to 512×512 in the
 * browser, as a PNG so a transparent logo stays transparent; the phone's location and camera details never leave the device.
 */
export function LogoPicker({ name, url, endpoint, onBlob, saved }: { name: string; url: string | null; endpoint: string; onBlob?: (b: Blob | null) => void; saved?: string }) {
  const [logo, setLogo] = useState(url), [busy, setBusy] = useState(false), [error, setError] = useState(''), [note, setNote] = useState('')
  const input = useRef<HTMLInputElement>(null)
  async function pick(file: File) {
    setError(''); setNote('')
    if (!/^image\/(jpeg|png)$/.test(file.type)) return setError(t('Use a JPEG or PNG image.'))
    setBusy(true)
    try {
      const img = await createImageBitmap(file)
      if (Math.min(img.width, img.height) < MIN) throw new ApiError(t('This image is {w}×{h} pixels. Use one at least {min} pixels on each side.', { w: img.width, h: img.height, min: MIN }), 400)
      const side = Math.min(img.width, img.height), canvas = document.createElement('canvas'); canvas.width = canvas.height = SIZE
      const ctx = canvas.getContext('2d')!; ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, SIZE, SIZE)
      const blob = await new Promise<Blob>((ok, no) => canvas.toBlob(b => b ? ok(b) : no(new Error('encode')), 'image/png'))
      // not saved yet (a new outlet): keep the picture and hand it back; it is uploaded when the outlet is saved
      if (onBlob) { onBlob(blob); setLogo(URL.createObjectURL(blob)); setNote(t('Logo chosen. It is saved with the outlet.')); return }
      const r = await fetch(`/api${endpoint}`, { method: 'PUT', credentials: 'same-origin', body: blob, headers: { 'content-type': 'image/png' } })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new ApiError(data.error ? tm(data.error) : t('The logo could not be uploaded.'), r.status)
      setLogo(data.logoUrl); setNote(saved ?? t('Logo saved. Buyers see it now.'))
    } catch (e: any) { setError(e instanceof ApiError ? e.message : t('This image could not be read. Try another JPEG or PNG.')) }
    finally { setBusy(false); if (input.current) input.current.value = '' }
  }
  async function remove() {
    if (onBlob) { onBlob(null); setLogo(null); setNote(''); return }
    setBusy(true); setError(''); setNote('')
    try {
      const r = await fetch(`/api${endpoint}`, { method: 'DELETE', credentials: 'same-origin' })
      if (!r.ok) throw new ApiError(tm((await r.json().catch(() => ({}))).error) || t('The logo could not be removed.'), r.status)
      setLogo(null); setNote(t('Logo removed. Your initials show instead.'))
    } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }
  return (
    <div className="logo-picker">
      <OutletMark name={name} url={logo} size={88} />
      <div className="logo-picker-body">
        <b>{t('Logo')}</b>
        <span className="small muted">{t('A square PNG or JPEG, at least {min} pixels. Transparent backgrounds stay transparent.', { min: MIN })}</span>
        <div className="row-flex">
          <label className={`btn ${busy ? 'disabled' : ''}`}>
            <input ref={input} type="file" accept="image/png,image/jpeg" className="visually-hidden" disabled={busy} onChange={e => e.target.files?.[0] && pick(e.target.files[0])} />
            {busy ? t('Saving…') : logo ? t('Replace logo') : t('Upload a logo')}</label>
          {logo && <button type="button" className="btn" disabled={busy} onClick={remove}>{t('Remove')}</button>}
        </div>
        {error && <p className="error small" role="alert">{error}</p>}
        {note && <p className="ok small" role="status">{note}</p>}
      </div>
    </div>
  )
}
