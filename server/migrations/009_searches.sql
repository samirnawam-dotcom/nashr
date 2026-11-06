-- Saved calendar searches with alerts. A slot alerts a search once: when it was listed after the search last checked.
-- Slots listed before this migration have no listed_at and never alert.
alter table slots add column listed_at timestamptz;
create index slots_listed_at on slots (listed_at) where listed_at is not null;

create table saved_searches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies,
  created_by uuid references users,
  name text not null,
  filter jsonb not null,
  alerts boolean not null default true,
  checked_at timestamptz not null,
  created_at timestamptz not null
);
create index saved_searches_company on saved_searches (company_id);
