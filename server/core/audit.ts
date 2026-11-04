import type { Db } from './db.js'

export async function audit(db: Db, actor: string, action: string, entity: string | null, entityId: string | null, detail: unknown, at: Date) {
  await db.query(`insert into audit_log (at, actor, action, entity, entity_id, detail) values ($1, $2, $3, $4, $5, $6)`,
    [at, actor, action, entity, entityId, detail == null ? null : JSON.stringify(detail)])
}
