-- Security review (F2): prices and amounts can never be zero or negative; an authenticator code works once.
alter table placements
  add constraint placements_prices_positive check (coalesce(any_break_price, 1) > 0 and coalesce(package_price, 1) > 0
    and coalesce(buy_now_price, 1) > 0 and coalesce(reserve_price, 1) > 0);
alter table slots add constraint slots_prices_positive check (starting_price > 0 and coalesce(buy_now_price, 1) > 0 and coalesce(reserve_price, 1) > 0);
alter table bids add constraint bids_amount_positive check (amount > 0);
alter table deals add constraint deals_amount_positive check (amount > 0);
alter table users add column totp_last_step bigint;
