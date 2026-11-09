-- Sign-in and reset attempt limits, shared by every copy of the API (they were counted per process before).
create unlogged table if not exists rate_limits (
  key text primary key,
  n int not null,
  reset_at timestamptz not null
);
