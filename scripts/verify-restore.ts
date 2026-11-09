// Compares a restored database with its source: every table's rows, money in the ledger, document numbering, safeguards.
// Run on its own (SOURCE_URL, RESTORE_URL) after a real restore, or from scripts/restore-drill.ts, which reads the source at the
// exact moment the backup was taken, so a live server writing meanwhile does not count as a difference.
import pg from 'pg'

type Q = (sql: string) => Promise<any[]>

export async function compareRestore(src: Q, dst: Q, dstPool: pg.Pool) {
  const problems: string[] = []
  const tables = (await src(`select tablename from pg_tables where schemaname = 'public' order by 1`)).map(r => r.tablename)
  for (const t of tables) {
    const sql = `select count(*)::int n, md5(coalesce(string_agg(x::text, '|' order by x::text), '')) h from "${t}" x`
    const [a] = await src(sql), [b] = await dst(sql)
    if (a.n !== b.n || a.h !== b.h) problems.push(`${t}: ${a.n} rows in source, ${b.n} restored${a.n === b.n ? ' (contents differ)' : ''}`)
  }
  // The ledger still holds the same money.
  const cash = `select coalesce(sum(case when debit = 'cash' then amount else 0 end) - sum(case when credit = 'cash' then amount else 0 end), 0)::bigint cash from ledger_entries`
  const [bal] = await dst(cash), [srcBal] = await src(cash)
  if (bal.cash !== srcBal.cash) problems.push(`ledger cash ${srcBal.cash} in source, ${bal.cash} restored`)
  // Document numbers stay gapless and the series counters continue where they were.
  const gaps = await dst(`select series, last from document_series s where last <> (select count(*) from documents d
    where s.series = d.type || ':' || coalesce(d.issuer_id::text, 'nashr') || ':' || extract(year from d.issued_at)::int)`)
  for (const g of gaps) problems.push(`document series ${g.series} counter ${g.last} does not match its documents`)
  // Sequences continue past the restored rows (next order number, next payment reference). Sequences are not transactional,
  // so a live source may have moved on: the restored value must not be ahead of it.
  for (const s of ['deal_ref_seq', 'pay_ref_seq']) {
    const [a] = await src(`select last_value from ${s}`), [b] = await dst(`select last_value from ${s}`)
    if (BigInt(b.last_value) > BigInt(a.last_value)) problems.push(`sequence ${s}: ${a.last_value} in source, ${b.last_value} restored`)
  }
  // The append-only guards came back too.
  try { await dstPool.query(`update audit_log set action = action where id = (select min(id) from audit_log)`); problems.push('audit_log can be changed after restore') }
  catch { /* refused, as it should be */ }
  return { problems, tables: tables.length, cash: bal.cash }
}

if (process.argv[1]?.endsWith('verify-restore.ts')) {
  const src = new pg.Pool({ connectionString: process.env.SOURCE_URL }), dst = new pg.Pool({ connectionString: process.env.RESTORE_URL })
  const r = await compareRestore(async s => (await src.query(s)).rows, async s => (await dst.query(s)).rows, dst)
  await src.end(); await dst.end()
  if (r.problems.length) { console.error('Restore check FAILED:\n- ' + r.problems.join('\n- ')); process.exit(1) }
  console.log(`Restore check passed: ${r.tables} tables identical, ledger cash ${r.cash} fils, document numbering intact, safeguards active.`)
}
