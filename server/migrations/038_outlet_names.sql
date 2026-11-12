-- Owner's fixes round 2 (11 Nov 2026): a product's title is "Outlet · format or programme". A newspaper's own placement was named
-- "format · section" (e.g. "Custom · News"); it is now named by its format, and the section stays in its details.
update slots s set label = split_part(p.name, ' · ', 1)
  from placements p join outlets o on o.id = p.outlet_id
  where s.placement_id = p.id and p.kind = 'main' and o.channel = 'newspaper' and p.details ? 'section' and p.name like '% · %' and s.label = p.name;
update placements p set name = split_part(p.name, ' · ', 1)
  from outlets o where o.id = p.outlet_id and p.kind = 'main' and o.channel = 'newspaper' and p.details ? 'section' and p.name like '% · %';
