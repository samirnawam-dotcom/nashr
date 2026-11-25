/*
 * Forgiving spelling for Athena, in English and Arabic, with no outside service.
 *  - Arabic: the usual spelling variants count as the same letter (أ إ آ ا, ة ه, ى ي, ؤ و, ئ ي), tashkeel and tatweel go;
 *    attached و ب ل ال are recognised when comparing.
 *  - Both: a word Athena does not know is matched to the nearest word it does ("raido" → radio, "bnak" → bank,
 *    "decmber" → december, "ديسمبير" → ديسمبر): one slip for short words, two for long ones, a swapped pair counts as one.
 *    Everyday words are never "corrected", and when two known words are equally near, Athena leaves the word as written.
 * Shared by the server and the screens.
 */

/** Arabic letters in one spelling: hamza forms, taa marbuta, alef maqsura, no tashkeel or tatweel. Latin is untouched. */
export const arNorm = (s: string) => s.replace(/[ً-ْٰـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
  .replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')

/** Edit distance where swapping two neighbouring letters counts as one slip (Damerau). Stops early past `max`. */
export function slips(a: string, b: string, max = 2) {
  if (Math.abs(a.length - b.length) > max) return max + 1
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    let best = Infinity
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
      best = Math.min(best, d[i][j])
    }
    if (best > max) return max + 1
  }
  return d[a.length][b.length]
}

const AR = /[؀-ۿ]/
const PREFIXES = ['وال', 'بال', 'لل', 'فال', 'كال', 'ال', 'و', 'ب', 'ل', 'ف']
/** The word and the word without its attached و ب ل ال (longest first), for comparing Arabic. */
const arForms = (w: string) => [w, ...PREFIXES.filter(p => w.startsWith(p) && w.length - p.length >= 3).map(p => w.slice(p.length))]

// Everyday English that must never be changed into something else ("back" is not "bank", "money" is not "monday").
const EVERYDAY = new Set(('about above after again against all also always among another any are around back been before being below best better between both bring brand brands ' +
  'business but buy call came can come could cost costs daily day days does done down during each early else end even every first five for four from full get give good great ' +
  'have help here high home hour hours how into just keep kind know large last late least less like little live local long look lots made main make many may maybe more most ' +
  'much must name near need never new news next nice night none not now number off often once one only open other our out over own part people place plan please plus price prices ' +
  'quick quite rather real really right same save says send seven several should show side since six small some soon start still such sure take than that their them then there ' +
  'these they thing things think this those three through time times today together total try two under until upon very want week weeks well were what when where which while ' +
  'who whole will with within without work would year years your money monday month months mostly target targeting reach run running spend spending around under over ' +
  'between want looking need wants need needs best cheap cheaper cheapest more less only also with without show find give list ' +
  'sale sales offer offers deal deals book booking bookings slot slots spot spots page pages size people person team teams group').split(' '))

export type Fix = { from: string; to: string }

/** A spelling helper over a vocabulary: `fix(text)` returns the text with unknown words replaced by their nearest known word. */
export function speller(vocab: Iterable<string>) {
  const words = [...new Set([...vocab].map(w => arNorm(w.toLowerCase())).filter(w => w.length >= 3))]
  const known = new Set(words)
  const nearest = (w: string): string | null => {
    const ar = AR.test(w)
    if (w.length < 4 || /\d/.test(w)) return null
    if (!ar && EVERYDAY.has(w)) return null
    const forms = ar ? arForms(w) : [w]
    // already known: the word itself, an Arabic stem it starts with, or an English word plus an ending ("banking", "launches")
    if (forms.some(f => known.has(f) || (ar ? words.some(k => k.length >= 3 && f.startsWith(k)) : words.some(k => k.length >= 4 && f.startsWith(k) && f.length - k.length <= 3)))) return null
    let best: string | null = null, bestD = 9, tie = false
    for (const f of forms) {
      // short words: only a swapped pair ("bnak"); 5–7 letters: one slip; 8 or more: two
      const max = f.length <= 4 ? 1 : f.length <= 7 ? 1 : 2
      for (const k of words) {
        if (AR.test(k) !== ar || Math.abs(k.length - f.length) > max) continue
        const d = slips(f, k, max)
        if (d > max) continue
        if (f.length <= 4 && !(d === 1 && f.length === k.length && [...f].sort().join('') === [...k].sort().join(''))) continue
        const prefix = f === w ? '' : w.slice(0, w.length - f.length)
        const cand = prefix + k
        if (d < bestD) { best = cand; bestD = d; tie = false } else if (d === bestD && cand !== best) tie = true
      }
    }
    return tie ? null : best
  }
  return function fix(text: string): { text: string; fixes: Fix[] } {
    const fixes: Fix[] = []
    const out = text.replace(/[a-z؀-ۿ]+/g, w => { const n = nearest(w); if (n && n !== w) { fixes.push({ from: w, to: n }); return n } return w })
    return { text: out, fixes }
  }
}

/** The words a list of patterns knows: every run of 3+ letters in their sources (English and Arabic). */
export const wordsOf = (patterns: (RegExp | string)[]) =>
  patterns.flatMap(p => (typeof p === 'string' ? p : p.source).toLowerCase().match(/[a-z]{3,}|[؀-ۿ]{3,}/g) ?? [])
    .flatMap(w => /^[a-z]{5,}s$/.test(w) ? [w, w.slice(0, -1)] : [w]) // "magazines?" knows "magazine" too
