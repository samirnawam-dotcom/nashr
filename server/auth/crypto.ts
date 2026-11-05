import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

export const randomToken = () => randomBytes(32).toString('base64url')
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

export function hashPassword(password: string) {
  const salt = randomBytes(16)
  return `scrypt$${salt.toString('base64')}$${scryptSync(password, salt, 64).toString('base64')}`
}

export function verifyPassword(password: string, stored: string | null) {
  if (!stored) return false
  const [, salt, hash] = stored.split('$')
  const expected = Buffer.from(hash, 'base64')
  return timingSafeEqual(scryptSync(password, Buffer.from(salt, 'base64'), 64), expected)
}

// TOTP (RFC 6238, 30-second steps, 6 digits), compatible with Google Authenticator and similar apps.
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
export const newTotpSecret = () => [...randomBytes(20)].map(b => B32[b & 31]).join('')
function base32(s: string) {
  let bits = ''
  for (const c of s) bits += B32.indexOf(c).toString(2).padStart(5, '0')
  return Buffer.from(bits.match(/.{8}/g)!.map(b => parseInt(b, 2)))
}
export function totp(secret: string, at: Date, step = 0) {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(at.getTime() / 30_000) + step))
  const h = createHmac('sha1', base32(secret)).update(counter).digest()
  const o = h[h.length - 1] & 15
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0')
}
/** Accepts the current code and one step either side for clock drift. */
export const checkTotp = (secret: string, code: string, at: Date) => totpStep(secret, code, at) !== null
/** The time step a code belongs to (±1 step of clock drift), or null; login refuses a step already used. */
export function totpStep(secret: string, code: string, at: Date) {
  const base = Math.floor(at.getTime() / 30_000)
  for (const s of [-1, 0, 1]) if (totp(secret, at, s) === code) return base + s
  return null
}
