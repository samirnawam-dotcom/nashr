-- Products, media types and programmes (owner's rules, 10 Nov 2026). A product is the brand; each outlet is one of its media types;
-- a placement is either the media type's own sellable unit ('main') or one of its programmes ('programme').
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  name text not null,
  description text,
  notes text,
  logo_key text,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists products_company on products (company_id);

alter table outlets add column if not exists product_id uuid references products(id);
alter table outlets add column if not exists channel_other text;
alter table outlets add column if not exists language text;
alter table outlets add column if not exists markets text[] not null default '{UAE}';
alter table outlets add column if not exists reach_unit text;
alter table outlets add column if not exists default_price bigint check (default_price is null or default_price > 0);
alter table outlets add column if not exists creative_days integer check (creative_days is null or creative_days >= 0);
alter table outlets add column if not exists close_days integer check (close_days is null or close_days >= 0);
alter table outlets add column if not exists spec_type text;
alter table outlets add column if not exists spec_detail text;
alter table outlets add column if not exists notes text;
alter table outlets add column if not exists details jsonb not null default '{}';
alter table outlets add column if not exists archived boolean not null default false;
alter table outlets drop constraint if exists outlets_channel_check;
alter table outlets add constraint outlets_channel_check check (channel in ('digital', 'newspaper', 'magazine', 'newsletter', 'radio', 'tv', 'podcast', 'social', 'other'));

alter table placements add column if not exists kind text not null default 'programme' check (kind in ('main', 'programme'));
alter table placements add column if not exists details jsonb not null default '{}';
alter table placements add column if not exists default_price bigint check (default_price is null or default_price > 0);

-- every outlet already on Nashr becomes a product of its own, holding that one media type
do $$ declare r record; pid uuid; begin
  for r in select id, company_id, name, description, logo_key from outlets where product_id is null and company_id is not null loop
    insert into products (company_id, name, description, logo_key) values (r.company_id, r.name, r.description, r.logo_key) returning id into pid;
    update outlets set product_id = pid where id = r.id;
  end loop;
end $$;
