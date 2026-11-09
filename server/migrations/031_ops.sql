-- Staff alerts: one row per problem while it lasts, so staff hear once when it starts and once when it clears.
create table if not exists staff_alerts (
  id bigserial primary key,
  key text not null,                 -- which check, e.g. 'money.stuck'
  detail text not null,
  opened_at timestamptz not null,
  last_seen_at timestamptz not null,
  resolved_at timestamptz
);
create unique index if not exists staff_alerts_open on staff_alerts (key) where resolved_at is null;

-- Backups and restore drills report here (scripts/backup.sh, scripts/restore-drill.sh), so a stopped backup is noticed.
create table if not exists ops_runs (
  id bigserial primary key,
  kind text not null check (kind in ('backup', 'restore_drill')),
  ok boolean not null,
  detail text,
  at timestamptz not null default now()
);
create index if not exists ops_runs_kind on ops_runs (kind, at desc);
