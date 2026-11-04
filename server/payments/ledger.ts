import type { Db } from '../core/db.js'

/*
 * Double-entry ledger (SPEC 5.6). Each row moves `amount` from `credit` to `debit`; rows are never changed.
 * Accounts:
 *   cash                     money in Nashr's provider balance (asset)
 *   held                     money paid for a deal, held until release or refund (scoped by deal_id)
 *   seller_payable:<id>      released to a seller, not yet transferred
 *   seller_receivable:<id>   owed by a seller (refund costs at their fault), deducted from their next transfer
 *   nashr_revenue            Nashr's commission
 *   vat_payable              VAT on Nashr's commission (only when Nashr is VAT-registered)
 *   refund_costs             card processing costs on refunds: recovered (credit) or recoverable (debit)
 */
export type Entry = { debit: string; credit: string; amount: number; dealId?: string | null; ref?: string }

export async function post(db: Db, entries: Entry[], currency: string, at: Date) {
  for (const e of entries.filter(e => e.amount > 0))
    await db.query(`insert into ledger_entries (at, deal_id, debit, credit, amount, currency, ref) values ($1, $2, $3, $4, $5, $6, $7)`,
      [at, e.dealId ?? null, e.debit, e.credit, e.amount, currency, e.ref ?? null])
}

/** Balance of an account: debits minus credits (positive for assets, negative for liabilities). */
export async function balance(db: Db, account: string, currency: string, dealId?: string) {
  const { rows } = await db.query(
    `select (coalesce(sum(case when debit = $1 then amount else 0 end), 0) - coalesce(sum(case when credit = $1 then amount else 0 end), 0))::bigint as b
     from ledger_entries where (debit = $1 or credit = $1) and currency = $2 and ($3::uuid is null or deal_id = $3)`, [account, currency, dealId ?? null])
  return rows[0].b as number
}

/** Money still held for a deal (positive). */
export const heldFor = async (db: Db, dealId: string, currency: string) => 0 - await balance(db, 'held', currency, dealId)
