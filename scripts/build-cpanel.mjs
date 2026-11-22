// Builds the package for cPanel shared hosting (Namecheap "Setup Node.js App"): no npm install and no TypeScript on the server.
//   VITE_SITE_URL=https://nashr.pro node scripts/build-cpanel.mjs   ->  release/nashr-cpanel.zip
// Inside: app.js (the startup file cPanel asks for), server/*.mjs (each a single file with its libraries), migrations/,
// site/ (the built website, served by the app itself), and package.json with the one-off commands (seed, demo sign-ins, migrate).
import { execSync } from 'node:child_process'
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { build } from 'esbuild'

const out = 'release/nashr'
const site = process.env.VITE_SITE_URL ?? 'https://nashr.pro'
rmSync('release', { recursive: true, force: true })
mkdirSync(`${out}/server`, { recursive: true })

execSync('npm run -s build:web', { stdio: 'inherit', env: { ...process.env, VITE_SITE_URL: site } })
cpSync('dist/web', `${out}/site`, { recursive: true })

// One file per command. pg's optional native driver is never used. `require` is provided for the CommonJS libraries inside.
const entries = { main: 'server/main.ts', seed: 'server/seed.ts', migrate: 'server/core/migrate.ts',
  'demo-credentials': 'scripts/demo-credentials.ts', 'invite-staff': 'scripts/invite-staff.ts' }
for (const [name, entry] of Object.entries(entries))
  await build({ entryPoints: [entry], outfile: `${out}/server/${name}.mjs`, bundle: true, platform: 'node', target: 'node22', format: 'esm',
    external: ['pg-native'], legalComments: 'none', logLevel: 'warning',
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } })

// files the server reads beside its own code (paths as the bundles expect them)
cpSync('server/migrations', `${out}/migrations`, { recursive: true })
cpSync('server/documents/fonts', `${out}/server/fonts`, { recursive: true })
mkdirSync(`${out}/web/public/brand`, { recursive: true })
cpSync('web/public/brand/print-card.jpg', `${out}/web/public/brand/print-card.jpg`) // the demo bookings' sample creative

writeFileSync(`${out}/app.js`, `// Startup file for cPanel "Setup Node.js App" (Phusion Passenger). The server itself is server/main.mjs.
import('./server/main.mjs').catch(e => { console.error(e); process.exit(1) })
`)
writeFileSync(`${out}/package.json`, JSON.stringify({
  name: 'nashr', private: true, description: 'Nashr, built for cPanel shared hosting (no dependencies to install)',
  scripts: {
    migrate: 'node server/migrate.mjs',
    seed: 'node server/seed.mjs',
    'demo-credentials': 'node server/demo-credentials.mjs',
  },
}, null, 2) + '\n')
writeFileSync(`${out}/VERSION.txt`, `${execSync('git rev-parse --short HEAD').toString().trim()} built ${new Date().toISOString()} for ${site}\n`)

execSync('zip -qr nashr-cpanel.zip nashr', { cwd: 'release' })
console.log(`release/nashr-cpanel.zip (${execSync('du -h release/nashr-cpanel.zip').toString().split('\t')[0]}) for ${site}`)
