-- Reminders before deadlines, the waiting list for features and markets not open yet, which markets are open.

-- One reminder per deal, kind and deadline: the sweeper can run any number of times and nobody hears twice.
create table reminders (
  deal_id uuid not null references deals,
  kind text not null,
  deadline_at timestamptz not null,
  sent_at timestamptz not null,
  primary key (deal_id, kind, deadline_at)
);

-- "Tell me when it opens": KSA for buyers and publishers, Athena for buyers (brief sections 14, 21).
create table waitlist (
  company_id uuid not null references companies,
  topic text not null check (topic in ('KSA', 'Athena')),
  user_id uuid references users,
  created_at timestamptz not null,
  primary key (company_id, topic)
);

insert into settings (key, value, valid_from, changed_by) values ('open_markets', '["AE"]', '2000-01-01', 'system');
