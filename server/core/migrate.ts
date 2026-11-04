import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { pool, tx } from './db.js'

const dir = fileURLToPath(new URL('../migrations/', import.meta.url))

export async function migrate() {
  await pool.query('create table if not exists schema_migrations (name text primary key, at timestamptz not null default now())')
  const done = new Set((await pool.query('select name from schema_migrations')).rows.map(r => r.name))
  for (const name of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    if (done.has(name)) continue
    await tx(async c => {
      await c.query(readFileSync(dir + name, 'utf8'))
      await c.query('insert into schema_migrations (name) values ($1)', [name])
    })
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await migrate().finally(() => pool.end())
