import { afterEach, expect, test } from 'vitest'
import Fastify from 'fastify'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { serveWeb } from './web.js'

// Test mode (TESTING=1): the site is open to everyone, but search engines are kept out of every page.
const site = () => { const dir = mkdtempSync(join(tmpdir(), 'nashr-web-')); writeFileSync(join(dir, 'app.html'), '<!doctype html><title>Nashr</title>'); writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Home</title>'); return dir }
afterEach(() => { delete process.env.TESTING; delete process.env.PRELAUNCH })

test('test mode keeps search engines out, the site stays open', async () => {
  process.env.TESTING = '1'
  const app = Fastify(); serveWeb(app, site()); await app.ready()
  const robots = await app.inject({ method: 'GET', url: '/robots.txt' })
  expect(robots.body).toContain('Disallow: /')
  const home = await app.inject({ method: 'GET', url: '/' })
  expect(home.statusCode).toBe(200)
  expect(home.body).toContain('Home') // the real pre-rendered page, not the Coming soon shell
  expect(home.headers['x-robots-tag']).toBe('noindex, nofollow')
  await app.close()
})

test('normal mode: pages can be indexed', async () => {
  const app = Fastify(); serveWeb(app, site()); await app.ready()
  const home = await app.inject({ method: 'GET', url: '/' })
  expect(home.statusCode).toBe(200)
  expect(home.headers['x-robots-tag']).toBeUndefined()
  await app.close()
})
