-- Contact Nashr from inside the app: a buyer or publisher asks, optionally about one booking; Nashr's team answers.
-- Both sides hear about it on the bell (and by email once it is connected).
create table support_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies,
  user_id uuid not null references users,
  topic text not null check (topic in ('booking', 'payment', 'listing', 'account', 'other')),
  deal_id uuid references deals,
  message text not null,
  status text not null default 'open' check (status in ('open', 'answered', 'closed')),
  reply text,
  answered_by uuid references users,
  created_at timestamptz not null,
  answered_at timestamptz
);
create index support_requests_open on support_requests (status, created_at);
create index support_requests_company on support_requests (company_id, created_at desc);
