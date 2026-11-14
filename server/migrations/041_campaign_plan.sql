-- Owner's buyer-side fixes: the campaign is the plan. Dates instead of a launch day, an optional budget, one brief sent with every
-- bid tagged to it, and a plan of products (a product's own unit or a programme) instead of outlets with typed amounts.
alter table campaigns alter column budget drop not null;
alter table campaigns drop constraint if exists campaigns_budget_check;
alter table campaigns add constraint campaigns_budget_check check (budget is null or budget > 0);
alter table campaigns add column if not exists start_date date;
alter table campaigns add column if not exists end_date date;
alter table campaigns add column if not exists brief jsonb;
update campaigns set start_date = launch_date where start_date is null and launch_date is not null;

create table if not exists campaign_lines (
  campaign_id uuid not null references campaigns on delete cascade,
  placement_id uuid not null references placements,
  added_at timestamptz not null default now(),
  primary key (campaign_id, placement_id)
);

-- the old plan named outlets: each becomes the products those outlets sell today
insert into campaign_lines (campaign_id, placement_id, added_at)
  select i.campaign_id, p.id, c.created_at from campaign_items i join campaigns c on c.id = i.campaign_id
  join placements p on p.outlet_id = i.outlet_id and not p.archived
  on conflict do nothing;
