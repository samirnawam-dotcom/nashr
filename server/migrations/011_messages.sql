-- Buyer and publisher talk about a booking inside Nashr (brief section 6), one conversation per deal.
-- Emails and phone numbers are refused; wording that suggests moving off Nashr is let through and flagged for the team.
create table messages (
  id uuid primary key default gen_random_uuid(),
  seq bigserial not null, -- the order they were written, even within the same instant
  deal_id uuid not null references deals,
  company_id uuid not null references companies, -- the side that wrote it
  user_id uuid references users,
  body text not null check (length(body) between 1 and 2000),
  flagged boolean not null default false,
  created_at timestamptz not null
);
create index messages_deal on messages (deal_id, seq);
create index messages_flagged on messages (created_at) where flagged;

-- How far each side has read each conversation.
create table message_reads (
  deal_id uuid not null references deals,
  company_id uuid not null references companies,
  read_at timestamptz not null,
  primary key (deal_id, company_id)
);
