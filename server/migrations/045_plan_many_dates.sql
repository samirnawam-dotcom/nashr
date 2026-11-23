-- Athena's plan (owner's "Buying moves to the Directory") can put one product in a campaign on several dates: a line per date.
-- A product added without a date stays one line; adding it again for a date fills that line's date first.
alter table campaign_lines drop constraint if exists campaign_lines_pkey;
create unique index if not exists campaign_lines_one on campaign_lines (campaign_id, placement_id, coalesce(slot_id, '00000000-0000-0000-0000-000000000000'::uuid));
