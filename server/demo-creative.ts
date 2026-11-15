// Demo data only: every demo buyer has a draft creative on file, so their bids carry one like a real buyer's
// (owner's rule: a seller never accepts a bid blind). The picture is one of the site's own print-ad photos.
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { pool } from './core/db.js'
import { DiskStorage, sniffType } from './files/storage.js'

const PICTURE = fileURLToPath(new URL('../web/public/brand/print-card.jpg', import.meta.url))
const BASE = { advertiser: 'Demo brand', industry: 'Banking', message: 'Demo campaign', language: 'english' }

/** A complete brief per buyer, each with that buyer's own creative file. */
export async function demoBriefs(buyers: string[], extra: Record<string, unknown> = {}) {
  const bytes = await readFile(PICTURE), storage = new DiskStorage(), out = new Map<string, Record<string, unknown>>()
  for (const id of buyers) {
    const f = (await pool.query(`insert into files (company_id, name, type, size, created_at) values ($1, 'draft-creative.jpg', $2, $3, now()) returning id`, [id, sniffType(bytes), bytes.length])).rows[0]
    await storage.put(f.id, bytes)
    out.set(id, { ...BASE, ...extra, draftFileKey: `files/${f.id}` })
  }
  return (buyerId: string) => out.get(buyerId) ?? (() => { throw new Error(`no demo brief for ${buyerId}`) })()
}
