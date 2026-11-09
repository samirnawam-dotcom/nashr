import { createECDH, createHmac, createCipheriv, createPrivateKey, createSign, randomBytes } from 'node:crypto'
import { type Db, pool } from './db.js'
import { noticeMessage, wantsNotice } from './mail.js'

/*
 * Web push, without a library: the standard browsers use (RFC 8030), with the sender identified by a VAPID key (RFC 8292)
 * and each message encrypted for the one device that will read it (RFC 8291, aes128gcm). Nashr's VAPID key pair is made
 * once and kept in the database (or given as VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY in the environment).
 */
const b64u = (b: Buffer) => b.toString('base64url')
const unb64u = (s: string) => Buffer.from(s, 'base64url')

export type Vapid = { publicKey: string; privateKey: string } // base64url: 65-byte uncompressed point, 32-byte scalar
let cached: Vapid | null = null
export async function vapidKeys(db: Db = pool): Promise<Vapid> {
  if (cached) return cached
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) return (cached = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY })
  const row = (await db.query(`select value from server_keys where name = 'vapid'`)).rows[0]
  if (row) return (cached = row.value)
  const ecdh = createECDH('prime256v1'); ecdh.generateKeys()
  const made = { publicKey: b64u(ecdh.getPublicKey()), privateKey: b64u(ecdh.getPrivateKey()) }
  await db.query(`insert into server_keys (name, value) values ('vapid', $1) on conflict (name) do nothing`, [JSON.stringify(made)])
  return (cached = (await db.query(`select value from server_keys where name = 'vapid'`)).rows[0].value)
}

/** The VAPID header: a short-lived ES256 token for the push service's origin, signed with Nashr's private key. */
export function vapidAuth(endpoint: string, keys: Vapid, subject: string, now = Date.now()) {
  const pub = unb64u(keys.publicKey)
  const key = createPrivateKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', d: keys.privateKey, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) } })
  const header = b64u(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = b64u(Buffer.from(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })))
  const signature = createSign('SHA256').update(`${header}.${claims}`).sign({ key, dsaEncoding: 'ieee-p1363' })
  return `vapid t=${header}.${claims}.${b64u(signature)}, k=${keys.publicKey}`
}

const hmac = (key: Buffer, data: Buffer) => createHmac('sha256', key).update(data).digest()

/** Encrypt one message for one device (RFC 8291): the device's public key and auth secret, a fresh key pair and salt each time. */
export function encrypt(payload: Buffer, sub: { p256dh: string; auth: string }, salt = randomBytes(16)) {
  const sender = createECDH('prime256v1'); sender.generateKeys()
  const uaPublic = unb64u(sub.p256dh), authSecret = unb64u(sub.auth), asPublic = sender.getPublicKey()
  const shared = sender.computeSecret(uaPublic)
  const ikm = hmac(hmac(authSecret, shared), Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic, Buffer.from([1])]))
  const prk = hmac(salt, ikm)
  const cek = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: aes128gcm\0'), Buffer.from([1])])).subarray(0, 16)
  const nonce = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: nonce\0'), Buffer.from([1])])).subarray(0, 12)
  const cipher = createCipheriv('aes-128-gcm', cek, nonce)
  const body = Buffer.concat([cipher.update(Buffer.concat([payload, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]) // 2: the last (only) record
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096)
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body])
}

export type Sub = { id: string; endpoint: string; p256dh: string; auth: string }
type Post = (url: string, init: { method: string; headers: Record<string, string>; body: Buffer }) => Promise<{ status: number }>

/** Send one message to one device. A device that has gone (404/410) is forgotten. */
export async function pushTo(sub: Sub, message: { title: string; body: string; url: string; tag?: string }, opts: { urgent?: boolean; post?: Post } = {}) {
  const keys = await vapidKeys()
  const subject = (process.env.SITE_URL ?? 'https://nashr.ae').replace(/\/$/, '')
  const res = await (opts.post ?? (fetch as unknown as Post))(sub.endpoint, { method: 'POST', body: encrypt(Buffer.from(JSON.stringify(message)), sub),
    headers: { authorization: vapidAuth(sub.endpoint, keys, subject), 'content-encoding': 'aes128gcm', 'content-type': 'application/octet-stream', ttl: '86400', urgency: opts.urgent ? 'high' : 'normal' } })
  if (res.status === 404 || res.status === 410) await pool.query(`delete from push_subscriptions where id = $1`, [sub.id])
  else if (res.status < 300) await pool.query(`update push_subscriptions set last_used_at = now() where id = $1`, [sub.id])
  return res.status
}

// Notices that ask someone to act soon reach the phone at once (the push service may otherwise wait for a good moment).
const URGENT = /^(deal\.(opened|awaiting_payment)|bid\.(outbid|won)|issue\.|dispute\.|interest\.received|chargeback\.|deadline\.)/

/** A notification for a company, on the phones and browsers of each person there who turned alerts on (after it is saved). */
export async function pushNotice(companyId: string, kind: string, dealId: string | null, data: any, post?: Post) {
  const subs = (await pool.query(`select s.id, s.endpoint, s.p256dh, s.auth, u.role, u.lang, u.email_prefs from push_subscriptions s join users u on u.id = s.user_id
    where u.company_id = $1 and u.status = 'active'`, [companyId])).rows
  for (const s of subs) {
    if (!wantsNotice(kind, s.email_prefs)) continue
    const m = noticeMessage(s.lang === 'ar' ? 'ar' : 'en', s.role, kind, dealId, data)
    await pushTo(s, { title: 'Nashr', body: m.said, url: m.url, tag: dealId ?? kind }, { urgent: URGENT.test(kind), post }).catch(() => 0) // one device failing never stops the rest
  }
}

