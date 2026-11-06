import { useRef, useState } from 'react'
import { ApiError } from './api'

const W = 1600, H = 500, MIN_WIDTH = 1000
const CHANNEL_NAME: Record<string, string> = { tv: 'TV', radio: 'radio', print: 'print', digital: 'digital', podcast: 'podcast' }

/**
 * The cover photo on an outlet's directory card and page. The photo is cropped to the cover's shape and resized in the
 * browser before it is sent: the upload stays small, every cover is sharp at the same size, and the location and camera
 * details a phone stores inside a photo never leave the device. Without a cover, the outlet shows its channel's photo.
 */
export function CoverPicker({ url, channel, endpoint, onChange }: { url: string | null; channel: string; endpoint: string; onChange?: (url: string | null) => void }) {
  const [cover, setCover] = useState(url), [busy, setBusy] = useState(false), [error, setError] = useState(''), [note, setNote] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const done = (next: string | null, message: string) => { setCover(next); setNote(message); onChange?.(next) }

  async function pick(file: File) {
    setError(''); setNote('')
    if (!/^image\/(jpeg|png)$/.test(file.type)) return setError('Use a JPEG or PNG photo.')
    setBusy(true)
    try {
      const img = await createImageBitmap(file)
      if (img.width < MIN_WIDTH) throw new ApiError(`This photo is ${img.width} pixels wide. Use one at least ${MIN_WIDTH} pixels wide so it stays sharp.`, 400)
      const blob = await toCover(img)
      const r = await fetch(`/api${endpoint}`, { method: 'PUT', credentials: 'same-origin', body: blob, headers: { 'content-type': 'image/jpeg' } })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new ApiError(data.error ?? 'The photo could not be uploaded.', r.status)
      done(data.coverUrl, 'Cover photo saved. Buyers see it now.')
    } catch (e: any) { setError(e instanceof ApiError ? e.message : 'This photo could not be read. Try another JPEG or PNG.') }
    finally { setBusy(false); if (input.current) input.current.value = '' }
  }
  async function remove() {
    setBusy(true); setError(''); setNote('')
    try {
      const r = await fetch(`/api${endpoint}`, { method: 'DELETE', credentials: 'same-origin' })
      if (!r.ok) throw new ApiError((await r.json().catch(() => ({}))).error ?? 'The photo could not be removed.', r.status)
      done(null, `Cover photo removed. The ${CHANNEL_NAME[channel] ?? channel} photo shows instead.`)
    } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="cover-picker">
      <div className="cover-preview"><img src={cover ?? `/brand/${channel}-wide.jpg`} width={W} height={H} alt="" />
        {!cover && <span className="cover-default">Default {CHANNEL_NAME[channel] ?? channel} photo</span>}</div>
      <div className="row-flex">
        <label className={`btn ${busy ? 'disabled' : ''}`}>
          <input ref={input} type="file" accept="image/jpeg,image/png" className="visually-hidden" disabled={busy}
            onChange={e => e.target.files?.[0] && pick(e.target.files[0])} />
          {busy ? 'Saving…' : cover ? 'Replace cover photo' : 'Upload a cover photo'}
        </label>
        {cover && <button type="button" className="btn" disabled={busy} onClick={remove}>Remove</button>}
      </div>
      <span className="small muted">A wide photo of the outlet's studio, team or publication, at least {MIN_WIDTH} pixels wide. It is cropped to a 16:5 strip.</span>
      {error && <p className="error" role="alert">{error}</p>}
      {note && <p className="ok" role="status">{note}</p>}
    </div>
  )
}

/** Centre-crop to 16:5 and scale to 1600×500, as a JPEG. */
async function toCover(img: ImageBitmap): Promise<Blob> {
  const ratio = W / H, sw = Math.min(img.width, img.height * ratio), sh = sw / ratio
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, W, H)
  return new Promise((ok, no) => canvas.toBlob(b => b ? ok(b) : no(new Error('encode')), 'image/jpeg', 0.85))
}
