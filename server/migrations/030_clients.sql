-- Agencies book for their clients: each booking can name the client it is for, with the client's budget, industry and receipts.
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references companies,
  name text not null,
  industry text,                       -- checked against each outlet's brand safety, like the brief's industry
  trn text,
  address text,
  budget bigint check (budget is null or budget > 0),
  budget_stop boolean not null default false,   -- refuse bookings that would take the client over its budget
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null
);
create unique index if not exists clients_name on clients (buyer_id, lower(name));
alter table campaigns add column if not exists client_id uuid references clients;
alter table bids add column if not exists client_id uuid references clients;
alter table deals add column if not exists client_id uuid references clients;
create index if not exists deals_client on deals (client_id) where client_id is not null;
