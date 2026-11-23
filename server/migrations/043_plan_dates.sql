-- Owner's "Buying moves to the Directory": the buyer's Calendar tracks what they planned. A product added from one listing keeps
-- that date; one added without a date is shown on the next date it is on sale within the campaign's dates.
alter table campaign_lines add column if not exists slot_id uuid references slots on delete set null;
