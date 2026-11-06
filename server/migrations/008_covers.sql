-- Outlet cover photos: public images shown on the directory and the outlet page. Kept apart from private files
-- (an off-platform outlet has no company to own a file). The key changes on every upload, so its URL can be cached forever.
alter table outlets add column cover_key text;
