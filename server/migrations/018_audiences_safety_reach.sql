-- Ready-made audiences (buyers pick who they want to reach), brand-safety controls, and the reach a publisher declares.
alter table outlets
  add column if not exists audiences text[] not null default '{}',
  add column if not exists blocked_industries text[] not null default '{}',   -- refused when a buyer's brief names one
  add column if not exists blocked_advertisers text[] not null default '{}',  -- competitor names the outlet won't run
  add column if not exists reach int check (reach is null or reach > 0);      -- people reached per airing or edition (publisher's estimate)
alter table placements
  add column if not exists audiences text[] not null default '{}';            -- empty: the outlet's audiences apply
create index if not exists outlets_audiences on outlets using gin (audiences);
