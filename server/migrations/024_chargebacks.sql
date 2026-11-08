-- A chargeback is decided by the buyer's bank, not by Nashr: while it is open the deal cannot be refunded or released.
alter table deals add column chargeback text check (chargeback in ('open', 'won', 'lost'));
-- a payout waits while the bank decides (on_hold), and is dropped when the bank sides with the buyer (cancelled)
alter table money_ops drop constraint money_ops_status_check;
alter table money_ops add constraint money_ops_status_check check (status in ('pending', 'requires_action', 'succeeded', 'failed', 'on_hold', 'cancelled'));
