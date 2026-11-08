// The payment provider behind one small interface (SPEC G3). Stripe is one implementation (B5);
// FakeProvider behaves like Stripe's test cards so the money flow can be built and tested now.

export type ChargeResult = { id: string; status: 'succeeded' | 'requires_action' | 'failed'; failure?: string; clientSecret?: string }

export interface PaymentProvider {
  charge(a: { amount: number; currency: string; paymentMethod: string; idempotencyKey: string }): Promise<ChargeResult>
  refund(a: { chargeId: string; amount: number; idempotencyKey: string }): Promise<{ id: string }>
  transfer(a: { amount: number; currency: string; destination: string; idempotencyKey: string }): Promise<{ id: string }>
  balance(currency: string): Promise<number>
  /** The provider's processing fee on a succeeded charge (Stripe nets it out of the balance). */
  chargeFee?(chargeId: string): Promise<number>
  /** Publisher payout accounts, onboarded on the provider's own pages. */
  payoutAccount?: {
    create(a: { companyId: string; name: string; email?: string }): Promise<string>
    link(account: string, returnUrl: string, refreshUrl: string): Promise<string>
    ready(account: string): Promise<boolean>
  }
}

/** Test cards from the brief (section 11): 4242 succeeds, 0002 is declined, 3155 asks for bank authentication. */
export class FakeProvider implements PaymentProvider {
  private bal = new Map<string, number>()
  private seen = new Map<string, any>() // idempotency key → result, like Stripe
  private n = 0
  readonly charges = new Map<string, { amount: number; currency: string; status: string }>()
  // Ids are unique per instance: the demo seed and the server each run their own fake provider on one database.
  private tag = Math.random().toString(36).slice(2, 8)

  private once<T>(key: string, fn: () => T): T {
    if (!this.seen.has(key)) this.seen.set(key, fn())
    return this.seen.get(key)
  }
  /** Tests share one provider across a fresh database per test. */
  reset() { this.bal.clear(); this.seen.clear(); this.charges.clear() }
  private add(currency: string, delta: number) { this.bal.set(currency, (this.bal.get(currency) ?? 0) + delta) }

  async charge(a: { amount: number; currency: string; paymentMethod: string; idempotencyKey: string }) {
    return this.once(a.idempotencyKey, (): ChargeResult => {
      const id = `ch_${this.tag}_${++this.n}`
      if (a.paymentMethod.endsWith('0002')) return { id, status: 'failed', failure: 'Your card was declined.' }
      const status = a.paymentMethod.endsWith('3155') ? 'requires_action' : 'succeeded'
      this.charges.set(id, { amount: a.amount, currency: a.currency, status })
      if (status === 'succeeded') this.add(a.currency, a.amount)
      return { id, status }
    })
  }

  /** Simulates the buyer completing 3-D Secure; Stripe would then send charge.succeeded. */
  authenticate(chargeId: string) {
    const c = this.charges.get(chargeId)!
    c.status = 'succeeded'
    this.add(c.currency, c.amount)
  }

  async refund(a: { chargeId: string; amount: number; idempotencyKey: string }) {
    // Charges made by another process (the demo seed) are not in memory: they are in AED.
    return this.once(a.idempotencyKey, () => { this.add(this.charges.get(a.chargeId)?.currency ?? 'AED', -a.amount); return { id: `re_${this.tag}_${++this.n}` } })
  }

  /** Demo servers: start from the ledger's cash, since the fake balance lives in memory and the seed ran in another process. */
  prime(currency: string, amount: number) { this.bal.set(currency, amount) }
  /** Tests: the buyer's bank takes a disputed payment (and its fee) back, or returns it when Nashr wins. */
  chargeback(currency: string, amount: number) { this.add(currency, -amount) }

  async transfer(a: { amount: number; currency: string; destination: string; idempotencyKey: string }) {
    return this.once(a.idempotencyKey, () => { this.add(a.currency, -a.amount); return { id: `tr_${this.tag}_${++this.n}` } })
  }

  async balance(currency: string) { return this.bal.get(currency) ?? 0 }
}
