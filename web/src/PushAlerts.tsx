import { useEffect, useState } from 'react'
import { api } from './api'
import { t } from './i18n'

// The browser offers "install" once; main.tsx keeps that offer so the button below can use it later.
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
declare global { interface Window { nashrInstall?: InstallPrompt | null } }

const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
const standalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true
const iOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent)
const keyBytes = (b64: string) => Uint8Array.from(atob((b64 + '='.repeat((4 - b64.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
const deviceName = () => { const u = navigator.userAgent
  return `${/iPhone/.test(u) ? 'iPhone' : /iPad/.test(u) ? 'iPad' : /Android/.test(u) ? 'Android' : /Mac OS/.test(u) ? 'Mac' : /Windows/.test(u) ? 'Windows' : 'Browser'}`
    + ` · ${/Edg\//.test(u) ? 'Edge' : /Chrome\//.test(u) ? 'Chrome' : /Firefox\//.test(u) ? 'Firefox' : /Safari\//.test(u) ? 'Safari' : ''}` }

/**
 * Phone and browser alerts, and installing Nashr like an app. Alerts reach this device even when Nashr is closed: being
 * outbid, a booking accepted, a payment due, an issue reported. The same choices as emails apply.
 */
export function PushAlerts() {
  const [on, setOn] = useState<boolean | null>(null), [devices, setDevices] = useState(0), [busy, setBusy] = useState(false)
  const [error, setError] = useState(''), [note, setNote] = useState(''), [canInstall, setCanInstall] = useState(!!window.nashrInstall)
  useEffect(() => {
    api<{ devices: number }>('/push/key').then(k => setDevices(k.devices), () => {})
    if (supported()) navigator.serviceWorker.getRegistration().then(r => r?.pushManager.getSubscription()).then(s => setOn(!!s), () => setOn(false)); else setOn(false)
    const offer = () => setCanInstall(true); addEventListener('nashr-install', offer); return () => removeEventListener('nashr-install', offer)
  }, [])
  async function run(fn: () => Promise<unknown>) { setBusy(true); setError(''); setNote(''); try { await fn() } catch (e: any) { setError(e.message || String(e)) } finally { setBusy(false) } }
  async function turnOn() {
    if ((await Notification.requestPermission()) !== 'granted') throw new Error(t('Alerts are blocked for Nashr in this browser. Allow them in the browser\'s site settings, then try again.'))
    const reg = await navigator.serviceWorker.register('/sw.js'); await navigator.serviceWorker.ready
    const { publicKey } = await api<{ publicKey: string }>('/push/key')
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) })
    const j = sub.toJSON()
    await api('/push/subscribe', { method: 'POST', body: { endpoint: j.endpoint, keys: { p256dh: j.keys!.p256dh, auth: j.keys!.auth }, device: deviceName() } })
    setOn(true); setDevices(d => d + 1); setNote(t('Alerts are on for this device.'))
  }
  async function turnOff() {
    const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription()
    if (sub) { await api('/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } }); await sub.unsubscribe() }
    setOn(false); setDevices(d => Math.max(0, d - 1)); setNote(t('Alerts are off for this device.'))
  }
  async function install() { const p = window.nashrInstall; if (!p) return; await p.prompt(); await p.userChoice; window.nashrInstall = null; setCanInstall(false) }
  return <section className="card pad section form push-alerts"><h2>{t('Phone and browser alerts')}</h2>
    <p>{t('Get an alert on this device even when Nashr is closed: when you are outbid, a booking is accepted, a payment is due or an issue is reported. Your email choices above apply to alerts too.')}</p>
    {standalone() ? <p className="small lead">{t('Nashr is installed on this device.')}</p>
      : canInstall ? <button type="button" className="btn" style={{ justifySelf: 'start' }} onClick={install}>{t('Install Nashr on this device')}</button>
      : iOS() ? <p className="small muted">{t('On iPhone and iPad: tap Share, then "Add to Home Screen". Open Nashr from the Home Screen to turn alerts on.')}</p> : null}
    {!supported() ? <p className="small muted">{t('This browser cannot receive alerts.')}</p>
      : <div className="row-flex">
        {on ? <><span className="pill-state is-lead">{t('On for this device')}</span>
          <button type="button" className="btn" disabled={busy} onClick={() => run(async () => { const r = await api<{ sent: number }>('/push/test', { method: 'POST' }); setNote(r.sent ? t('A test alert is on its way.') : t('The alert service did not accept the test. Turn alerts off and on again.')) })}>{t('Send a test alert')}</button>
          <button type="button" className="btn" disabled={busy} onClick={() => run(turnOff)}>{t('Turn off on this device')}</button></>
          : <button type="button" className="btn primary" disabled={busy || on === null} onClick={() => run(turnOn)}>{t('Turn on alerts on this device')}</button>}
      </div>}
    {devices > 0 && <p className="small muted">{t('Alerts are on for {n} of your devices.', { n: devices })}</p>}
    {error && <p className="error" role="alert">{error}</p>}{note && <p className="ok" role="status">{note}</p>}
  </section>
}
