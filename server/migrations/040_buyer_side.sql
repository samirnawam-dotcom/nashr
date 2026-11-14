-- Owner's buyer-side fixes (14 Nov 2026): a logo for the buyer's company and for each client, and the client's billing email.
alter table companies add column if not exists logo_key text;
alter table clients add column if not exists logo_key text;
alter table clients add column if not exists billing_email text;
-- Budgets live on campaigns only, so there is never a second budget to keep in step.
update clients set budget = null, budget_stop = false where budget is not null or budget_stop;
