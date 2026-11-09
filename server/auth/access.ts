import { type Db, one } from '../core/db.js'
import { audit } from '../core/audit.js'
import { notify } from '../core/notify.js'
import { setting } from '../core/settings.js'
import { smtpConfig } from '../core/smtp.js'
import { queueResetEmail } from '../core/mail.js'
import { MarketError } from '../marketplace/market.js'
import { checkTotp, totpStep, hashPassword, newTotpSecret, randomToken, sha256, verifyPassword } from './crypto.js'

// Business emails only (brief section 2).
const FREE_EMAIL = new Set(['gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'yahoo.com', 'ymail.com',
  'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com', 'gmx.com', 'mail.com', 'zoho.com', 'yandex.com'])
const domain = (email: string) => email.split('@')[1]?.toLowerCase() ?? ''
const STAFF = ['admin', 'founder']
const INVITE_DAYS = 7, SESSION_HOURS = 12

export type AccessRequest = { name: string; email: string; phone: string; role: string; company: string; companyType: 'brand' | 'agency' | 'media_outlet' }

export async function requestAccess(db: Db, r: AccessRequest, at: Date) {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email)) throw new MarketError('Enter a valid work email.')
  if (FREE_EMAIL.has(domain(r.email))) throw new MarketError('Please use your business email. Free email addresses are not accepted.')
  const row = await one(db, `insert into access_requests (name, email, phone, role, company, company_type, created_at)
                             values ($1, $2, $3, $4, $5, $6, $7) returning id`, [r.name, r.email.toLowerCase(), r.phone, r.role, r.company, r.companyType, at])
  for (const admin of (await db.query(`select distinct company_id from users where role in ('admin', 'founder')`)).rows)
    await notify(db, admin.company_id, 'access.requested', null, { company: r.company }, at)
  return row.id as string
}

export async function issueInvite(db: Db, userId: string, at: Date) {
  const token = randomToken()
  await db.query(`insert into invites (token_hash, user_id, expires_at) values ($1, $2, $3)`, [sha256(token), userId, new Date(at.getTime() + INVITE_DAYS * 86_400_000)])
  return token // goes in the invite email link; never stored in clear
}

/** Approving creates the company and an invited user, and returns the invite token for the email. */
export async function approveAccess(db: Db, requestId: string, actor: string, at: Date) {
  const r = await one(db, `select * from access_requests where id = $1 for update`, [requestId])
  if (!['pending', 'info'].includes(r.status)) throw new MarketError('This request has already been decided.')
  const type = r.company_type === 'media_outlet' ? 'publisher' : 'buyer'
  const company = await one(db, `insert into companies (name, type) values ($1, $2) returning id`, [r.company, type])
  // the person who asked to join is the company's first team manager
  const user = await one(db, `insert into users (company_id, email, name, phone, role, created_at, can_manage) values ($1, $2, $3, $4, $5, $6, true) returning id`,
    [company.id, r.email, r.name, r.phone, type === 'publisher' ? 'seller' : 'buyer', at])
  await db.query(`update access_requests set status = 'approved', decided_at = $2, decided_by = $3 where id = $1`, [r.id, at, actor])
  await audit(db, actor, 'access.approved', 'access_request', r.id, { company: r.company }, at)
  return { companyId: company.id as string, userId: user.id as string, inviteToken: await issueInvite(db, user.id, at) }
}

/** The applicant lost the link or it expired: a fresh one replaces any unused link (only while they have not signed up yet). */
export async function reissueAccessInvite(db: Db, requestId: string, actor: string, at: Date) {
  const r = await one(db, `select * from access_requests where id = $1`, [requestId])
  const user = (await db.query(`select id from users where lower(email) = lower($1) and status = 'invited' and role in ('buyer', 'seller')`, [r.email])).rows[0]
  if (r.status !== 'approved' || !user) throw new MarketError('This person has already set their password, or the request was not approved.')
  await db.query(`update invites set used_at = $2 where user_id = $1 and used_at is null`, [user.id, at])
  await audit(db, actor, 'access.invite_reissued', 'access_request', r.id, null, at)
  return issueInvite(db, user.id, at)
}

export async function decideAccess(db: Db, requestId: string, decision: 'rejected' | 'info', reason: string, actor: string, at: Date) {
  if (!reason?.trim()) throw new MarketError(decision === 'rejected' ? 'A reason is required to reject.' : 'Say what information you need.')
  const r = await db.query(`update access_requests set status = $2, reason = $3, decided_at = $4, decided_by = $5
                            where id = $1 and status in ('pending', 'info') returning id`, [requestId, decision, reason, at, actor])
  if (!r.rowCount) throw new MarketError('This request has already been decided.')
  await audit(db, actor, `access.${decision}`, 'access_request', requestId, { reason }, at)
}

/** Staff accounts (admin, founder) invite an existing Nashr user record directly. */
export async function inviteStaff(db: Db, a: { email: string; name: string; role: 'admin' | 'founder' }, actor: string, at: Date) {
  let nashr = (await db.query(`select id from companies where type = 'nashr' limit 1`)).rows[0]
  nashr ??= await one(db, `insert into companies (name, type) values ('Nashr', 'nashr') returning id`)
  const user = await one(db, `insert into users (company_id, email, name, role, created_at) values ($1, $2, $3, $4, $5) returning id`,
    [nashr.id, a.email.toLowerCase(), a.name, a.role, at])
  await audit(db, actor, 'staff.invited', 'user', user.id, { role: a.role }, at)
  return { userId: user.id as string, inviteToken: await issueInvite(db, user.id, at) }
}

/**
 * Accept an invite and set a password. Admin and founder accounts must also set up two-factor login before they are active:
 * the first call returns a secret for their authenticator app, the second (with a code) activates the account.
 */
export async function acceptInvite(db: Db, a: { token: string; password: string; totpCode?: string; acceptTerms?: boolean }, at: Date) {
  const inv = (await db.query(`select i.*, u.role, u.totp_secret from invites i join users u on u.id = i.user_id where token_hash = $1 for update of i`, [sha256(a.token)])).rows[0]
  if (!inv || inv.used_at || inv.expires_at <= at) throw new MarketError('This invite link has expired. Ask Nashr for a new one.')
  if ((a.password ?? '').length < 12) throw new MarketError('Use a password of at least 12 characters.')
  if (!a.acceptTerms) throw new MarketError('Accept the terms of use to join.')
  if (STAFF.includes(inv.role) && staffTwoStep()) {
    if (!inv.totp_secret) {
      const secret = newTotpSecret()
      await db.query(`update users set totp_secret = $2 where id = $1`, [inv.user_id, secret])
      return { needsTotp: true as const, totpSecret: secret }
    }
    if (!a.totpCode || !checkTotp(inv.totp_secret, a.totpCode, at)) throw new MarketError('The code from your authenticator app is not right.')
  }
  await db.query(`update users set password_hash = $2, status = 'active', totp_enabled = $3 where id = $1`, [inv.user_id, hashPassword(a.password), STAFF.includes(inv.role) && staffTwoStep()])
  await db.query(`update invites set used_at = $2 where token_hash = $1`, [inv.token_hash, at])
  await audit(db, `user:${inv.user_id}`, 'invite.accepted', 'user', inv.user_id, null, at)
  await acceptTerms(db, inv.user_id, at)
  return { needsTotp: false as const }
}

/** The terms in force now, and whether this person has accepted them. A new version must be accepted to carry on. */
export const termsVersion = (db: Db, at: Date) => setting<string>(db, 'terms_version', at)
export async function acceptTerms(db: Db, userId: string, at: Date, version?: string) {
  const current = await termsVersion(db, at)
  if (version && version !== current) throw new MarketError('The terms changed while you were reading. Read the latest version and accept again.')
  await db.query(`update users set terms_version = $2, terms_accepted_at = $3 where id = $1`, [userId, current, at])
  await audit(db, `user:${userId}`, 'terms.accepted', 'user', userId, { version: current }, at)
}

/**
 * Staff two-step login (authenticator code) is on unless STAFF_TWO_STEP=off. Turning it off is for testing only: staff
 * then sign in with email and password. Turn it back on (remove the setting) before real money moves.
 */
export const staffTwoStep = () => process.env.STAFF_TWO_STEP !== 'off'

const DUMMY_HASH = hashPassword('not a real password, only spends the same time')

/** Login. Staff need their authenticator code, and so does anyone who turned two-step sign-in on. Returns a session token for the cookie. */
export async function login(db: Db, a: { email: string; password: string; totpCode?: string }, at: Date, from: { ip?: string; ua?: string } = {}) {
  const u = (await db.query(`select * from users where lower(email) = lower($1)`, [a.email])).rows[0]
  const fail = () => new MarketError('Email or password is not right.') // same message either way: no account probing
  // unknown emails still pay for one password hash, so the response time does not reveal who has an account
  const ok = verifyPassword(a.password ?? '', u?.password_hash ?? DUMMY_HASH)
  if (!u || u.status !== 'active' || !ok) throw fail()
  if (STAFF.includes(u.role) ? staffTwoStep() : u.totp_enabled) {
    const step = u.totp_enabled && a.totpCode ? totpStep(u.totp_secret, a.totpCode, at) : null
    if (step === null || (u.totp_last_step != null && step <= Number(u.totp_last_step))) throw new MarketError('Enter the code from your authenticator app.')
    await db.query(`update users set totp_last_step = $2 where id = $1`, [u.id, step]) // each code signs in once
  }
  const token = randomToken()
  await db.query(`insert into sessions (token_hash, user_id, created_at, expires_at, ip, user_agent, last_seen_at) values ($1, $2, $3, $4, $5, $6, $3)`,
    [sha256(token), u.id, at, new Date(at.getTime() + SESSION_HOURS * 3_600_000), from.ip ?? null, from.ua ?? null])
  await recordSignIn(db, { email: a.email, ip: from.ip, ua: from.ua, success: true }, at)
  await audit(db, `user:${u.id}`, 'login', 'user', u.id, null, at)
  return token
}

/**
 * Every sign-in attempt is kept for Nashr's team (and the person's own security): failures are recorded outside the request's
 * transaction (which rolls back on the error), successes inside it. Ten failed attempts on one account in 15 minutes lock it
 * for 15 minutes; asking for the authenticator code is a step, not a failure.
 */
export async function recordSignIn(db: Db, e: { email: string; ip?: string; ua?: string; success: boolean; reason?: string }, at: Date) {
  await db.query(`insert into login_events (at, email, user_id, ip, user_agent, success, reason)
    values ($1, $2, (select id from users where lower(email) = lower($2)), $3, $4, $5, $6)`,
    [at, String(e.email ?? '').slice(0, 200), e.ip ?? null, e.ua?.slice(0, 300) ?? null, e.success, e.reason ?? null])
}
export const LOCK_FAILURES = 10, LOCK_MINUTES = 15
export async function signInLocked(db: Db, email: string, at: Date) {
  const { n } = await one(db, `select count(*)::int n from login_events where lower(email) = lower($1) and not success
    and reason in ('password', 'code') and at > $2`, [email, new Date(at.getTime() - LOCK_MINUTES * 60_000)])
  return n >= LOCK_FAILURES
}

/** `signedInAs` is set while a staff member is signed in as another user: the session then is that user, and `staffId` is who is really there. */
export type Session = { tokenHash: string; userId: string; companyId: string; role: string; viewAs: { companyId: string; role: string } | null
  signedInAs?: { staffId: string; until: Date; reason: string } }

export const STAFF_ROLES = ['admin', 'founder']
export const SIGN_IN_AS_MINUTES = 60

export async function session(db: Db, token: string | undefined, at: Date): Promise<Session | null> {
  if (!token) return null
  const s = (await db.query(`select s.token_hash, s.view_as_company_id, s.act_as_until, s.act_as_reason, u.id, u.company_id, u.role, u.status, v.type view_type,
        t.id t_id, t.company_id t_company, t.role t_role, t.status t_status
      from sessions s join users u on u.id = s.user_id left join companies v on v.id = s.view_as_company_id
      left join users t on t.id = s.act_as_user_id
      where s.token_hash = $1 and s.expires_at > $2`, [sha256(token), at])).rows[0]
  if (!s || s.status !== 'active') return null
  // when it was last used, for Nashr's team (written at most every five minutes)
  await db.query(`update sessions set last_seen_at = $2 where token_hash = $1 and (last_seen_at is null or last_seen_at < $2::timestamptz - interval '5 minutes')`, [s.token_hash, at])
  // Signed in as someone else: only staff, only an active buyer or publisher user, only until the time runs out.
  if (s.t_id && STAFF_ROLES.includes(s.role) && s.t_status === 'active' && ['buyer', 'seller'].includes(s.t_role) && s.act_as_until > at)
    return { tokenHash: s.token_hash, userId: s.t_id, companyId: s.t_company, role: s.t_role, viewAs: null,
      signedInAs: { staffId: s.id, until: s.act_as_until, reason: s.act_as_reason } }
  return { tokenHash: s.token_hash, userId: s.id, companyId: s.company_id, role: s.role,
    viewAs: s.view_as_company_id ? { companyId: s.view_as_company_id, role: s.view_type === 'publisher' ? 'seller' : 'buyer' } : null }
}

export const logout = (db: Db, tokenHash: string) => db.query(`delete from sessions where token_hash = $1`, [tokenHash])

/*
 * Password resets. A person asks from the sign-in page; Nashr's team is told and sends the link (until email is connected, then
 * the link is emailed straight away). The answer to the asker is the same whether or not the email has an account.
 */
const RESET_HOURS = 24
export async function requestReset(db: Db, email: string, at: Date) {
  const u = (await db.query(`select id, company_id from users where lower(email) = lower($1) and status = 'active'`, [email ?? ''])).rows[0]
  if (!u) return
  const open = await db.query(`select 1 from password_resets where user_id = $1 and used_at is null and issued_at is null and requested_at > $2`, [u.id, new Date(at.getTime() - 3_600_000)])
  if (open.rowCount) return // one request an hour is enough
  await db.query(`insert into password_resets (user_id, requested_at) values ($1, $2)`, [u.id, at])
  // with email set up (and never for staff), the link goes straight to the person; otherwise Nashr's team issues it
  const person = (await db.query(`select name, email, role, lang from users where id = $1`, [u.id])).rows[0]
  if (smtpConfig() && !STAFF.includes(person.role)) {
    const token = randomToken()
    await db.query(`update password_resets set token_hash = $2, issued_at = $3, expires_at = $4 where user_id = $1 and issued_at is null and used_at is null`,
      [u.id, sha256(token), at, new Date(at.getTime() + RESET_HOURS * 3_600_000)])
    await queueResetEmail(db, { userId: u.id, to: person.email, name: person.name, lang: person.lang === 'ar' ? 'ar' : 'en', link: `/reset#${token}` }, at)
    await audit(db, `user:${u.id}`, 'password.reset_emailed', 'user', u.id, null, at)
    return
  }
  for (const admin of (await db.query(`select distinct company_id from users where role in ('admin', 'founder')`)).rows)
    await notify(db, admin.company_id, 'access.reset_requested', null, { userId: u.id, companyId: u.company_id }, at)
  await audit(db, `user:${u.id}`, 'password.reset_requested', 'user', u.id, null, at)
}

/**
 * Nashr's team issues a one-day link for a buyer or publisher (never for staff: they keep their authenticator), only when that
 * person asked for one from the sign-in page in the last week, and their company is told. Older links stop working.
 */
export async function issueReset(db: Db, userId: string, actor: string, at: Date) {
  const u = (await db.query(`select id, name, role, status, company_id from users where id = $1`, [userId])).rows[0]
  if (!u || u.status !== 'active' || STAFF.includes(u.role)) throw new MarketError('A reset link can be issued only for an active buyer or publisher user.')
  const asked = await db.query(`select 1 from password_resets where user_id = $1 and issued_at is null and used_at is null and requested_at > $2`,
    [u.id, new Date(at.getTime() - 7 * 86_400_000)])
  if (!asked.rowCount) throw new MarketError('This person has not asked for a password reset. They ask from "Forgot your password?" on the sign-in page.')
  const token = randomToken()
  await db.query(`update password_resets set used_at = $2 where user_id = $1 and used_at is null`, [u.id, at])
  await db.query(`insert into password_resets (user_id, token_hash, requested_at, issued_at, expires_at) values ($1, $2, $3, $3, $4)`,
    [u.id, sha256(token), at, new Date(at.getTime() + RESET_HOURS * 3_600_000)])
  await audit(db, actor, 'password.reset_issued', 'user', u.id, null, at)
  await notify(db, u.company_id, 'access.reset_issued', null, { user: u.name }, at)
  return token
}

export async function resetPassword(db: Db, a: { token: string; password: string }, at: Date) {
  const r = (await db.query(`select * from password_resets where token_hash = $1 for update`, [sha256(a.token ?? '')])).rows[0]
  if (!r || r.used_at || !r.expires_at || r.expires_at <= at) throw new MarketError('This reset link has expired. Ask Nashr for a new one.')
  if ((a.password ?? '').length < 12) throw new MarketError('Use a password of at least 12 characters.')
  await db.query(`update users set password_hash = $2 where id = $1`, [r.user_id, hashPassword(a.password)])
  await db.query(`update password_resets set used_at = $2 where id = $1`, [r.id, at])
  await db.query(`delete from sessions where user_id = $1`, [r.user_id]) // signed out everywhere
  await endSignInAs(db, r.user_id)
  await audit(db, `user:${r.user_id}`, 'password.reset', 'user', r.user_id, null, at)
}

/**
 * Self-service reset for anyone who turned on two-step sign-in: email, a fresh code from their authenticator app and a new
 * password, no link needed. Every failure gets the same answer, so it reveals nothing about who has an account.
 */
export async function resetWithCode(db: Db, a: { email: string; code: string; password: string }, at: Date) {
  if ((a.password ?? '').length < 12) throw new MarketError('Use a password of at least 12 characters.')
  const u = (await db.query(`select * from users where lower(email) = lower($1) for update`, [a.email ?? ''])).rows[0]
  const wrong = () => new MarketError('The email or the code is not right.')
  if (!u || u.status !== 'active' || STAFF.includes(u.role) || !u.totp_enabled) throw wrong()
  const step = totpStep(u.totp_secret, String(a.code ?? '').trim(), at)
  if (step === null || (u.totp_last_step != null && step <= Number(u.totp_last_step))) throw wrong()
  await db.query(`update users set password_hash = $2, totp_last_step = $3 where id = $1`, [u.id, hashPassword(a.password), step])
  await db.query(`update password_resets set used_at = $2 where user_id = $1 and used_at is null`, [u.id, at]) // any pending request is settled
  await db.query(`delete from sessions where user_id = $1`, [u.id])
  await endSignInAs(db, u.id)
  await audit(db, `user:${u.id}`, 'password.reset_with_code', 'user', u.id, null, at)
  await notify(db, u.company_id, 'access.password_reset_self', null, { user: u.name }, at)
}

/** Staff signed in as this person lose that access too when the person's sign-in details change. */
export const endSignInAs = (db: Db, userId: string) =>
  db.query(`update sessions set act_as_user_id = null, act_as_until = null, act_as_reason = null where act_as_user_id = $1`, [userId])

/** Signed in: change the password (the current one is required), and sign out every other session. */
export async function changePassword(db: Db, a: { userId: string; current: string; password: string; keepToken: string }, at: Date) {
  const u = (await db.query(`select password_hash from users where id = $1`, [a.userId])).rows[0]
  if (!u || !verifyPassword(a.current ?? '', u.password_hash)) throw new MarketError('Your current password is not right.')
  if ((a.password ?? '').length < 12) throw new MarketError('Use a password of at least 12 characters.')
  if (a.password === a.current) throw new MarketError('Choose a new password, not the current one.')
  await db.query(`update users set password_hash = $2 where id = $1`, [a.userId, hashPassword(a.password)])
  await db.query(`delete from sessions where user_id = $1 and token_hash <> $2`, [a.userId, a.keepToken])
  await endSignInAs(db, a.userId)
  await audit(db, `user:${a.userId}`, 'password.changed', 'user', a.userId, null, at)
}
