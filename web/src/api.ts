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
