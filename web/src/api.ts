// Thin wrapper over the API. The server decides everything; the screens only show what it returns.
export class ApiError extends Error { constructor(message: string, public status: number) { super(message) } }

export async function api<T = any>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const r = await fetch(`/api${path}`, {
    method: init?.method ?? 'GET', credentials: 'same-origin',
    headers: init?.body ? { 'content-type': 'application/json' } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new ApiError(data.error ?? 'Something went wrong.', r.status)
  return data
}

export type Slot = {
  id: string; outlet: string; channel: string; placement: string; label: string; kind: 'single' | 'any' | 'package'
  saleType: 'auction' | 'quick_sale'; startsAt: string; endsAt: string | null; closesAt: string; currency: string
  startingPrice: number; buyNowPrice: number | null; topBid: number | null; bids: number; available: boolean; youLead: boolean; youBid: boolean
}

/** Upload a file's bytes; the server records who owns it and returns its id. */
export async function upload(file: File): Promise<{ id: string; name: string; size: number }> {
  const r = await fetch('/api/files', { method: 'POST', credentials: 'same-origin', body: file,
    headers: { 'content-type': file.type || 'application/octet-stream', 'x-file-name': encodeURIComponent(file.name) } })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new ApiError(data.error ?? 'Upload failed.', r.status)
  return data
}

export type Price = { level: 'typical' | 'rate' | 'estimate'; label: string; from: number; to: number; currency: string } | null
export type Outlet = { id: string; slug?: string; name: string; nameAr: string | null; channel: string; sectors: string[]; logoUrl: string | null
  tier: string | null; audience: string | null; market: string; comingSoon: boolean; onNashr: boolean; price: Price }
export type Campaign = { id: string; name: string; budget: number; launchDate: string | null; objective: string | null; audience: string | null
  message: string | null; status: 'active' | 'completed'; committed: number; pending: number; planned: number; remaining: number }
