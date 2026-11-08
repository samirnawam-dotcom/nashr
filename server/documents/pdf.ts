import { fileURLToPath } from 'node:url'
import { SOURCE, hasArabic, shape, visual } from './arabic.js'
import { type Font, loadFont } from './ttf.js'

/*
 * A document as a PDF, drawn on the server from the stored row (the row stays the record; this is only its rendering).
 * A small writer of our own, not a library: one A4 page per document, text and rules. Latin text uses the built-in
 * Helvetica faces; any line with Arabic is drawn in IBM Plex Sans Arabic (the app's Arabic face, SIL Open Font Licence,
 * fonts/OFL.txt), embedded only in PDFs that need it.
 * ponytail: the whole font file is embedded (about 110 KB compressed per face); subset it if PDF size starts to matter.
 */

const ARABIC: Record<'R' | 'B', () => Font> = (() => {
  const cache: Partial<Record<'R' | 'B', Font>> = {}
  const at = (f: string) => fileURLToPath(new URL(`./fonts/${f}`, import.meta.url))
  return {
    R: () => (cache.R ??= loadFont(at('IBMPlexSansArabic-Regular.ttf'), 'IBMPlexSansArabic-Regular')),
    B: () => (cache.B ??= loadFont(at('IBMPlexSansArabic-Bold.ttf'), 'IBMPlexSansArabic-Bold')),
  }
})()
/** Glyphs for a line with Arabic, in display order; a character the font lacks shows as "?". */
const arabicGlyphs = (s: string, face: Face, rtl: boolean) => {
  const font = ARABIC[face](), q = font.glyph(0x3f)
  return visual(shape(s.replace(/[\r\n]/g, ' ')), rtl ? 'rtl' : undefined).map(code => ({ code, gid: font.glyph(code) || q }))
}

// Advance widths (1/1000 em) for character codes 32 to 126, from the Helvetica and Helvetica-Bold font metrics.
const W: Record<'R' | 'B', number[]> = {
  R: [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
    1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
    333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584],
  B: [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
    975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
    333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584],
}
type Face = 'R' | 'B'

/** Text the built-in fonts can draw: Latin-1 as is, typographic punctuation mapped, anything else (Arabic included) as "?". */
const PUNCT: Record<string, string> = { '‘': "'", '’': "'", '“': '"', '”': '"', '–': '-', '—': '-', '…': '...', ' ': ' ', ' ': ' ', ' ': ' ' }
export const latin = (s: string) => [...s.normalize('NFC')].map(c => PUNCT[c] ?? (c.charCodeAt(0) <= 0xff ? c : '?')).join('')
export const textWidth = (s: string, size: number, face: Face = 'R') => hasArabic(s)
  ? (() => { const f = ARABIC[face](); return shape(s).reduce((n, c) => n + f.advance(f.glyph(c) || f.glyph(0x3f)), 0) * size / f.unitsPerEm })()
  : [...latin(s)].reduce((n, c) => n + (W[face][c.charCodeAt(0) - 32] ?? 556), 0) * size / 1000
/** A string for the document's metadata: Latin as is, anything else as UTF-16. */
const pdfString = (s: string) => /^[\x20-\x7e]*$/.test(s) ? `(${esc(s)})` : `<feff${Buffer.from(s, 'utf16le').swap16().toString('hex')}>`
const esc = (s: string) => latin(s).replace(/[\\()]/g, m => '\\' + m).replace(/[\r\n]/g, ' ')

/** Break text into lines no wider than `width`, at spaces (a single overlong word is cut). */
export function wrap(s: string, width: number, size: number, face: Face = 'R') {
  const out: string[] = []
  for (const para of s.split('\n')) {
    let line = ''
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word
      if (textWidth(next, size, face) <= width) { line = next; continue }
      if (line) out.push(line)
      line = word
      while (textWidth(line, size, face) > width) { let i = line.length; while (i > 1 && textWidth(line.slice(0, i), size, face) > width) i--; out.push(line.slice(0, i)); line = line.slice(i) }
    }
    out.push(line)
  }
  return out
}

/** One page, drawn top-down: `y` counts from the top edge like a screen, and is flipped for PDF. */
export class Page {
  private ops: string[] = []
  // glyphs drawn from the embedded Arabic faces, with the text each stands for (widths and the copy-out map)
  private used: Record<Face, Map<number, string>> = { R: new Map(), B: new Map() }
  constructor(readonly width = 595.28, readonly height = 841.89) {}
  /** `rtl`: the line belongs to a right-to-left document, so a mixed line reads from the right. */
  text(s: string, x: number, y: number, size = 10, face: Face = 'R', grey = 0, rtl = false) {
    if (hasArabic(s)) {
      const glyphs = arabicGlyphs(s, face, rtl)
      for (const g of glyphs) if (!this.used[face].has(g.gid)) this.used[face].set(g.gid, SOURCE.get(g.code) ?? String.fromCodePoint(g.code))
      const hex = glyphs.map(g => g.gid.toString(16).padStart(4, '0')).join('')
      this.ops.push(`${grey} g BT /${face === 'B' ? 'F4' : 'F3'} ${size} Tf ${x.toFixed(2)} ${(this.height - y).toFixed(2)} Td <${hex}> Tj ET`)
      return
    }
    this.ops.push(`${grey} g BT /${face === 'B' ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(2)} ${(this.height - y).toFixed(2)} Td (${esc(s)}) Tj ET`)
  }
  right(s: string, xRight: number, y: number, size = 10, face: Face = 'R', grey = 0, rtl = false) { this.text(s, xRight - textWidth(s, size, face), y, size, face, grey, rtl) }
  rule(x1: number, y: number, x2: number, weight = 0.5, grey = 0.8) {
    this.ops.push(`${grey} G ${weight} w ${x1.toFixed(2)} ${(this.height - y).toFixed(2)} m ${x2.toFixed(2)} ${(this.height - y).toFixed(2)} l S`)
  }
  box(x: number, y: number, w: number, h: number, grey = 0.96) {
    this.ops.push(`${grey} g ${x.toFixed(2)} ${(this.height - y - h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`)
  }
  /** The finished file: catalog, page tree, the page, its fonts, the drawing, cross-reference table. */
  pdf(title: string) {
    const content = this.ops.join('\n')
    const objects: (string | Buffer)[] = []
    const add = (o: string | Buffer) => { objects.push(o); return objects.length } // object numbers start at 1
    const ref = (n: number) => `${n} 0 R`
    add('<< /Type /Catalog /Pages 2 0 R >>')
    add('<< /Type /Pages /Kids [3 0 R] /Count 1 >>')
    const page = add('') // filled in once the fonts have numbers
    const fonts = ['/F1 ' + ref(add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')),
      '/F2 ' + ref(add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'))]
    for (const face of ['R', 'B'] as Face[]) {
      if (!this.used[face].size) continue
      const f = ARABIC[face](), gids = [...this.used[face].keys()].sort((a, b) => a - b), k = 1000 / f.unitsPerEm
      const packed = f.deflated()
      const file = add(Buffer.concat([Buffer.from(`<< /Length ${packed.length} /Length1 ${f.file.length} /Filter /FlateDecode >>\nstream\n`, 'latin1'), packed, Buffer.from('\nendstream', 'latin1')]))
      const desc = add(`<< /Type /FontDescriptor /FontName /${f.name} /Flags 32 /FontBBox [${f.bbox.map(n => Math.round(n * k)).join(' ')}] /ItalicAngle 0 `
        + `/Ascent ${Math.round(f.ascent * k)} /Descent ${Math.round(f.descent * k)} /CapHeight ${Math.round(f.capHeight * k)} /StemV 80 /FontFile2 ${ref(file)} >>`)
      const widths = gids.map(g => `${g} [${Math.round(f.advance(g) * k)}]`).join(' ')
      const cid = add(`<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${f.name} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> `
        + `/FontDescriptor ${ref(desc)} /CIDToGIDMap /Identity /DW 500 /W [${widths}] >>`)
      const utf16 = (t: string) => Buffer.from(t, 'utf16le').swap16().toString('hex')
      const pairs = gids.map(g => `<${g.toString(16).padStart(4, '0')}> <${utf16(this.used[face].get(g)!)}>`)
      const chunks: string[] = []
      for (let n = 0; n < pairs.length; n += 100) chunks.push(`${Math.min(100, pairs.length - n)} beginbfchar\n${pairs.slice(n, n + 100).join('\n')}\nendbfchar`)
      const cmap = `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n`
        + `/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n${chunks.join('\n')}\n`
        + `endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend`
      const toUnicode = add(`<< /Length ${Buffer.byteLength(cmap, 'latin1')} >>\nstream\n${cmap}\nendstream`)
      fonts.push(`/${face === 'B' ? 'F4' : 'F3'} ` + ref(add(`<< /Type /Font /Subtype /Type0 /BaseFont /${f.name} /Encoding /Identity-H /DescendantFonts [${ref(cid)}] /ToUnicode ${ref(toUnicode)} >>`)))
    }
    const contents = add(`<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`)
    objects[page - 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.width} ${this.height}] /Resources << /Font << ${fonts.join(' ')} >> >> /Contents ${ref(contents)} >>`
    const info = add(`<< /Title ${pdfString(title)} /Producer (Nashr) >>`)
    const parts: Buffer[] = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')]
    let size = parts[0].length
    const offsets: number[] = []
    objects.forEach((o, i) => {
      offsets.push(size)
      const b = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`, 'latin1'), typeof o === 'string' ? Buffer.from(o, 'latin1') : o, Buffer.from('\nendobj\n', 'latin1')])
      parts.push(b); size += b.length
    })
    parts.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(n => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}`
      + `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${info} 0 R >>\nstartxref\n${size}\n%%EOF\n`, 'latin1'))
    return Buffer.concat(parts)
  }
}
