-- Phone and browser alerts (web push): each device a person turned alerts on for, and Nashr's own key pair for sending.
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  device text,
  created_at timestamptz not null,
  last_used_at timestamptz
);
create index push_subscriptions_user on push_subscriptions (user_id);
create table server_keys (name text primary key, value jsonb not null);
