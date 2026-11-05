-- Directory (outlets not on Nashr), campaigns, quote requests, private files.

-- Off-platform outlets have no company yet; admins enter an estimated price range (brief section 7, level 3).
alter table outlets alter column company_id drop not null;
alter table outlets
  add column tier text,
  add column audience text,
  add column website text,
  add column description text,
  add column est_low bigint,
  add column est_high bigint,
  add column est_currency text not null default 'AED';

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references companies,
  name text not null,
  budget bigint not null check (budget > 0),
  launch_date date,
  objective text,
  audience text,
  message text,
  status text not null default 'active' check (status in ('active', 'completed')),
  created_at timestamptz not null
);

-- The plan: outlets the buyer intends to use, including ones not on Nashr yet.
create table campaign_items (
  campaign_id uuid not null references campaigns on delete cascade,
  outlet_id uuid not null references outlets,
  planned_amount bigint not null default 0,
  primary key (campaign_id, outlet_id)
);

alter table bids add column campaign_id uuid references campaigns;
alter table deals add column campaign_id uuid references campaigns;

create table quote_requests (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references outlets,
  buyer_id uuid not null references companies,
  message text not null,
  status text not null default 'open' check (status in ('open', 'answered', 'closed')),
  created_at timestamptz not null
);

-- Uploaded files (creatives, proof, invoices). Bytes live in storage; this row says who may read them.
create table files (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies,
  name text not null,
  type text not null,
  size bigint not null,
  created_at timestamptz not null
);
