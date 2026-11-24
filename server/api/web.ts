import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { PRELAUNCH_ROBOTS, prelaunch } from './launch.js'

/*
 * The built web app (dist/web), served by the API itself where no nginx sits in front (cPanel shared hosting: Passenger hands
 * every request to the app). Same rules as the nginx config in scripts/deploy-vps.sh: the file itself, then "<path>.html"
 * (pre-rendered pages), then "<path>/index.html", then app.html for every other page; /assets/ is cached for a year.
 * Each page gets the site's content security policy, with hashes for exactly the inline styles that page carries.
 */
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml', '.mp4': 'video/mp4', '.pdf': 'application/pdf',
}
const sha = (s: string) => `'sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}'`

/** The policy for one HTML page: our own files and Stripe only; inline styles only by hash. */
export function pageCsp(html: string) {
  const blocks = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => sha(m[1]))
  const attrs = [...new Set([...html.matchAll(/\sstyle="([^"]*)"/g)].map(m => m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')))].map(sha)
  const style = ["'self'", ...blocks, ...(attrs.length ? ["'unsafe-hashes'", ...attrs] : [])].join(' ')
  return `default-src 'self'; script-src 'self' https://js.stripe.com; frame-src https://js.stripe.com https://hooks.stripe.com; `
    + `connect-src 'self' https://api.stripe.com; style-src ${style}; font-src 'self'; img-src 'self' data: blob: https://*.stripe.com; `
    + `media-src 'self' blob:; worker-src 'self'; manifest-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`
}

export function serveWeb(app: FastifyInstance, root: string) {
  const base = normalize(root + sep)
  const csp = new Map<string, string>()
  const file = (rel: string) => {
    const p = normalize(join(base, rel))
    if (!p.startsWith(base)) return null // no way out of the web folder
    try { return statSync(p).isFile() ? p : null } catch { return null }
  }
  const resolve = (path: string) => {
    const clean = decodeURIComponent(path.split('?')[0]).replace(/\/+$/, '') || '/index'
    if (prelaunch() && !extname(clean)) return file('/app.html') // before release: no pre-rendered pages, only the app (which shows Coming soon)
    return file(clean) ?? file(`${clean}.html`) ?? file(`${clean}/index.html`) ?? (extname(clean) ? null : file('/app.html'))
  }

  // the live sitemap (every outlet) comes from the API, as nginx did
  app.get('/sitemap.xml', async (_req, reply) => {
    const r = await app.inject({ method: 'GET', url: '/api/sitemap.xml' })
    reply.code(r.statusCode).type(String(r.headers['content-type'] ?? 'application/xml')).send(r.body)
  })

  app.setNotFoundHandler(async (req, reply) => {
    if (prelaunch() && req.url.split('?')[0] === '/robots.txt')
      return reply.type('text/plain; charset=utf-8').header('cache-control', 'no-cache').send(PRELAUNCH_ROBOTS)
    // before release a pre-rendered page asked for by name (/terms.html) gets the app shell too
    const url = prelaunch() && /\.html$/.test(req.url.split('?')[0]) ? '/' : req.url
    if (req.url.startsWith('/api/') || (req.method !== 'GET' && req.method !== 'HEAD')) return reply.code(404).send({ error: 'Not found.' })
    let p: string | null
    try { p = resolve(url) } catch { p = null } // a malformed %-escape
    if (!p) return reply.code(404).type('text/plain; charset=utf-8').send('Not found.')
    const type = TYPES[extname(p).toLowerCase()] ?? 'application/octet-stream'
    reply.type(type)
    if (req.url.startsWith('/assets/')) reply.header('cache-control', 'public, max-age=31536000, immutable')
    else reply.header('cache-control', 'no-cache') // pages, the service worker and the theme script are checked on every visit
    if (type.startsWith('text/html')) {
      const html = readFileSync(p, 'utf8')
      if (!csp.has(p)) csp.set(p, pageCsp(html))
      reply.header('content-security-policy', csp.get(p)!).header('x-frame-options', 'DENY')
      return reply.send(html)
    }
    return reply.send(readFileSync(p))
  })
}

/** Where the built web app is: WEB_DIR, or site/ beside the bundled server on shared hosting; none in development (Vite serves it). */
export function webDir() {
  const bundled = fileURLToPath(new URL('../site/', import.meta.url)) // the shared-hosting bundle: server/main.mjs beside site/
  for (const dir of [process.env.WEB_DIR, bundled]) if (dir && existsSync(join(dir, 'index.html'))) return dir
  return null
}
