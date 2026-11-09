import { type Db, pool, tx } from './db.js'
import { notify } from './notify.js'
import { audit } from './audit.js'
import { smtpConfig } from './smtp.js'

/*
 * The watch: every minute, the things that need a person are checked, and Nashr's staff hear about each problem once when it
 * starts (bell, email, phone) and once when it clears. The same problems turn /api/health red for the uptime monitor; this is
 * the part that reaches a person even when nobody is watching a monitor. Open problems are listed on the staff overview.
 */

// Server errors and failed background jobs, counted in memory: the API process records them as they happen.
const errors: { at: number; what: string }[] = []
export function recordError(what: string, at = Date.now()) {
  errors.push({ at, what })
  while (errors.length > 500 || (errors.length && errors[0].at < at - 3_600_000)) errors.shift()
}
export const _resetErrors = () => { errors.length = 0 }

export type Problem = { key: string; detail: string }
type Ctx = { at: Date; reconciles?: () => Promise<boolean> }

const ago = (ms: number) => ms < 3_600_000 ? `${Math.round(ms / 60_000)} minutes` : `${Math.round(ms / 3_600_000)} hours`

/** What is wrong right now. Each problem has a stable key, so it is reported once while it lasts. */
export async function findProblems(db: Db, ctx: Ctx): Promise<Problem[]> {
  const at = ctx.at, out: Problem[] = []
  const r = (await db.query(`select
      (select max(at) from audit_log where action = 'sweeper.heartbeat') heartbeat,
      (select min(created_at) from money_ops where status = 'pending' and kind <> 'charge') oldest_pending,
      (select count(*)::int from money_ops where status = 'failed' and kind <> 'charge') failed_money,
      (select count(*)::int from outbox where status = 'failed' and created_at > $1::timestamptz - interval '1 day') failed_mail,
      (select min(created_at) from outbox where status = 'queued' and attempts > 0) retrying_mail,
      (select count(*)::int from deals where status = 'disputed' and decide_by is not null and decide_by < $1) late_disputes,
      (select max(at) from ops_runs where kind = 'backup' and ok) last_backup,
      (select ok from ops_runs where kind = 'backup' order by at desc limit 1) backup_ok,
      (select ok from ops_runs where kind = 'restore_drill' order by at desc limit 1) drill_ok,
      (select max(at) from ops_runs where kind = 'restore_drill' and ok) last_drill`, [at])).rows[0]

  if (!r.heartbeat || at.getTime() - r.heartbeat.getTime() > 5 * 60_000)
    out.push({ key: 'sweeper.stopped', detail: r.heartbeat ? `The timer job last ran ${ago(at.getTime() - r.heartbeat.getTime())} ago: auctions do not close and deadlines do not pass.` : 'The timer job has not run yet.' })
  if (r.oldest_pending && at.getTime() - r.oldest_pending.getTime() > 15 * 60_000)
    out.push({ key: 'money.stuck', detail: `A payout or refund has been waiting ${ago(at.getTime() - r.oldest_pending.getTime())}. Check Funds.` })
  if (r.failed_money > 0) out.push({ key: 'money.failed', detail: `${r.failed_money} payout or refund failed and needs a person. Check Funds.` })
  if (ctx.reconciles && !(await ctx.reconciles())) out.push({ key: 'money.ledger', detail: 'The ledger and the payment provider disagree on the cash Nashr holds. Check Funds.' })
  if (smtpConfig()) {
    if (r.failed_mail > 0) out.push({ key: 'email.failing', detail: `${r.failed_mail} email could not be sent in the last day. Check Emails.` })
    else if (r.retrying_mail && at.getTime() - r.retrying_mail.getTime() > 30 * 60_000)
      out.push({ key: 'email.failing', detail: `Emails have been retrying for ${ago(at.getTime() - r.retrying_mail.getTime())}. Check Emails.` })
  }
  if (r.late_disputes > 0) out.push({ key: 'disputes.late', detail: `${r.late_disputes} dispute is past its decision date. Check Disputes.` })
  const recent = errors.filter(e => e.at > at.getTime() - 10 * 60_000)
  if (recent.length >= 5) out.push({ key: 'errors.spike', detail: `${recent.length} server errors in the last 10 minutes, latest: ${recent[recent.length - 1].what}. Check the logs (journalctl -u nashr).` })
  // Backups are watched where the server makes them (the deploy script sets BACKUP_DIR and installs the nightly timer).
  if (process.env.BACKUP_DIR) {
    if (r.backup_ok === false) out.push({ key: 'backup.failed', detail: 'The last backup failed. Check: journalctl -u nashr-backup.' })
    else if (!r.last_backup || at.getTime() - r.last_backup.getTime() > 26 * 3_600_000)
      out.push({ key: 'backup.missing', detail: r.last_backup ? `The last backup is ${ago(at.getTime() - r.last_backup.getTime())} old.` : 'No backup has been made yet.' })
    if (r.drill_ok === false) out.push({ key: 'restore.failed', detail: 'The last restore drill failed: a backup may not restore. Check: journalctl -u nashr-restore-drill.' })
    else if (r.last_drill && at.getTime() - r.last_drill.getTime() > 8 * 86_400_000) out.push({ key: 'restore.missing', detail: 'No restore drill has passed for over a week.' })
  }
  return out
}

/** Open what is new, keep what continues, close what cleared; tell staff about each change. */
export async function watch(ctx: Ctx) {
  const problems = await findProblems(pool, ctx)
  return tx(async db => {
    if (!(await db.query(`select pg_try_advisory_xact_lock(hashtext('nashr.watch'))`)).rows[0].pg_try_advisory_xact_lock) return { opened: [], cleared: [] }
    const open = (await db.query(`select * from staff_alerts where resolved_at is null`)).rows
    const staff = (await db.query(`select distinct company_id from users where role in ('admin', 'founder') and status = 'active'`)).rows.map(x => x.company_id)
    const opened: string[] = [], cleared: string[] = []
    for (const p of problems) {
      if (open.some(o => o.key === p.key)) { await db.query(`update staff_alerts set last_seen_at = $2, detail = $3 where key = $1 and resolved_at is null`, [p.key, ctx.at, p.detail]); continue }
      await db.query(`insert into staff_alerts (key, detail, opened_at, last_seen_at) values ($1, $2, $3, $3)`, [p.key, p.detail, ctx.at])
      await audit(db, 'system', 'ops.alert', 'system', null, p, ctx.at)
      for (const c of staff) await notify(db, c, 'ops.alert', null, p, ctx.at)
      opened.push(p.key)
    }
    for (const o of open.filter(o => !problems.some(p => p.key === o.key))) {
      await db.query(`update staff_alerts set resolved_at = $2 where id = $1`, [o.id, ctx.at])
      await audit(db, 'system', 'ops.cleared', 'system', null, { key: o.key }, ctx.at)
      for (const c of staff) await notify(db, c, 'ops.cleared', null, { key: o.key, detail: o.detail }, ctx.at)
      cleared.push(o.key)
    }
    return { opened, cleared }
  })
}
