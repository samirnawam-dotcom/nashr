-- The calendar reads slots by air time and counts bids per slot; with 1000+ outlets both need an index.
create index if not exists slots_starts_at on slots (starts_at);
create index if not exists bids_slot on bids (slot_id);
create index if not exists bids_buyer_slot on bids (buyer_id, slot_id);
