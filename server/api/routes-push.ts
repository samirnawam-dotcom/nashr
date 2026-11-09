import type { RouteFn } from './app.js'
import { audit } from '../core/audit.js'
import { pushTo, vapidKeys } from '../core/push.js'
import { MarketError } from '../marketplace/market.js'

/* Phone and browser alerts: the app asks for the public key, subscribes the device, and can test or remove it. */
const ANY: ['buyer', 'seller', 'admin', 'founder'] = ['buyer', 'seller', 'admin', 'founder']

export function pushRoutes(route: RouteFn) {
  route('GET', '/api/push/key', ANY, async ({ db, me }) => ({
    publicKey: (await vapidKeys(db)).publicKey,
    devices: (await db.query(`select count(*)::int n from push_subscriptions where user_id = $1`, [me.userId])).rows[0].n }))

  route('POST', '/api/push/subscribe', ANY, async ({ db, at, me }, req) => {
    if (me.signedInAs || me.viewAs) throw new MarketError('Alerts are turned on by the person on their own device.')
    const b = req.body
    if (!/^https:\/\//.test(b.endpoint)) throw new MarketError('This browser cannot receive alerts.')
    await db.query(`insert into push_subscriptions (user_id, endpoint, p256dh, auth, device, created_at) values ($1, $2, $3, $4, $5, $6)
      on conflict (endpoint) do update set user_id = $1, p256dh = $3, auth = $4, device = $5`, [me.userId, b.endpoint, b.keys.p256dh, b.keys.auth, b.device ?? null, at])
    await audit(db, `user:${me.userId}`, 'push.on', 'user', me.userId, { device: b.device ?? null }, at)
    return { ok: true }
  }, { type: 'object', required: ['endpoint', 'keys'], additionalProperties: false, properties: {
    endpoint: { type: 'string', maxLength: 1000 }, device: { type: 'string', maxLength: 120 },
    keys: { type: 'object', required: ['p256dh', 'auth'], additionalProperties: false, properties: { p256dh: { type: 'string', maxLength: 200 }, auth: { type: 'string', maxLength: 100 } } } } })

  route('POST', '/api/push/unsubscribe', ANY, async ({ db, at, me }, req) => {
    await db.query(`delete from push_subscriptions where user_id = $1 and ($2::text is null or endpoint = $2)`, [me.userId, req.body.endpoint ?? null])
    await audit(db, `user:${me.userId}`, 'push.off', 'user', me.userId, null, at)
    return { ok: true }
  }, { type: 'object', additionalProperties: false, properties: { endpoint: { type: 'string', maxLength: 1000 } } })

  // A test alert to each of this person's devices, so they can see it works.
  route('POST', '/api/push/test', ANY, async ({ db, me }) => {
    const subs = (await db.query(`select id, endpoint, p256dh, auth from push_subscriptions where user_id = $1`, [me.userId])).rows
    if (!subs.length) throw new MarketError('Turn on alerts on this device first.')
    const site = (process.env.SITE_URL ?? '').replace(/\/$/, '')
    const results = await Promise.all(subs.map(s => pushTo(s, { title: 'Nashr', body: 'Alerts work on this device.', url: site + '/account', tag: 'test' }, { urgent: true }).catch(() => 0)))
    return { sent: results.filter(r => r >= 200 && r < 300).length, devices: subs.length }
  })
}
