import type { Db } from './db.js'

/** In-app notification (the bell). Email delivery reads the same rows (plan phase 7). */
export async function notify(db: Db, companyId: string, kind: string, dealId: string | null, data: unknown, at: Date) {
  await db.query(`insert into notifications (company_id, kind, deal_id, data, created_at) values ($1, $2, $3, $4, $5)`,
    [companyId, kind, dealId, data == null ? null : JSON.stringify(data), at])
}
