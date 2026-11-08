const { createHmac } = require('node:crypto')
// Two-step sign-in for the journeys: codes as an authenticator app makes them (RFC 6238, as server/auth/crypto.ts), and two
// ways to turn it on: through the account page, as a person does, or through the API for journeys that pay by API.
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
function totp(secret, at = Date.now()) {
  let bits = ''; for (const ch of secret) bits += B32.indexOf(ch).toString(2).padStart(5, '0')
  const key = Buffer.from(bits.match(/.{8}/g).map(b => parseInt(b, 2)))
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)))
  const h = createHmac('sha1', key).update(counter).digest(), o = h[h.length - 1] & 15
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0')
}
async function twoStepViaPage(p, base) {
  await p.goto(base + '/account'); await p.click('button:has-text("Turn on two-step sign-in")')
  const key = (await p.textContent('.two-step .key code')).replace(/\s/g, '')
  await p.fill('#tcode', totp(key)); await p.click('button:has-text("Confirm and turn on")')
  await p.waitForSelector('.two-step .pill-state')
  return key
}
async function twoStepViaApi(request, base) {
  const { secret } = await (await request.post(base + '/api/me/two-step/start', { data: {} })).json()
  const r = await request.post(base + '/api/me/two-step/confirm', { data: { code: totp(secret) } })
  if (!r.ok()) throw new Error('two-step confirm failed: ' + await r.text())
  return secret
}
module.exports = { totp, twoStepViaPage, twoStepViaApi }
