import type { FastifyInstance } from 'fastify'
import type { PaymentProvider } from '../payments/provider.js'
import { handleProviderEvent } from '../payments/payments.js'
import { toProviderEvent, verifyWebhook } from '../payments/stripe.js'

export type StripeConfig = { publishableKey?: string; webhookSecret?: string }

/**
 * Stripe's webhook: the raw body is needed to check the signature, so this route has its own JSON parser (kept as text).
 * Only genuine, recent events are acted on; each event id is recorded once, so Stripe's retries never count twice.
 */
export function stripeWebhook(app: FastifyInstance, deps: { provider: PaymentProvider; stripe?: StripeConfig; clock: () => Date }) {
  app.register(async scope => {
    scope.addContentTypeParser('application/json', { parseAs: 'string', bodyLimit: 1024 * 1024 }, (_req, body, done) => done(null, body))
    scope.post('/api/stripe/webhook', async (req, reply) => {
      const secret = deps.stripe?.webhookSecret
      if (!secret) return reply.code(404).send({ error: 'Not found.' })
      const ev = verifyWebhook(String(req.body ?? ''), req.headers['stripe-signature'] as string | undefined, secret, deps.clock().getTime())
      if (!ev) return reply.code(400).send({ error: 'Signature check failed.' })
      const mapped = toProviderEvent(ev)
      if (!mapped) return { received: true, handled: 'ignored' }
      return { received: true, handled: await handleProviderEvent(mapped, deps.clock(), deps.provider) }
    })
  })
}
