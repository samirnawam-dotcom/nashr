-- Tracking for Nashr's team: every sign-in attempt (who, when, from where, and whether it worked), and on each session
-- where it was opened from and when it was last used.
create table login_events (
  id bigserial primary key,
  at timestamptz not null,
  email text not null,
  user_id uuid references users,
  ip text,
  user_agent text,
  success boolean not null,
  reason text -- password, code, code_needed, suspended, locked
);
create index login_events_at on login_events (at desc);
create index login_events_user on login_events (user_id, at desc);
create index login_events_email on login_events (lower(email), at desc);
alter table sessions add column ip text, add column user_agent text, add column last_seen_at timestamptz;
