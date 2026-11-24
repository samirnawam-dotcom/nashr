// After `vite build`: write real HTML for the public pages (landing, legal, request access) plus robots.txt,
// so search engines and link previews get full content and the right title, description and canonical address
// without running JavaScript. The app then starts on top of it as usual.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const root = fileURLToPath(new URL('../', import.meta.url))
const dist = `${root}dist/web/`
const SITE = (process.env.VITE_SITE_URL ?? 'https://nashr.restbits.online').trim().replace(/\/$/, '')
if (!SITE.startsWith('http')) throw new Error('Set VITE_SITE_URL, e.g. https://nashr.restbits.online')

const vite = await createServer({ configFile: `${root}web/vite.config.ts`, server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' })
try {
  const { render } = await vite.ssrLoadModule('/src/prerender-entry.tsx')
  const { PAGES, faqLd } = await vite.ssrLoadModule('/src/seo.ts')
  const built = readFileSync(`${dist}index.html`, 'utf8')
  const attr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
  // Before release (PRELAUNCH=1): no page content in the HTML, and search engines are asked to stay away.
  const pre = /^(1|true|yes|on)$/i.test((process.env.PRELAUNCH ?? '').trim())
  // the shell says no more than the name while the site is behind Coming soon
  const soon = 'Nashr is coming soon.'
  const template = !pre ? built : built
    .replace(/<title>.*?<\/title>/, '<title>Nashr</title>')
    .replace(/(<meta (?:name|property)="(?:description|og:description|twitter:description)" content=")[^"]*/g, `$1${soon}`)
    .replace(/(<meta (?:property|name)="(?:og:title|twitter:title)" content=")[^"]*/g, '$1Nashr')
    .replace(/(<meta name="robots" content=")[^"]*/, '$1noindex, nofollow')
    .replace(/<script type="application\/ld\+json"[\s\S]*?<\/script>\s*/g, '')
  if (pre) writeFileSync(`${dist}index.html`, template)
  const pages = pre ? [] : ['/', '/terms', '/privacy', '/refunds', '/request-access']
  for (const path of pages) {
    const m = PAGES[path], url = SITE + path
    let html = template
      .replace(/<title>.*?<\/title>/, `<title>${attr(m.title)}</title>`)
      .replace(/(<meta name="description" content=")[^"]*/, `$1${attr(m.description)}`)
      .replace(/(<link rel="canonical" href=")[^"]*/, `$1${url}`)
      .replace(/(<meta property="og:url" content=")[^"]*/, `$1${url}`)
      .replace(/(<meta property="og:title" content=")[^"]*/, `$1${attr(m.title)}`)
      .replace(/(<meta property="og:description" content=")[^"]*/, `$1${attr(m.description)}`)
      .replace(/(<meta name="twitter:title" content=")[^"]*/, `$1${attr(m.title)}`)
      .replace(/(<meta name="twitter:description" content=")[^"]*/, `$1${attr(m.description)}`)
      .replace('<div id="root"></div>', `<div id="root">${render(path, SITE)}</div>`)
    if (path === '/') html = html.replace('</head>', `<script type="application/ld+json" data-page-ld>${JSON.stringify(faqLd()).replace(/</g, '\\u003c')}</script>\n</head>`)
    writeFileSync(`${dist}${path === '/' ? 'index' : path.slice(1)}.html`, html)
  }
  // The plain app shell for every other address (calendar, directory, signed-in screens): same tags, nothing pre-rendered.
  writeFileSync(`${dist}app.html`, template)
  writeFileSync(`${dist}robots.txt`, pre ? 'User-agent: *\nDisallow: /\n' : [
    'User-agent: *', 'Allow: /',
    ...['/api/', '/sign-in', '/invite', '/bookings', '/campaigns', '/documents', '/athena', '/home', '/inbox', '/schedule', '/slots', '/deals',
      '/earnings', '/listings', '/profile', '/admin', '/access', '/accounts', '/disputes', '/funds', '/payouts', '/reports', '/audit', '/settings'].map(p => `Disallow: ${p}`),
    '', `Sitemap: ${SITE}/sitemap.xml`, ''].join('\n'))
  console.log(pre ? 'Coming soon mode: no pages pre-rendered, robots.txt keeps search engines out' : `Pre-rendered ${pages.length} pages for ${SITE}`)
} finally { await vite.close() }
