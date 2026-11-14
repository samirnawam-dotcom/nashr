-- Owner's buyer-side fixes: a buyer stars the outlets they come back to ("Saved" filter on the Directory). An outlet is the brand:
-- its products row when it has one, else the single outlets row (older outlets and those not on Nashr).
create table if not exists saved_outlets (
  company_id uuid not null references companies,
  brand_key uuid not null,
  created_at timestamptz not null default now(),
  primary key (company_id, brand_key)
);
