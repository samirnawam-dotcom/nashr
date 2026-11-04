import pg from 'pg'

// Fresh test database for every run, then apply migrations.
export async function setup() {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://nashr:nashr@localhost:5432/nashr_test'
  const url = new URL(process.env.DATABASE_URL)
  const name = url.pathname.slice(1)
  const admin = new pg.Client({ connectionString: Object.assign(new URL(url), { pathname: '/postgres' }).toString() })
  await admin.connect()
  await admin.query(`drop database if exists ${name} with (force)`)
  await admin.query(`create database ${name}`)
  await admin.end()
  const { migrate } = await import('../core/migrate.js')
  const { pool } = await import('../core/db.js')
  await migrate()
  await pool.end()
}
