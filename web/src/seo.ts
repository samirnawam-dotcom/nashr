import { useEffect } from 'react'

/*
 * Search and share metadata for every page: title, description, canonical address, Open Graph / X cards, robots,
 * and structured data (JSON-LD). Public pages are indexed; anything behind sign-in is "noindex".
 * The same table is used at build time to write the pre-rendered HTML (scripts/prerender.ts).
 */
export const SITE_NAME = 'Nashr'
export type Meta = { title: string; description: string; noindex?: boolean; jsonLd?: object[]; path?: string }

export const PAGES: Record<string, Meta> = {
  '/': {
    title: 'Nashr: book UAE radio, TV, print, digital and podcast advertising',
    description: 'Bid on radio breaks, TV spots, print pages, homepage takeovers and podcast reads from UAE publishers. Prices in AED, payment held until the ad runs.',
  },
  '/calendar': {
    title: 'UAE advertising calendar: radio, TV, print and digital slots | Nashr',
    description: 'Every bookable radio break, TV spot, print page, homepage takeover and podcast read in the UAE, by day, week or month, with live bids and buy-now prices.',
  },
  '/directory': {
    title: 'UAE media directory: advertising rates for radio, TV, print and digital | Nashr',
    description: 'Compare UAE media outlets and their advertising prices: typical prices on Nashr, publisher rates and estimates. Book online or request a quote.',
  },
  '/request-access': {
    title: 'Request access to Nashr, the UAE media marketplace',
    description: 'Nashr is invite-only for UAE brands, agencies and media outlets. Request an invite to bid on advertising or sell your inventory.',
  },
  '/terms': { title: 'Terms of use | Nashr', description: 'The terms for buying and selling advertising on Nashr, the UAE media marketplace.' },
  '/privacy': { title: 'Privacy policy | Nashr', description: 'What personal data Nashr collects, why, and your rights under the UAE Personal Data Protection Law.' },
  '/dispute-policy': { title: 'Disputes and payment protection | Nashr', description: 'How an issue between a buyer and a publisher is resolved on Nashr: the payment stays held, each side puts its case, and Nashr decides within five working days.' },
  '/refunds': { title: 'Refunds and cancellations | Nashr', description: 'How cancellations and refunds work on Nashr: free within 24 hours, then a 15% fee, and full refunds if the ad does not run.' },
  '/sign-in': { title: 'Sign in | Nashr', description: 'Sign in to Nashr.', noindex: true },
}

export const FAQ: [string, string][] = [
  ['What is Nashr?', 'Nashr is an online marketplace where UAE brands and agencies book advertising directly from radio stations, TV channels, newspapers, websites and podcasts.'],
  ['How do I buy advertising on Nashr?', 'Find a slot on the calendar or in the directory, place a bid or request the buy-now price, and send your brief. Nothing is charged until the publisher accepts; then you pay within 48 hours.'],
  ['Is my payment safe?', 'Your payment is held by Nashr, not the publisher. The publisher is paid only after you approve proof that the ad ran, or automatically after five working days.'],
  ['Are prices shown with VAT?', 'Prices are shown excluding VAT. Where the publisher is VAT-registered, 5% VAT is added at payment and shown before you pay.'],
  ['Can I cancel a booking?', 'Yes. Cancelling within 24 hours of paying is free apart from the card processing cost; after that a 15% cancellation fee applies, and there is no refund after the creative deadline.'],
  ['How do publishers sell on Nashr?', 'Publishers list programmes, breaks, pages or placements with a starting price, reserve and buy-now price, accept the bookings they want, and are paid after the buyer approves proof.'],
]

// The official address (set at build time), so canonical links never point at http://, an IP or a preview host.
export const siteUrl = () => ((import.meta.env.VITE_SITE_URL as string | undefined) ?? (typeof location !== 'undefined' ? location.origin : '')).replace(/\/$/, '')

function setTag(selector: string, make: () => HTMLElement, attr: string, value: string | null) {
  let el = document.head.querySelector(selector) as HTMLElement | null
  if (value === null) { el?.remove(); return }
  if (!el) { el = make(); document.head.appendChild(el) }
  el.setAttribute(attr, value)
}
export function applyMeta(m: Meta) {
  const url = siteUrl() + (m.path ?? location.pathname)
  document.title = m.title
  for (const [key, k, v] of [['name', 'description', m.description], ['property', 'og:title', m.title], ['property', 'og:description', m.description],
    ['property', 'og:url', url], ['name', 'twitter:title', m.title], ['name', 'twitter:description', m.description],
    ['name', 'robots', m.noindex ? 'noindex, nofollow' : 'index, follow']] as const) {
    setTag(`meta[${key}="${k}"]`, () => { const e = document.createElement('meta'); e.setAttribute(key, k); return e }, 'content', v)
  }
  setTag('link[rel="canonical"]', () => { const e = document.createElement('link'); e.setAttribute('rel', 'canonical'); return e }, 'href', m.noindex ? null : url)
  document.head.querySelectorAll('script[data-page-ld]').forEach(s => s.remove())
  for (const ld of m.jsonLd ?? []) {
    const s = document.createElement('script'); s.type = 'application/ld+json'; s.dataset.pageLd = ''; s.textContent = JSON.stringify(ld); document.head.appendChild(s)
  }
}
/** Set this page's search and share metadata while it is shown. */
export function useMeta(m: Meta | null, deps: unknown[] = []) {
  useEffect(() => { if (m) applyMeta(m) }, deps) // eslint-disable-line react-hooks/exhaustive-deps
}

export const breadcrumb = (items: [string, string][]) => ({
  '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: siteUrl() + path })),
})

export const faqLd = () => ({
  '@context': 'https://schema.org', '@type': 'FAQPage',
  mainEntity: FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
})

/** The outlet's address segment: "Gulf News" → "gulf-news" (the server resolves the same rule). */
export const outletSlug = (o: { id: string; name: string }) => o.name.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || o.id
