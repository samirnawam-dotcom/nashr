-- Payments: provider operations (charges, refunds, transfers) and the settings the money rules need.

alter table companies
  add column provider_account text,                       -- the seller's connected payout account (Stripe acct_...)
  add column payouts_enabled boolean not null default false; -- identity and bank checks done; slots can go live

create sequence pay_ref_seq;

-- Every call to the payment provider, recorded before it is made. The idempotency key makes retries safe.
create table money_ops (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique default ('PAY-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('pay_ref_seq')::text, 6, '0')),
  deal_id uuid references deals,
  company_id uuid references companies,       -- the seller, for transfers
  kind text not null check (kind in ('charge', 'refund', 'transfer')),
  amount bigint not null check (amount > 0),
  currency text not null,
  status text not null default 'pending' check (status in ('pending', 'requires_action', 'succeeded', 'failed')),
  idempotency_key text not null unique,
  provider_id text unique,
  failure text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);
create index money_ops_pending on money_ops (created_at) where status = 'pending' and kind <> 'charge';

insert into settings (key, value, valid_from, changed_by) values
  ('processing_fee_bp',        '290', '2000-01-01', 'system'),  -- card processing estimate: 2.9% ...
  ('processing_fee_fixed',     '100', '2000-01-01', 'system'),  -- ... + AED 1.00 (fils)
  ('free_cancel_hours',        '24',  '2000-01-01', 'system'),
  ('cancel_fee_bp',            '1500','2000-01-01', 'system'),
  ('proof_due_working_days',   '2',   '2000-01-01', 'system');
