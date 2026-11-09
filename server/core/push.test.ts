import { beforeEach, expect, test } from 'vitest'
import { createDecipheriv, createECDH, createHmac, createPublicKey, createVerify, randomBytes } from 'node:crypto'
import { pool } from './db.js'
import { encrypt, pushNotice, vapidAuth, vapidKeys } from './push.js'
import { company, reset } from '../test/helpers.js'

const b64u = (b: Buffer) => b.toString('base64url')
const hmac = (k: Buffer, d: Buffer) => createHmac('sha256', k).update(d).digest()

/** A device: its key pair and auth secret, and how it decrypts what it receives (RFC 8291), written independently of push.ts. */
function device() {
  const ecdh = createECDH('prime256v1'); ecdh.generateKeys(); const auth = randomBytes(16)
  return { sub: { p256dh: b64u(ecdh.getPublicKey()), auth: b64u(auth) }, read(body: Buffer) {
    const salt = body.subarray(0, 16), idlen = body[20], asPublic = body.subarray(21, 21 + idlen), ct = body.subarray(21 + idlen)
    const ikm = hmac(hmac(auth, ecdh.computeSecret(asPublic)), Buffer.concat([Buffer.from('WebPush: info\0'), ecdh.getPublicKey(), asPublic, Buffer.from([1])]))
    const prk = hmac(salt, ikm)
    const d = createDecipheriv('aes-128-gcm', hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16), hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12))
    d.setAuthTag(ct.subarray(ct.length - 16))
    const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()])
    return plain.subarray(0, plain.lastIndexOf(2)).toString()
  } }
}

beforeEach(async () => { await reset(); await pool.query(`delete from push_subscriptions`) })

test('a message can only be read by the device it was encrypted for', () => {
  const phone = device(), other = device()
  const body = encrypt(Buffer.from('{"title":"Nashr","body":"Outbid"}'), phone.sub)
  expect(phone.read(body)).toBe('{"title":"Nashr","body":"Outbid"}')
  expect(() => other.read(body)).toThrow()
})

test('the VAPID token is signed with Nashr\'s key, for the push service\'s origin', async () => {
  const keys = await vapidKeys(), auth = vapidAuth('https://fcm.googleapis.com/fcm/send/abc', keys, 'https://nashr.ae')
  const [, token, k] = auth.match(/^vapid t=([^,]+), k=(.+)$/)!
  expect(k).toBe(keys.publicKey)
  const [h, c, sig] = token.split('.')
  expect(JSON.parse(Buffer.from(c, 'base64url').toString())).toMatchObject({ aud: 'https://fcm.googleapis.com', sub: 'https://nashr.ae' })
  const pub = Buffer.from(keys.publicKey, 'base64url')
  const key = createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) } })
  expect(createVerify('SHA256').update(`${h}.${c}`).verify({ key, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url'))).toBe(true)
})

test('a notice reaches each device of each person who wants it, in their language; a device that has gone is forgotten', async () => {
  const c = await company('Northwind Fintech', 'buyer'), phone = device(), laptop = device()
  const [sara, omar] = (await pool.query(`insert into users (company_id, email, name, role, status, created_at, lang, email_prefs) values
    ($1, 'sara@northwind.ae', 'Sara', 'buyer', 'active', now(), 'ar', '{}'), ($1, 'omar@northwind.ae', 'Omar', 'buyer', 'active', now(), 'en', '{"bids": false}') returning id`, [c])).rows.map(r => r.id)
  await pool.query(`insert into push_subscriptions (user_id, endpoint, p256dh, auth, created_at) values ($1, 'https://push.example/1', $2, $3, now()), ($4, 'https://push.example/2', $5, $6, now())`,
    [sara, phone.sub.p256dh, phone.sub.auth, omar, laptop.sub.p256dh, laptop.sub.auth])
  const sent: { url: string; body: Buffer; urgency: string }[] = []
  await pushNotice(c, 'bid.outbid', null, { outlet: 'Skyline FM', label: 'Break 1', top: 400000 }, async (url, init) => { sent.push({ url, body: init.body, urgency: init.headers.urgency }); return { status: 201 } })
  expect(sent.map(s => s.url)).toEqual(['https://push.example/1'])                 // Omar turned bid alerts off
  const msg = JSON.parse(phone.read(sent[0].body))
  expect(msg.body).toMatch(/[؀-ۿ]/)                                         // Sara uses Nashr in Arabic
  expect(sent[0].urgency).toBe('high')
  await pushNotice(c, 'deal.secured', null, null, async () => ({ status: 410 }))
  expect((await pool.query(`select count(*)::int n from push_subscriptions`)).rows[0].n).toBe(0)
})
