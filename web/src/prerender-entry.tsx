// Build-time only (scripts/prerender.ts): render a public page to HTML as a visitor would see it before JavaScript runs.
import { renderToString } from 'react-dom/server'
import { App } from './App'

export function render(path: string, origin: string) {
  const g = globalThis as any
  g.location = { pathname: path, search: '', hash: '', origin, href: origin + path }
  return renderToString(<App initialMe={null} />)
}
