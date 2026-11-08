-- A third way to sell (owner request): a fixed price the first buyer books outright. The publisher confirms within its window,
-- or the booking is confirmed automatically when the placement says so.
alter table placements drop constraint if exists placements_sale_type_check;
alter table placements add constraint placements_sale_type_check check (sale_type in ('auction', 'quick_sale', 'fixed'));
alter table slots drop constraint if exists slots_sale_type_check;
alter table slots add constraint slots_sale_type_check check (sale_type in ('auction', 'quick_sale', 'fixed'));
alter table bids drop constraint if exists bids_kind_check;
alter table bids add constraint bids_kind_check check (kind in ('bid', 'auto', 'buy_now', 'interest', 'book'));
alter table deals drop constraint if exists deals_kind_check;
alter table deals add constraint deals_kind_check check (kind in ('auction', 'buy_now', 'quick_sale', 'choice', 'fixed'));
