-- Two-step sign-in for buyers and publishers. Anyone may turn it on; with this setting on (founder's call),
-- it is required before paying for a booking or connecting a payout account.
insert into settings (key, value, valid_from, changed_by) values ('two_step_for_money', 'true', '2000-01-01', 'system');
