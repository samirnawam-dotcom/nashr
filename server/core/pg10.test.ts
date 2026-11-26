import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { pool } from './db.js'

// The cPanel host runs PostgreSQL 10. It refuses two things newer servers allow: a keyword as a column label without AS
// (`0 committed`, `'x' type`), and casting jsonb straight to a number (`(value)::int`; use `(value #>> '{}')::int`).
const files = (dir: string): string[] => readdirSync(dir).flatMap(f => { const p = join(dir, f)
  return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') && !p.endsWith('.test.ts') ? [p] : [] })
const SAFE = new Set(['desc', 'asc', 'end', 'from'])
const BEFORE_OK = new Set(['select', 'distinct', 'nulls', 'by', 'and', 'or', 'not', 'is', 'then', 'else', 'when', 'as', 'on', 'in', 'where',
  'returning', 'set', 'order', 'group', 'case', 'into', 'join', 'from', 'with', 'null'])

test('SQL runs on PostgreSQL 10 (cPanel)', async () => {
  const kw = new Set((await pool.query(`select word from pg_get_keywords()`)).rows.map(r => r.word as string))
  const bad: string[] = []
  for (const f of files('server')) {
    const src = readFileSync(f, 'utf8')
    for (const m of src.matchAll(/`([^`]*)`/gs)) {
      const s = m[1]
      if (!/\bselect\b/i.test(s)) continue
      if (/\(value\)::(int|bigint|numeric)/.test(s)) bad.push(`${f}: jsonb cast (value)::number`)
      for (const a of s.matchAll(/(\S+)\s+([a-z_]+)\b(?=\s*(,|\n|$|from\b|\)))/g)) {
        const [, prev, w] = a
        if (!kw.has(w) || SAFE.has(w) || prev.endsWith(',')) continue
        const pw = prev.replace(/.*[\s(,]/, '').toLowerCase()
        if (BEFORE_OK.has(pw) || (kw.has(pw) && !prev.endsWith(')') && pw !== 'end')) continue
        if (pw === '=' || pw === '%\')' || /^\$\d+::date\)$/.test(pw) || ['and', 'or', 'select', 'set'].includes(w)) continue
        bad.push(`${f}: "${prev.slice(-30)} ${w}" needs "as ${w}"`)
      }
    }
  }
  expect(bad).toEqual([])
})
