import { pool } from '../core/db.js'
import { createPlacement, generateSlots, type PlacementInput } from '../catalog/placements.js'

export const AED = (n: number) => n * 100
export const T = (iso: string) => new Date(iso)
export const BRIEF = { advertiser: 'Northwind Fintech', industry: 'Banking', message: 'Business cards for growing companies', language: 'english', creativeToFollow: true }

export async function reset() {
  await pool.query(`truncate reminders, waitlist, files, quote_requests, campaign_items, campaigns, sessions, invites, users, access_requests, notifications, documents, document_series, creatives, proofs, issues, prerun_checks, money_ops, ledger_entries, deal_events, deals, bids, slots, placements, outlets, companies, provider_events restart identity cascade`)
  await pool.query(`delete from settings where valid_from > '2000-01-01'`)
  // most tests pay without setting up an authenticator; the two-step tests switch this back on
  await pool.query(`insert into settings (key, value, valid_from, changed_by) values ('two_step_for_money', 'false', '2000-01-02', 'test')`)
}

export async function company(name: string, type: 'buyer' | 'publisher', vatRegistered = false): Promise<string> {
  return (await pool.query(`insert into companies (name, type, vat_registered) values ($1, $2, $3) returning id`, [name, type, vatRegistered])).rows[0].id
}

/** Skyline FM, Morning Markets Mon-Fri 06:30-09:00, four 30s breaks, any-break and package options. */
export async function radio(at: Date, over: Partial<PlacementInput> = {}) {
  const seller = await company('Skyline FM', 'publisher', true)
  await pool.query(`update companies set provider_account = 'acct_skyline', payouts_enabled = true where id = $1`, [seller])
  const outlet = (await pool.query(`insert into outlets (company_id, name, channel) values ($1, 'Skyline FM', 'radio') returning id`, [seller])).rows[0].id
  const placement = await createPlacement(pool, {
    outletId: outlet, name: 'Morning Markets', saleType: 'auction', days: [1, 2, 3, 4, 5], startsAt: '06:30', endsAt: '09:00',
    breaks: [{ label: 'Break 1', at: '06:45', seconds: 30 }, { label: 'Break 2', at: '07:15', seconds: 30 },
             { label: 'Break 3', at: '07:45', seconds: 30 }, { label: 'Break 4', at: '08:15', seconds: 30 }],
    startingPrice: AED(3_500), anyBreakPrice: AED(3_500), packagePrice: AED(15_000), buyNowPrice: AED(5_500),
    creativeLeadHours: 48, closeLeadHours: 120, ...over,
  }, 'seller:skyline', at)
  return { seller, outlet, placement }
}

export async function slot(placement: string, date: string, label: string) {
  return (await pool.query(`select * from slots where placement_id = $1 and air_date = $2 and label = $3`, [placement, date, label])).rows[0]
}
