import { tm } from './i18n-server'
// Thin wrapper over the API. The server decides everything; the screens only show what it returns.
/** `message` is shown to the person (in their language); `raw` is the server's English text, for code that checks what went wrong. */
export class ApiError extends Error { constructor(message: string, public status: number, public raw = message) { super(message) } }

export async function api<T = any>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const r = await fetch(`/api${path}`, {
    method: init?.method ?? 'GET', credentials: 'same-origin',
    headers: init?.body ? { 'content-type': 'application/json' } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new ApiError(tm(data.error ?? 'Something went wrong.'), r.status, data.error ?? '')
  return data
}

export type Slot = { brand?: string; title?: string; reach?: number | null; reachUnit?: string | null; notes?: string | null; outletId?: string; logoUrl?: string | null;
  id: string; outlet: string; channel: string; sectors: string[]; audience: string | null; placement: string; label: string; kind: 'single' | 'any' | 'package'
  saleType: 'auction' | 'quick_sale' | 'fixed'; startsAt: string; endsAt: string | null; closesAt: string; currency: string
  startingPrice: number; buyNowPrice: number | null; topBid: number | null; bids: number; available: boolean; youLead: boolean; youBid: boolean
}

/** Upload a file's bytes; the server records who owns it and returns its id. */
export async function upload(file: File): Promise<{ id: string; name: string; size: number }> {
  const r = await fetch('/api/files', { method: 'POST', credentials: 'same-origin', body: file,
    headers: { 'content-type': file.type || 'application/octet-stream', 'x-file-name': encodeURIComponent(file.name) } })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new ApiError(tm(data.error ?? 'Upload failed.'), r.status, data.error ?? '')
  return data
}

export type Rating = { id?: string; score: number; comment: string | null; hidden?: boolean; at: string }
export type RatingSummary = { average: number | null; count: number }
export type Price = { level: 'typical' | 'rate' | 'estimate'; label: string; from: number; to: number; currency: string } | null
export type Outlet = { id: string; slug?: string; name: string; nameAr: string | null; channel: string; sectors: string[]; logoUrl: string | null; coverUrl?: string | null; rating?: RatingSummary
  tier: string | null; audience: string | null; market: string; comingSoon: boolean; onNashr: boolean; price: Price }
export type Campaign = { id: string; name: string; budget: number; launchDate: string | null; objective: string | null; audience: string | null
  message: string | null; status: 'active' | 'completed'; committed: number; pending: number; planned: number; remaining: number; clientId?: string | null; client?: string | null }
/** A client an agency books for. Budget and amounts in fils, excl. VAT; remaining counts requests still waiting on publishers. */
export type Client = { id: string; name: string; industry: string | null; trn: string | null; address: string | null; budget: number | null; budgetStop: boolean
  status: 'active' | 'archived'; committed: number; pending: number; paid: number; bookings: number; remaining: number | null }
