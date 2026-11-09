import { createHmac, timingSafeEqual } from 'node:crypto'
import type { ChargeResult, PaymentProvider } from './provider.js'

/*
 * Stripe behind the PaymentProvider interface (task B5, SPEC 5: separate charges and transfers).
 *   charge    a PaymentIntent confirmed with the card the buyer entered in Stripe's own fields (Nashr never sees card numbers)
 *   refund    a Refund of that PaymentIntent
 *   transfer  a Transfer from Nashr's balance to the publisher's connected (Express) account at release
 *   balance   Nashr's Stripe balance (available + pending), for the money check
 * Plain REST calls: no SDK dependency. Every write carries the operation's idempotency key, so a retry never repeats it.
 */
type Fetch = typeof fetch
export class StripeError extends Error { constructor(message: string, public status: number, public code?: string) { super(message) } }

function form(params: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(params).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}[${k}]` : k
    if (v === undefined || v === null) return []
    if (Array.isArray(v)) return v.flatMap((x, i) => typeof x === 'object' ? form(x, `${key}[${i}]`) : [`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(x))}`])
    if (typeof v === 'object') return form(v as Record<string, unknown>, key)
    return [`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`]
  })
}

export class StripeProvider implements PaymentProvider {
  constructor(private secretKey: string, private http: Fetch = fetch, private base = 'https://api.stripe.com') {}

  private async call<T = any>(method: 'GET' | 'POST', path: string, params: Record<string, unknown> = {}, idempotencyKey?: string): Promise<T> {
    const body = form(params).join('&')
    const url = method === 'GET' && body ? `${this.base}${path}?${body}` : `${this.base}${path}`
    const r = await this.http(url, {
      method, body: method === 'POST' ? body : undefined,
      headers: { authorization: `Bearer ${this.secretKey}`, 'content-type': 'application/x-www-form-urlencoded', 'stripe-version': '2024-06-20',
        ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}) },
    })
    const data: any = await r.json().catch(() => ({}))
    if (!r.ok) throw new StripeError(data.error?.message ?? `Stripe answered ${r.status}`, r.status, data.error?.code ?? data.error?.decline_code)
    return data
  }

  async charge(a: { amount: number; currency: string; paymentMethod: string; idempotencyKey: string }): Promise<ChargeResult> {
    try {
      const pi = await this.call('POST', '/v1/payment_intents', {
        amount: a.amount, currency: a.currency.toLowerCase(), payment_method: a.paymentMethod, payment_method_types: ['card'],
        confirm: true, use_stripe_sdk: true, metadata: { nashr_op: a.idempotencyKey },
      }, a.idempotencyKey)
      return piResult(pi)
    } catch (e) {
      // A declined card comes back as a 402 with the PaymentIntent attached: that is a failed charge, not an outage.
      if (e instanceof StripeError && e.status === 402) return { id: '', status: 'failed', failure: e.message }
      throw e
    }
  }

  async refund(a: { chargeId: string; amount: number; idempotencyKey: string }) {
    const r = await this.call('POST', '/v1/refunds', { payment_intent: a.chargeId, amount: a.amount }, a.idempotencyKey)
    return { id: r.id as string }
  }

  async transfer(a: { amount: number; currency: string; destination: string; idempotencyKey: string }) {
    if (!a.destination?.startsWith('acct_')) throw new StripeError('The publisher has not set up a payout account.', 400)
    const t = await this.call('POST', '/v1/transfers', { amount: a.amount, currency: a.currency.toLowerCase(), destination: a.destination }, a.idempotencyKey)
    return { id: t.id as string }
  }

  async balance(currency: string) {
    const b = await this.call('GET', '/v1/balance')
    const cur = currency.toLowerCase(), sum = (xs: any[]) => xs.filter(x => x.currency === cur).reduce((n, x) => n + x.amount, 0)
    return sum(b.available ?? []) + sum(b.pending ?? [])
  }

  /** Stripe's processing fee on a successful charge, so the ledger matches the (net) Stripe balance. */
  async chargeFee(chargeId: string) {
    const pi = await this.call('GET', `/v1/payment_intents/${chargeId}`, { expand: ['latest_charge.balance_transaction'] })
    return Number(pi.latest_charge?.balance_transaction?.fee ?? 0)
  }

  /** Publishers get a Stripe Express account; Stripe collects and verifies their bank details, Nashr never sees them. */
  payoutAccount = {
    create: async (a: { companyId: string; name: string; email?: string; country?: string }) => {
      const acct = await this.call('POST', '/v1/accounts', {
        type: 'express', country: a.country ?? 'AE', email: a.email, business_profile: { name: a.name },
        capabilities: { transfers: { requested: true } }, metadata: { nashr_company: a.companyId },
      }, `account:${a.companyId}`)
      return acct.id as string
    },
    link: async (account: string, returnUrl: string, refreshUrl: string) =>
      (await this.call('POST', '/v1/account_links', { account, type: 'account_onboarding', return_url: returnUrl, refresh_url: refreshUrl })).url as string,
    ready: async (account: string) => {
      const a = await this.call('GET', `/v1/accounts/${account}`)
      return !!(a.details_submitted && a.payouts_enabled)
    },
  }
}

export function piResult(pi: any): ChargeResult {
  if (pi.status === 'succeeded') return { id: pi.id, status: 'succeeded' }
  // 3-D Secure: the buyer's browser finishes it with the client secret; the webhook then reports the outcome.
  if (pi.status === 'requires_action' || pi.status === 'processing') return { id: pi.id, status: 'requires_action', clientSecret: pi.client_secret }
  return { id: pi.id, status: 'failed', failure: pi.last_payment_error?.message ?? 'The payment did not go through.' }
}

/**
 * Check a webhook's Stripe-Signature header (HMAC-SHA256 of "timestamp.body" with the endpoint secret) and its age,
 * so nobody can forge "payment succeeded". Returns the parsed event, or null if it is not genuine.
 */
export function verifyWebhook(body: string, header: string | undefined, secret: string, now = Date.now(), toleranceSeconds = 300) {
  if (!header) return null
  const parts = Object.fromEntries(header.split(',').map(p => p.split('=') as [string, string]).filter(([k]) => k === 't'))
  const t = Number(parts.t)
  const v1 = header.split(',').filter(p => p.startsWith('v1=')).map(p => p.slice(3))
  if (!t || !v1.length || Math.abs(now / 1000 - t) > toleranceSeconds) return null
  const expected = Buffer.from(createHmac('sha256', secret).update(`${t}.${body}`).digest('hex'))
  if (!v1.some(s => s.length === expected.length && timingSafeEqual(Buffer.from(s), expected))) return null
  try { return JSON.parse(body) } catch { return null }
}

/** Stripe's event types mapped onto the provider-neutral events handleProviderEvent understands. */
export function toProviderEvent(ev: any): { id: string; type: string; data: any } | null {
  const o = ev.data?.object ?? {}
  switch (ev.type) {
    case 'payment_intent.succeeded': return { id: ev.id, type: 'charge.succeeded', data: { id: o.id, amount: o.amount_received ?? o.amount, currency: o.currency } }
    case 'payment_intent.payment_failed': return { id: ev.id, type: 'charge.failed', data: { id: o.id, failure: o.last_payment_error?.message ?? 'The payment did not go through.' } }
    case 'charge.dispute.created': return { id: ev.id, type: 'charge.dispute.created', data: { id: o.payment_intent, reason: o.reason, amount: o.amount } }
    case 'account.updated': return { id: ev.id, type: 'account.updated', data: { account: o.id, ready: !!(o.details_submitted && o.payouts_enabled) } }
    default: return null
  }
}
