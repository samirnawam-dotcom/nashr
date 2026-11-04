-- Nashr core schema. Money is bigint minor units (fils/halalas). Times are timestamptz (UTC).

create extension if not exists pgcrypto;

-- Append-only guard for audit and ledger tables.
create function forbid_change() returns trigger language plpgsql as $$
begin
  raise exception '% is append-only', tg_table_name;
end $$;

-- Settings with history: the value in force at time t is the latest row with valid_from <= t.
create table settings (
  key text not null,
  value jsonb not null,
  valid_from timestamptz not null default now(),
  changed_by text not null,
  primary key (key, valid_from)
);

insert into settings (key, value, valid_from, changed_by) values
  ('seller_window_hours',    '24',   '2000-01-01', 'system'),
  ('payment_window_hours',   '48',   '2000-01-01', 'system'),
  ('question_extension_hours','12',  '2000-01-01', 'system'),
  ('min_step_bp',            '300',  '2000-01-01', 'system'),
  ('review_working_days',    '5',    '2000-01-01', 'system'),
  ('max_choice_rounds',      '2',    '2000-01-01', 'system'),
  ('default_commission_bp',  '1200', '2000-01-01', 'system'),
  ('nashr_vat_registered',   'false','2000-01-01', 'system'),
  ('nashr_vat_bp',           '500',  '2000-01-01', 'system'),
  ('media_vat_bp',           '500',  '2000-01-01', 'system'),
  ('holidays_AE',            '["2026-12-02","2026-12-03"]', '2000-01-01', 'system');

create table audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor text not null,
  action text not null,
  entity text,
  entity_id text,
  detail jsonb
);
create trigger audit_log_append_only before update or delete on audit_log
  for each row execute function forbid_change();

create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('buyer', 'publisher', 'nashr')),
  market text not null default 'AE',
  trn text,
  vat_registered boolean not null default false,
  logo_url text,
  created_at timestamptz not null default now()
);

create table outlets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies,
  name text not null,
  name_ar text,
  channel text not null check (channel in ('print', 'digital', 'radio', 'tv', 'podcast')),
  market text not null default 'AE',
  sectors text[] not null default '{}',
  logo_url text
);

-- A placement is what a seller sells repeatedly: a programme with breaks, a page, a podcast position.
create table placements (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references outlets,
  name text not null,
  sale_type text not null check (sale_type in ('auction', 'quick_sale')),
  days int[] not null,                      -- ISO weekdays, 1 = Monday
  starts_at_local time,                     -- programme start, or edition/release time; null = whole day
  ends_at_local time,
  breaks jsonb not null default '[]',       -- [{ "label": "Break 2", "at": "07:15", "seconds": 30 }]
  starting_price bigint not null check (starting_price > 0),
  any_break_price bigint,                   -- null = option not offered
  package_price bigint,                     -- null = option not offered
  buy_now_price bigint,
  reserve_price bigint,
  auto_accept boolean not null default false,
  creative_lead_hours int not null,         -- creative due this long before air
  close_lead_hours int not null,            -- bidding closes this long before air
  currency text not null default 'AED',
  archived boolean not null default false
);

create table slots (
  id uuid primary key default gen_random_uuid(),
  placement_id uuid not null references placements,
  air_date date not null,
  kind text not null check (kind in ('single', 'any', 'package')),
  label text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  sale_type text not null check (sale_type in ('auction', 'quick_sale')),
  starting_price bigint not null,
  buy_now_price bigint,
  reserve_price bigint,
  auto_accept boolean not null default false,
  currency text not null,
  closes_at timestamptz not null,
  creative_due_at timestamptz not null,
  status text not null default 'open'
    check (status in ('open', 'awaiting_seller', 'awaiting_choice', 'booked', 'blocked', 'held', 'unsold')), -- held = taken by a booked package/break on the same airing
  round int not null default 0,
  choice_deadline_at timestamptz,
  bid_seq bigint not null default 0,
  top_bid_id uuid,
  top_amount bigint,
  top_buyer_id uuid,
  top_max bigint,
  unique (placement_id, air_date, label)
);
create index slots_open_closing on slots (closes_at) where status = 'open';
create index slots_choice on slots (choice_deadline_at) where status = 'awaiting_choice';

create table bids (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references slots,
  buyer_id uuid not null references companies,
  kind text not null check (kind in ('bid', 'auto', 'buy_now', 'interest')),
  amount bigint not null,
  max_amount bigint,
  seq bigint not null,
  status text not null default 'active' check (status in ('active', 'outbid', 'selected', 'not_selected', 'withdrawn')),
  brief jsonb,
  created_at timestamptz not null,
  unique (slot_id, seq)
);

create sequence deal_ref_seq;

create table deals (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique default ('NSH-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('deal_ref_seq')::text, 6, '0')),
  slot_id uuid not null references slots,
  bid_id uuid not null references bids,
  buyer_id uuid not null references companies,
  seller_id uuid not null references companies,
  kind text not null check (kind in ('auction', 'buy_now', 'quick_sale', 'choice')),
  status text not null,
  amount bigint not null,
  currency text not null,
  commission_bp int,      -- frozen at acceptance
  media_vat_bp int,
  fee_vat_bp int,
  next_deadline_at timestamptz,
  created_at timestamptz not null,
  accepted_at timestamptz,
  proof_at timestamptz
);
create index deals_due on deals (next_deadline_at) where next_deadline_at is not null;

create table deal_events (
  id bigserial primary key,
  deal_id uuid not null references deals,
  at timestamptz not null,
  event text not null,
  from_status text,
  to_status text not null,
  actor text not null,
  note text
);

-- Double-entry ledger: every row moves `amount` from `credit` to `debit`.
create table ledger_entries (
  id bigserial primary key,
  at timestamptz not null,
  deal_id uuid references deals,
  debit text not null,
  credit text not null,
  amount bigint not null check (amount > 0),
  currency text not null,
  ref text
);
create trigger ledger_append_only before update or delete on ledger_entries
  for each row execute function forbid_change();

-- Stripe (or other provider) webhook events, stored once.
create table provider_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now(),
  payload jsonb not null
);
