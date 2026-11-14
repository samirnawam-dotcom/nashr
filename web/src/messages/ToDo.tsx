import { useEffect, useState } from 'react'
import { api } from '../api'
import { money, slotWhen } from '../format'
import { tm } from '../i18n-server'
import { t } from '../i18n'

type D = { id: string; ref: string; status: string; outlet: string; label: string; startsAt: string; channel?: string | null; total: number; currency: string
  nextDeadlineAt: string | null; creative?: string | null }
type Item = { d: D; what: 'pay' | 'creative' | 'proof'; by: string | null }

/** A paid booking still needs its creative until one is with the publisher or approved. */
const needsCreative = (d: D) => d.status === 'payment_secured' && !['pending', 'approved'].includes(d.creative ?? '')

/** What the buyer has to do (owner's buyer-side fixes): pay now, send creative, approve proof. Most urgent first. */
export function toDo(deals: D[]): Item[] {
  const items: Item[] = []
  for (const d of deals) {
    if (d.status === 'accepted_pay_now') items.push({ d, what: 'pay', by: d.nextDeadlineAt })
    else if (needsCreative(d)) items.push({ d, what: 'creative', by: d.nextDeadlineAt })
    else if (d.status === 'proof_ready') items.push({ d, what: 'proof', by: d.nextDeadlineAt })
  }
  const at = (x: Item) => x.by ? Date.parse(x.by) : Infinity
  return items.sort((a, b) => at(a) - at(b))
}

const LABEL = { pay: 'Pay now', creative: 'Send creative', proof: 'Approve proof' } as const
const left = (iso: string) => {
  const h = Math.max(0, Math.round((Date.parse(iso) - Date.now()) / 3_600_000))
  return h < 48 ? t(h === 1 ? 'within 1 hour' : 'within {n} hours', { n: h }) : t('within {n} days', { n: Math.round(h / 24) })
}

export function BuyerToDo() {
  const [items, setItems] = useState<Item[] | null>(null)
  useEffect(() => { api<D[]>('/deals').then(d => setItems(toDo(d)), () => setItems([])) }, [])
  if (!items) return null
  return <section className="card todo" aria-labelledby="todo-h">
    <h2 id="todo-h">{t('To do')}{items.length > 0 && <span className="todo-n num">{items.length}</span>}</h2>
    {!items.length ? <p className="muted small">{t('Nothing to do right now. Payments, creatives and proofs that need you will show here.')}</p>
      : <ul>{items.map(({ d, what, by }) => <li key={d.id}>
        <a href={`/bookings/${d.id}`} className="todo-row">
          <span className={`todo-what ${what}`}>{t(LABEL[what])}</span>
          <span className="todo-main"><span><b dir="auto">{d.outlet}</b> · {tm(d.label)}</span><span className="small muted">{slotWhen(d.startsAt, d.channel)} · <span className="num">{d.ref}</span>{what === 'pay' ? ` · ${money(d.total, d.currency)}` : ''}</span></span>
          {by && <span className="todo-by small">{left(by)}</span>}
        </a></li>)}</ul>}
  </section>
}
