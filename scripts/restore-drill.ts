// Restore drill: take a backup, restore it into a brand-new database, and prove the copy matches the source as it was at that
// moment (the source is read in the same snapshot pg_dump used, so a live server keeps working meanwhile). The result is recorded
// in ops_runs, and a failed or missing drill alerts staff. A weekly timer runs it on the server (scripts/deploy-vps.sh).
// Usage: DATABASE_URL=postgres://.../nashr npx tsx scripts/restore-drill.ts   (the role must be able to create databases)
import pg from 'pg'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { compareRestore } from './verify-restore.js'

const url = process.env.DATABASE_URL
if (!url) { console.error('Set DATABASE_URL'); process.exit(2) }
const started = Date.now(), dir = process.env.BACKUP_DIR ?? 'backups'
const target = `nashr_restore_${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}`
const restoreUrl = url.replace(/\/[^/?]+(\?|$)/, `/${target}$1`)
const file = join(dir, `${target}.dump`)
const admin = new pg.Pool({ connectionString: url, max: 2 })
const record = (ok: boolean, detail: string) => admin.query(`insert into ops_runs (kind, ok, detail) values ('restore_drill', $1, $2)`, [ok, detail.slice(0, 500)])

let snap: pg.PoolClient | null = null, created = false, restored: pg.Pool | null = null
try {
  mkdirSync(dir, { recursive: true })
  snap = await admin.connect()
  await snap.query('begin isolation level repeatable read read only')
  const id = (await snap.query('select pg_export_snapshot() id')).rows[0].id
  execFileSync('pg_dump', ['--format=custom', '--no-owner', '--no-privileges', `--snapshot=${id}`, `--file=${file}`, url], { stdio: 'inherit' })
  if (readFileSync(file).length < 1024) throw new Error('the backup file is empty')
  await admin.query(`create database ${target}`); created = true
  execFileSync('pg_restore', ['--no-owner', '--no-privileges', '--exit-on-error', `--dbname=${restoreUrl}`, file], { stdio: 'inherit' })
  restored = new pg.Pool({ connectionString: restoreUrl, max: 1 })
  const r = await compareRestore(async s => (await snap!.query(s)).rows, async s => (await restored!.query(s)).rows, restored)
  await snap.query('rollback'); snap.release(); snap = null
  if (r.problems.length) throw new Error('the copy differs: ' + r.problems.join('; '))
  const secs = Math.round((Date.now() - started) / 1000)
  await record(true, `restored ${r.tables} tables, ledger cash ${r.cash} fils, in ${secs}s`)
  console.log(`Restore drill passed in ${secs}s: ${r.tables} tables identical, ledger cash ${r.cash} fils, numbering intact, safeguards active.`)
} catch (e: any) {
  console.error('Restore drill FAILED:', e?.message ?? e)
  await record(false, String(e?.message ?? e)).catch(() => {})
  process.exitCode = 1
} finally {
  if (snap) { await snap.query('rollback').catch(() => {}); snap.release() }
  await restored?.end()
  if (created && process.env.KEEP_RESTORE !== '1') await admin.query(`drop database ${target}`).catch(e => console.error('Could not drop', target, e.message))
  rmSync(file, { force: true })
  await admin.end()
}
