-- Owner's "Buying moves to the Directory": campaign dates are required and the status comes from them (Upcoming, Active,
-- Finished). Older campaigns without dates get their launch day (or the day they were made) and the 30 days after it.
update campaigns set start_date = coalesce(start_date, launch_date, created_at::date) where start_date is null;
update campaigns set end_date = start_date + 30 where end_date is null;
