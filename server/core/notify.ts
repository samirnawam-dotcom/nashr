import type { Db } from './db.js'
import { signalCompany } from './live.js'
import { queueNoticeEmails } from './mail.js'
import { pushNotice } from './push.js'
import { afterCommit } from './db.js'

/** A notification: on the bell (live on open pages) and, in the same transaction, the emails it means for that company's people. */
export async function notify(db: Db, companyId: string, kind: string, dealId: string | null, data: unknown, at: Date) {
  await db.query(`insert into notifications (company_id, kind, deal_id, data, created_at) values ($1, $2, $3, $4, $5)`,
    [companyId, kind, dealId, data == null ? null : JSON.stringify(data), at])
  signalCompany(db, companyId) // open pages refresh the bell at once
  await queueNoticeEmails(db, companyId, kind, dealId, data, at)
  afterCommit(db, () => pushNotice(companyId, kind, dealId, data)) // phone and browser alerts, once the change is saved
}
