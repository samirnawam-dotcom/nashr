import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { pool, tx } from './db.js'

const dir = fileURLToPath(new URL('../migrations/', import.meta.url))

export async function migrate() {
  // One copy at a time: shared hosting can start several copies of the app at once, and two running the same migration collide.
  const lock = await pool.connect()
  try {
    await lock.query('select pg_advisory_lock(7310002)')
    await pool.query('create table if not exists schema_migrations (name text primary key, at timestamptz not null default now())')
    const done = new Set((await pool.query('select name from schema_migrations')).rows.map(r => r.name))
    for (const name of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
      if (done.has(name)) continue
      await tx(async c => {
        await c.query(readFileSync(dir + name, 'utf8'))
        await c.query('insert into schema_migrations (name) values ($1)', [name])
      })
    }
  } finally { await lock.query('select pg_advisory_unlock(7310002)').catch(() => {}); lock.release() }
}

// run directly (tsx server/core/migrate.ts, or node server/migrate.mjs in the shared-hosting bundle), never when another script includes it
if (/[\/]migrate\.(ts|mjs)$/.test(process.argv[1] ?? '')) await migrate().finally(() => pool.end())
