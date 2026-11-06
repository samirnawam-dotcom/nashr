-- A buyer rates the outlet once per completed (released) booking, and may change it. Nashr can hide an abusive rating.
create table ratings (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null unique references deals,
  outlet_id uuid not null references outlets,
  buyer_id uuid not null references companies,
  score smallint not null check (score between 1 and 5),
  comment text,
  hidden boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null
);
create index ratings_outlet on ratings (outlet_id) where not hidden;
