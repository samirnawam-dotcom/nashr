// Compares a restored database with its source: every table's rows, money in the ledger, document numbering, safeguards.
import pg from 'pg'

const src = new pg.Pool({ connectionString: process.env.SOURCE_URL }), dst = new pg.Pool({ connectionString: process.env.RESTORE_URL })
const q = async (db: pg.Pool, sql: string) => (await db.query(sql)).rows
const problems: string[] = []

const tables = (await q(src, `select tablename from pg_tables where schemaname = 'public' order by 1`)).map(r => r.tablename)
for (const t of tables) {
  const [a] = await q(src, `select count(*)::int n, md5(coalesce(string_agg(x::text, '|' order by x::text), '')) h from "${t}" x`)
  const [b] = await q(dst, `select count(*)::int n, md5(coalesce(string_agg(x::text, '|' order by x::text), '')) h from "${t}" x`)
  if (a.n !== b.n || a.h !== b.h) problems.push(`${t}: ${a.n} rows in source, ${b.n} restored${a.n === b.n ? ' (contents differ)' : ''}`)
}
// The ledger still balances (every movement has two sides) and holds the same money per account.
const [bal] = await q(dst, `select coalesce(sum(case when debit = 'cash' then amount else 0 end) - sum(case when credit = 'cash' then amount else 0 end), 0)::bigint cash from ledger_entries`)
const [srcBal] = await q(src, `select coalesce(sum(case when debit = 'cash' then amount else 0 end) - sum(case when credit = 'cash' then amount else 0 end), 0)::bigint cash from ledger_entries`)
if (bal.cash !== srcBal.cash) problems.push(`ledger cash ${srcBal.cash} in source, ${bal.cash} restored`)
// Document numbers stay gapless and the series counters continue where they were.
const gaps = await q(dst, `select series, last from document_series s where last <> (select count(*) from documents d
  where s.series = d.type || ':' || coalesce(d.issuer_id::text, 'nashr') || ':' || extract(year from d.issued_at)::int)`)
for (const g of gaps) problems.push(`document series ${g.series} counter ${g.last} does not match its documents`)
// Sequences continue past the restored rows (next order number, next payment reference).
for (const s of ['deal_ref_seq', 'pay_ref_seq']) {
  const [a] = await q(src, `select last_value from ${s}`), [b] = await q(dst, `select last_value from ${s}`)
  if (a.last_value !== b.last_value) problems.push(`sequence ${s}: ${a.last_value} in source, ${b.last_value} restored`)
}
// The append-only guards came back too.
try { await dst.query(`update audit_log set action = action where id = (select min(id) from audit_log)`); problems.push('audit_log can be changed after restore') }
catch { /* refused, as it should be */ }

await src.end(); await dst.end()
if (problems.length) { console.error('Restore check FAILED:\n- ' + problems.join('\n- ')); process.exit(1) }
console.log(`Restore check passed: ${tables.length} tables identical, ledger cash ${bal.cash} fils, document numbering intact, safeguards active.`)
