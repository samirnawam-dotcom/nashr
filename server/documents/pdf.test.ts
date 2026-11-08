import { expect, test } from 'vitest'
import { Page, latin, textWidth, wrap } from './pdf.js'

test('text the built-in fonts cannot draw becomes "?"; typographic punctuation is mapped', () => {
  expect(latin('Café – “Nashr” نشر')).toBe('Café - "Nashr" ???')
})

test('lines wrap at spaces and never run past the width', () => {
  const lines = wrap('Skyline FM · Break 1 · Morning Markets · Order NSH-2026-000123 and a long tail of words', 150, 10)
  expect(lines.length).toBeGreaterThan(1)
  for (const l of lines) expect(textWidth(l, 10)).toBeLessThanOrEqual(150)
})

test('a page is a well-formed PDF: the cross-reference offsets point at each object', () => {
  const p = new Page(); p.text('Tax invoice (copy)', 50, 60, 20, 'B'); p.rule(50, 70, 545)
  const pdf = p.pdf('Test').toString('latin1')
  expect(pdf).toContain('(Tax invoice \\(copy\\)) Tj')
  const start = Number(pdf.match(/startxref\n(\d+)/)![1])
  expect(pdf.slice(start, start + 4)).toBe('xref')
  const offsets = pdf.slice(start).match(/^\d{10} 00000 n $/gm)!.map(l => Number(l.slice(0, 10)))
  offsets.forEach((o, i) => expect(pdf.slice(o, o + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`))
})
