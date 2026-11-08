-- The placement form as Omar's brief describes it: what the buyer gets, specs and language shown to buyers;
-- print and digital sold per week; a placement kept on sale a rolling number of weeks ahead (SPEC G15); competitive separation.
alter table placements
  add column if not exists format text,
  add column if not exists description text,
  add column if not exists specs text,
  add column if not exists language text,
  add column if not exists unit text not null default 'day' check (unit in ('day', 'week')),
  add column if not exists listing text not null default 'manual' check (listing in ('rolling', 'manual')),
  add column if not exists horizon_weeks int not null default 8 check (horizon_weeks between 1 and 26),
  add column if not exists separation boolean not null default false,
  add column if not exists listed_through date;
update placements p set listed_through = (select max(air_date) from slots s where s.placement_id = p.id) where listed_through is null;
