-- A publisher's logo (shown on its profile, the directory, bookings and admin; initials otherwise) and its rate card (SPEC 12.1).
alter table outlets add column logo_key text;
alter table companies add column rate_card_file uuid references files;
