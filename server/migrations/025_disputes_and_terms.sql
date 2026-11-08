-- Disputes: Nashr decides within a set number of working days, and both sides can put their case (statement and files)
-- while it decides. Terms: which version of the terms each person accepted, and when.
alter table deals add column decide_by timestamptz;
create table dispute_statements (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals,
  company_id uuid not null references companies,
  user_id uuid not null references users,
  side text not null check (side in ('buyer', 'publisher')),
  text text not null,
  files jsonb,
  created_at timestamptz not null
);
create index dispute_statements_deal on dispute_statements (deal_id, created_at);
alter table users add column terms_version text, add column terms_accepted_at timestamptz;
insert into settings (key, value, valid_from, changed_by) values
  ('dispute_decision_working_days', '5', '2000-01-01', 'system'),
  ('terms_version', '"2026-11-09"', '2000-01-01', 'system');
