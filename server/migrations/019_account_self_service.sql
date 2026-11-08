-- Account self-service: password resets (a person asks; until email is connected, Nashr's team sends the link) and email choices.
create table if not exists password_resets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users,
  token_hash text unique,               -- set when a link is issued; never stored in clear
  requested_at timestamptz not null,
  issued_at timestamptz,
  expires_at timestamptz,
  used_at timestamptz
);
create index if not exists password_resets_user on password_resets (user_id);
alter table users add column if not exists email_prefs jsonb not null default '{}';
