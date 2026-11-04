import { type Db, one } from './db.js'
import { audit } from './audit.js'

/** Value of a setting in force at `at` (settings keep their full history). */
export async function setting<T = any>(db: Db, key: string, at: Date): Promise<T> {
  const { rows } = await db.query(
    `select value from settings where key = $1 and valid_from <= $2 order by valid_from desc limit 1`, [key, at])
  if (!rows.length) throw new Error(`setting ${key} not set`)
  return rows[0].value
}

export async function changeSetting(db: Db, key: string, value: unknown, by: string, at: Date) {
  await db.query(`insert into settings (key, value, valid_from, changed_by) values ($1, $2, $3, $4)`, [key, JSON.stringify(value), at, by])
  await audit(db, by, 'setting.changed', 'setting', key, { value }, at)
}

/** Commission for a publisher: its own rate (founding rates) or the default. */
export async function commissionBp(db: Db, publisherId: string, at: Date): Promise<number> {
  const own = await db.query(
    `select value from settings where key = $1 and valid_from <= $2 order by valid_from desc limit 1`, [`commission:${publisherId}`, at])
  return own.rows.length ? own.rows[0].value : setting(db, 'default_commission_bp', at)
}

/** Rates frozen onto a deal when it is accepted. */
export async function ratesFor(db: Db, publisherId: string, at: Date) {
  const pub = await one(db, `select vat_registered from companies where id = $1`, [publisherId])
  return {
    commissionBp: await commissionBp(db, publisherId, at),
    mediaVatBp: pub.vat_registered ? await setting<number>(db, 'media_vat_bp', at) : 0,
    feeVatBp: (await setting<boolean>(db, 'nashr_vat_registered', at)) ? await setting<number>(db, 'nashr_vat_bp', at) : 0,
  }
}
