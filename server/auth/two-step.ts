import { type Db, one } from '../core/db.js'
import { audit } from '../core/audit.js'
import { notify } from '../core/notify.js'
import { setting } from '../core/settings.js'
import { MarketError } from '../marketplace/market.js'
import { newTotpSecret, totpStep, verifyPassword } from './crypto.js'
import { endSignInAs } from './access.js'

/*
 * Two-step sign-in for buyers and publishers (staff always have it). A person turns it on from their account page with
 * any authenticator app: we hand out a key, they confirm with a code, and from then on signing in asks for a code.
 * With `two_step_for_money` on, paying for a booking and connecting a payout account need it.
 */
const ISSUER = 'Nashr'

export async function startTwoStep(db: Db, userId: string, at: Date) {
  const u = await one(db, `select email, totp_enabled from users where id = $1 for update`, [userId])
  if (u.totp_enabled) throw new MarketError('Two-step sign-in is already on.')
  const secret = newTotpSecret()
  await db.query(`update users set totp_secret = $2 where id = $1`, [userId, secret]) // not active until a code confirms it
  await audit(db, `user:${userId}`, 'two_step.started', 'user', userId, null, at)
  const label = encodeURIComponent(`${ISSUER}:${u.email}`)
  return { secret, uri: `otpauth://totp/${label}?secret=${secret}&issuer=${ISSUER}&algorithm=SHA1&digits=6&period=30` }
}

export async function confirmTwoStep(db: Db, userId: string, code: string, at: Date) {
  const u = await one(db, `select totp_secret, totp_enabled from users where id = $1 for update`, [userId])
  if (u.totp_enabled) throw new MarketError('Two-step sign-in is already on.')
  const step = u.totp_secret ? totpStep(u.totp_secret, String(code ?? '').trim(), at) : null
  if (step === null) throw new MarketError('The code from your authenticator app is not right.')
  await db.query(`update users set totp_enabled = true, totp_last_step = $2 where id = $1`, [userId, step])
  await audit(db, `user:${userId}`, 'two_step.on', 'user', userId, null, at)
}

/** Turning it off needs both the password and a current code, so a stolen session alone cannot remove it. */
export async function stopTwoStep(db: Db, userId: string, a: { password: string; code: string }, at: Date) {
  const u = await one(db, `select password_hash, totp_secret, totp_enabled, totp_last_step from users where id = $1 for update`, [userId])
  if (!u.totp_enabled) throw new MarketError('Two-step sign-in is already off.')
  if (!verifyPassword(a.password ?? '', u.password_hash)) throw new MarketError('Your current password is not right.')
  const step = totpStep(u.totp_secret, String(a.code ?? '').trim(), at)
  if (step === null || (u.totp_last_step != null && step <= Number(u.totp_last_step))) throw new MarketError('The code from your authenticator app is not right.')
  await db.query(`update users set totp_enabled = false, totp_secret = null, totp_last_step = null where id = $1`, [userId])
  await audit(db, `user:${userId}`, 'two_step.off', 'user', userId, null, at)
}

/** Lost phone: Nashr turns it off for a buyer or publisher user, with a reason; they are signed out and their company is told. */
export async function resetTwoStep(db: Db, userId: string, reason: string, actor: string, at: Date) {
  if ((reason ?? '').trim().length < 5) throw new MarketError('Write why two-step sign-in is being turned off.')
  const u = (await db.query(`select id, name, company_id from users where id = $1 and role in ('buyer', 'seller') and totp_enabled for update`, [userId])).rows[0]
  if (!u) throw new MarketError('Two-step sign-in is not on for this user.')
  await db.query(`update users set totp_enabled = false, totp_secret = null, totp_last_step = null where id = $1`, [userId])
  await db.query(`delete from sessions where user_id = $1`, [userId])
  await endSignInAs(db, userId)
  await audit(db, actor, 'two_step.reset', 'user', userId, { reason: reason.trim() }, at)
  await notify(db, u.company_id, 'access.two_step_reset', null, { user: u.name, reason: reason.trim() }, at)
}

/** The money gate: paying and connecting payouts need two-step sign-in when the founder's setting asks for it. */
export async function requireTwoStepForMoney(db: Db, userId: string, what: 'pay' | 'payouts', at: Date) {
  if (!(await setting<boolean>(db, 'two_step_for_money', at))) return
  const { totp_enabled } = await one(db, `select totp_enabled from users where id = $1`, [userId])
  if (!totp_enabled) throw new MarketError(what === 'pay'
    ? 'Turn on two-step sign-in under Your account before paying.'
    : 'Turn on two-step sign-in under Your account before connecting your payout account.')
}
