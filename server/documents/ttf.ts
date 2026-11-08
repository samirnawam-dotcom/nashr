import { readFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

/*
 * The little of a TrueType font a PDF needs: which glyph draws a character (cmap), how wide each glyph is (hmtx),
 * and the font's overall measures for its descriptor. The file itself is embedded whole, compressed.
 */
export type Font = { name: string; unitsPerEm: number; ascent: number; descent: number; capHeight: number; bbox: number[]
  glyph: (code: number) => number; advance: (gid: number) => number; file: Buffer; deflated: () => Buffer }

export function loadFont(path: string, name: string): Font {
  const d = readFileSync(path)
  const u16 = (o: number) => d.readUInt16BE(o), i16 = (o: number) => d.readInt16BE(o), u32 = (o: number) => d.readUInt32BE(o)
  const tables: Record<string, number> = {}
  for (let i = 0, n = u16(4); i < n; i++) tables[d.toString('latin1', 12 + 16 * i, 16 + 16 * i)] = u32(20 + 16 * i)
  const head = tables['head'], hhea = tables['hhea'], hmtx = tables['hmtx'], os2 = tables['OS/2'], cmap = tables['cmap']
  const unitsPerEm = u16(head + 18)
  const bbox = [i16(head + 36), i16(head + 38), i16(head + 40), i16(head + 42)]
  const metrics = u16(hhea + 34)
  // the Windows Unicode BMP table, format 4: segments of character ranges
  let sub = -1
  for (let i = 0, n = u16(cmap + 2); i < n; i++)
    if (u16(cmap + 4 + 8 * i) === 3 && u16(cmap + 6 + 8 * i) === 1) sub = cmap + u32(cmap + 8 + 8 * i)
  if (sub < 0 || u16(sub) !== 4) throw new Error(`${name}: no Unicode character map`)
  const segs = u16(sub + 6) / 2, ends = sub + 14, starts = ends + 2 * segs + 2, deltas = starts + 2 * segs, ranges = deltas + 2 * segs
  const cache = new Map<number, number>()
  const glyph = (code: number) => {
    if (cache.has(code)) return cache.get(code)!
    let g = 0
    for (let i = 0; i < segs; i++) {
      if (code > u16(ends + 2 * i)) continue
      const start = u16(starts + 2 * i)
      if (code < start) break
      const delta = i16(deltas + 2 * i), ro = u16(ranges + 2 * i)
      if (!ro) g = (code + delta) & 0xffff
      else { const raw = u16(ranges + 2 * i + ro + 2 * (code - start)); g = raw ? (raw + delta) & 0xffff : 0 }
      break
    }
    cache.set(code, g); return g
  }
  const advance = (gid: number) => u16(hmtx + 4 * Math.min(gid, metrics - 1))
  let packed: Buffer | null = null
  return { name, unitsPerEm, bbox, ascent: i16(os2 + 68), descent: i16(os2 + 70), capHeight: u16(os2) >= 2 ? i16(os2 + 88) : i16(os2 + 68),
    glyph, advance, file: d, deflated: () => (packed ??= deflateSync(d)) }
}
