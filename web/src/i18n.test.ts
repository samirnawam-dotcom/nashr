import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { AR } from './i18n-ar'

const SRC = new URL('.', import.meta.url).pathname
const files = (dir: string): string[] => readdirSync(dir).flatMap(f => { const p = join(dir, f); return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) && !/\.test\./.test(f) ? [p] : [] })
const strings = (re: RegExp) => files(SRC).flatMap(f => [...readFileSync(f, 'utf8').matchAll(re)].map(m => ({ file: f.slice(SRC.length), key: m[2].replace(/\\(['"])/g, '$1') })))

describe('Arabic', () => {
  test('every string marked with t() has an Arabic translation, with the same {placeholders}', () => {
    const used = strings(/\bt\(\s*(["'])((?:\\.|(?!\1).)*)\1/g)
    // Keys looked up at run time: the FAQ, time-of-day labels, view names and price labels from the server.
    const seo = readFileSync(join(SRC, 'seo.ts'), 'utf8'), faq = seo.slice(seo.indexOf('export const FAQ'), seo.indexOf(']\n\n', seo.indexOf('export const FAQ')))
    const dynamic = [...faq.matchAll(/'((?:\\'|[^'])+)'/g)].map(m => m[1].replace(/\\'/g, "'"))
      .concat(['Morning (5–12)', 'Afternoon (12–17)', 'Evening (17–24)', 'All day (pages, takeovers)', 'Day', 'Week', 'Month', 'Typical on Nashr', 'Estimate, unconfirmed', "Publisher's rate",
        '{n} positions', '{n} breaks', 'No slots match these filters this week.', 'No slots match these filters this day.', 'No slots match these filters this month.'])
    const missing = [...new Set([...used.map(u => u.key), ...dynamic])].filter(k => !(k in AR))
    expect(missing).toEqual([])
    const bad = Object.entries(AR).filter(([en, ar]) => [...en.matchAll(/\{\w+\}/g)].map(m => m[0]).sort().join() !== [...ar.matchAll(/\{\w+\}/g)].map(m => m[0]).sort().join())
    expect(bad).toEqual([])
  })
})
