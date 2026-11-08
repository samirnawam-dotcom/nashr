/*
 * A document as a PDF, drawn on the server from the stored row (the row stays the record; this is only its rendering).
 * A small writer of our own, not a library: one A4 page per document, the two built-in Helvetica faces, text and rules.
 * ponytail: Latin text only. The built-in fonts cannot draw Arabic, so Arabic letters print as "?"; an Arabic PDF needs
 * an embedded font with shaping, and the printable page in the app already shows Arabic correctly.
 */

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
export const textWidth = (s: string, size: number, face: Face = 'R') =>
  [...latin(s)].reduce((n, c) => n + (W[face][c.charCodeAt(0) - 32] ?? 556), 0) * size / 1000
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
  constructor(readonly width = 595.28, readonly height = 841.89) {}
  text(s: string, x: number, y: number, size = 10, face: Face = 'R', grey = 0) {
    this.ops.push(`${grey} g BT /${face === 'B' ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(2)} ${(this.height - y).toFixed(2)} Td (${esc(s)}) Tj ET`)
  }
  right(s: string, xRight: number, y: number, size = 10, face: Face = 'R', grey = 0) { this.text(s, xRight - textWidth(s, size, face), y, size, face, grey) }
  rule(x1: number, y: number, x2: number, weight = 0.5, grey = 0.8) {
    this.ops.push(`${grey} G ${weight} w ${x1.toFixed(2)} ${(this.height - y).toFixed(2)} m ${x2.toFixed(2)} ${(this.height - y).toFixed(2)} l S`)
  }
  box(x: number, y: number, w: number, h: number, grey = 0.96) {
    this.ops.push(`${grey} g ${x.toFixed(2)} ${(this.height - y - h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`)
  }
  /** The finished file: catalog, page tree, the page, two fonts, the drawing, cross-reference table. */
  pdf(title: string) {
    const content = this.ops.join('\n')
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.width} ${this.height}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
      `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
      `<< /Title (${esc(title)}) /Producer (Nashr) >>`,
    ]
    let body = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'
    const offsets: number[] = []
    objects.forEach((o, i) => { offsets.push(Buffer.byteLength(body, 'latin1')); body += `${i + 1} 0 obj\n${o}\nendobj\n` })
    const xref = Buffer.byteLength(body, 'latin1')
    body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(n => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}`
    body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${objects.length} 0 R >>\nstartxref\n${xref}\n%%EOF\n`
    return Buffer.from(body, 'latin1')
  }
}
