/*
 * Arabic for the PDFs, without a shaping engine: letters take their joined forms from Unicode's presentation forms
 * (which the embedded font maps), lam + alef become one ligature, and mixed Arabic and English text is put in display
 * order by a reduced form of the Unicode bidi algorithm (one paragraph, no explicit embeddings).
 */

// Isolated, final, initial, medial; right-joining letters (alef, dal, reh, waw...) have only the first two.
const FORMS: Record<number, number[]> = {
  0x0621: [0xfe80], 0x0622: [0xfe81, 0xfe82], 0x0623: [0xfe83, 0xfe84], 0x0624: [0xfe85, 0xfe86], 0x0625: [0xfe87, 0xfe88],
  0x0626: [0xfe89, 0xfe8a, 0xfe8b, 0xfe8c], 0x0627: [0xfe8d, 0xfe8e], 0x0628: [0xfe8f, 0xfe90, 0xfe91, 0xfe92], 0x0629: [0xfe93, 0xfe94],
  0x062a: [0xfe95, 0xfe96, 0xfe97, 0xfe98], 0x062b: [0xfe99, 0xfe9a, 0xfe9b, 0xfe9c], 0x062c: [0xfe9d, 0xfe9e, 0xfe9f, 0xfea0],
  0x062d: [0xfea1, 0xfea2, 0xfea3, 0xfea4], 0x062e: [0xfea5, 0xfea6, 0xfea7, 0xfea8], 0x062f: [0xfea9, 0xfeaa], 0x0630: [0xfeab, 0xfeac],
  0x0631: [0xfead, 0xfeae], 0x0632: [0xfeaf, 0xfeb0], 0x0633: [0xfeb1, 0xfeb2, 0xfeb3, 0xfeb4], 0x0634: [0xfeb5, 0xfeb6, 0xfeb7, 0xfeb8],
  0x0635: [0xfeb9, 0xfeba, 0xfebb, 0xfebc], 0x0636: [0xfebd, 0xfebe, 0xfebf, 0xfec0], 0x0637: [0xfec1, 0xfec2, 0xfec3, 0xfec4],
  0x0638: [0xfec5, 0xfec6, 0xfec7, 0xfec8], 0x0639: [0xfec9, 0xfeca, 0xfecb, 0xfecc], 0x063a: [0xfecd, 0xfece, 0xfecf, 0xfed0],
  0x0641: [0xfed1, 0xfed2, 0xfed3, 0xfed4], 0x0642: [0xfed5, 0xfed6, 0xfed7, 0xfed8], 0x0643: [0xfed9, 0xfeda, 0xfedb, 0xfedc],
  0x0644: [0xfedd, 0xfede, 0xfedf, 0xfee0], 0x0645: [0xfee1, 0xfee2, 0xfee3, 0xfee4], 0x0646: [0xfee5, 0xfee6, 0xfee7, 0xfee8],
  0x0647: [0xfee9, 0xfeea, 0xfeeb, 0xfeec], 0x0648: [0xfeed, 0xfeee], 0x0649: [0xfeef, 0xfef0], 0x064a: [0xfef1, 0xfef2, 0xfef3, 0xfef4],
  // letters used in Persian and Urdu names
  0x0671: [0xfb50, 0xfb51], 0x067e: [0xfb56, 0xfb57, 0xfb58, 0xfb59], 0x0686: [0xfb7a, 0xfb7b, 0xfb7c, 0xfb7d], 0x0698: [0xfb8a, 0xfb8b],
  0x06a9: [0xfb8e, 0xfb8f, 0xfb90, 0xfb91], 0x06af: [0xfb92, 0xfb93, 0xfb94, 0xfb95], 0x06cc: [0xfbfc, 0xfbfd, 0xfbfe, 0xfbff],
}
// lam followed by one of these alefs is drawn as one ligature: isolated, final
const LAM_ALEF: Record<number, number[]> = { 0x0622: [0xfef5, 0xfef6], 0x0623: [0xfef7, 0xfef8], 0x0625: [0xfef9, 0xfefa], 0x0627: [0xfefb, 0xfefc] }
const TATWEEL = 0x0640

/** What each drawn character stands for, so text copied out of the PDF is ordinary Arabic. */
export const SOURCE = new Map<number, string>()
for (const [c, forms] of Object.entries(FORMS)) for (const f of forms) SOURCE.set(f, String.fromCodePoint(Number(c)))
for (const [a, forms] of Object.entries(LAM_ALEF)) for (const f of forms) SOURCE.set(f, 'ل' + String.fromCodePoint(Number(a)))

const isMark = (c: number) => (c >= 0x064b && c <= 0x065f) || c === 0x0670 || (c >= 0x06d6 && c <= 0x06ed)
const dual = (c: number) => (FORMS[c]?.length === 4) || c === TATWEEL
const joins = (c: number) => !!FORMS[c] && c !== 0x0621 || c === TATWEEL // can connect to the letter before it
export const isArabic = (c: number) => (c >= 0x0600 && c <= 0x06ff) || (c >= 0x0750 && c <= 0x077f) || (c >= 0xfb50 && c <= 0xfdff) || (c >= 0xfe70 && c <= 0xfeff)
export const hasArabic = (s: string) => [...s].some(ch => isArabic(ch.codePointAt(0)!))

/** Logical-order text with Arabic letters replaced by their joined forms. */
export function shape(text: string): number[] {
  const cs = [...text].map(ch => ch.codePointAt(0)!), out: number[] = []
  const prevLetter = (i: number) => { for (let j = i - 1; j >= 0; j--) if (!isMark(cs[j])) return cs[j]; return null }
  const nextLetter = (i: number) => { for (let j = i + 1; j < cs.length; j++) if (!isMark(cs[j])) return { c: cs[j], at: j }; return null }
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i], forms = FORMS[c]
    if (!forms || c === TATWEEL) { out.push(c); continue }
    const before = prevLetter(i), linkedBefore = before != null && dual(before) && joins(c)
    const next = nextLetter(i)
    if (c === 0x0644 && next && LAM_ALEF[next.c]) { // lam-alef: one glyph, joined to what comes before when it can be
      out.push(LAM_ALEF[next.c][linkedBefore ? 1 : 0])
      for (let j = i + 1; j < next.at; j++) out.push(cs[j]) // keep any marks on the lam
      i = next.at; continue
    }
    const linkedAfter = forms.length === 4 && next != null && joins(next.c)
    out.push(linkedBefore && linkedAfter ? forms[3] : linkedBefore ? forms[1] : linkedAfter ? forms[2] : forms[0])
  }
  return out
}

// Bidi classes, reduced: strong right-to-left, strong left-to-right, numbers, and everything else.
type Cls = 'R' | 'L' | 'N' | 'EN'
const cls = (c: number): Cls => isArabic(c) && !(c >= 0x0660 && c <= 0x0669) && !(c >= 0x06f0 && c <= 0x06f9) ? 'R'
  : (c >= 0x30 && c <= 0x39) || (c >= 0x0660 && c <= 0x0669) || (c >= 0x06f0 && c <= 0x06f9) ? 'EN'
  : (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a) || (c >= 0xc0 && c <= 0x24f) ? 'L' : 'N'
const SEPARATORS = new Set([0x2d, 0x2b, 0x2c, 0x2e, 0x2f, 0x3a, 0x060c])
const MIRROR: Record<number, number> = { 0x28: 0x29, 0x29: 0x28, 0x5b: 0x5d, 0x5d: 0x5b, 0x7b: 0x7d, 0x7d: 0x7b, 0x3c: 0x3e, 0x3e: 0x3c }

/**
 * One line in display order (left to right on the page). The paragraph takes the direction of its first strong letter,
 * unless the document sets it (an Arabic document reads every line right to left).
 */
export function visual(codes: number[], direction?: 'rtl' | 'ltr'): number[] {
  const types = codes.map(cls)
  const first = types.find(t => t === 'R' || t === 'L'), base = direction ? (direction === 'rtl' ? 1 : 0) : first === 'R' ? 1 : 0
  // a single separator between two digits belongs to the number (2026-11-15, 1,000.50)
  for (let i = 1; i < types.length - 1; i++)
    if (types[i] === 'N' && SEPARATORS.has(codes[i]) && types[i - 1] === 'EN' && types[i + 1] === 'EN') types[i] = 'EN'
  // digits after an English word read with it (Order NSH-2026-008551)
  for (let i = 0, last: Cls | null = base ? 'R' : 'L'; i < types.length; i++) {
    if (types[i] === 'L' || types[i] === 'R') last = types[i]
    else if (types[i] === 'EN' && last === 'L') types[i] = 'L'
  }
  // neutrals between two letters of the same direction take it (numbers count as right-to-left here); others take the paragraph's
  const strong = (t: Cls) => t === 'L' ? 'L' : t === 'R' || t === 'EN' ? 'R' : null
  const levels = types.map((t, i) => {
    if (t === 'R') return 1
    if (t === 'L') return base === 1 ? 2 : 0
    if (t === 'EN') return base === 1 ? 2 : (prevStrong(i) === 'R' ? 2 : 0)
    const a = prevStrong(i) ?? (base ? 'R' : 'L'), b = nextStrong(i) ?? (base ? 'R' : 'L')
    return a === b ? (a === 'R' ? 1 : base === 1 ? 2 : 0) : base
  })
  function prevStrong(i: number) { for (let j = i - 1; j >= 0; j--) { if (types[j] === 'EN') continue; const s = strong(types[j]); if (s) return s } return null }
  function nextStrong(i: number) { for (let j = i + 1; j < types.length; j++) { if (types[j] === 'EN') continue; const s = strong(types[j]); if (s) return s } return null }
  // reverse every run at or above each level, from the highest down to 1
  const out = codes.map((c, i) => (levels[i] % 2 && MIRROR[c]) ? MIRROR[c] : c), lv = [...levels]
  for (let level = Math.max(...lv, 0); level >= 1; level--) {
    for (let i = 0; i < out.length;) {
      if (lv[i] < level) { i++; continue }
      let j = i; while (j < out.length && lv[j] >= level) j++
      out.splice(i, j - i, ...out.slice(i, j).reverse()); lv.splice(i, j - i, ...lv.slice(i, j).reverse())
      i = j
    }
  }
  return out
}
