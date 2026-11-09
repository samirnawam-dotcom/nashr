-- A publisher may answer a request with another price. The buyer agrees (the booking is accepted at that price) or keeps their offer.
alter table deals add column if not exists counter_amount bigint check (counter_amount is null or counter_amount > 0);
alter table deals add column if not exists counter_note text;
alter table deals add column if not exists countered_at timestamptz;
