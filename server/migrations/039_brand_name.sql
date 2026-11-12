-- Owner's fixes round 2: names everywhere start with the outlet (the brand). Every query that used to show the media-level name as
-- "outlet" now asks for the brand's name; a row made before brands existed (or outside the catalogue) keeps its own name.
create or replace function brand_name(o outlets) returns text language sql stable as $$
  select coalesce((select p.name from products p where p.id = o.product_id), o.name)
$$;
