-- Invoice-grade documents: the registered address of each company, and Nashr's own, printed on every document
-- (UAE tax invoices name the supplier's and recipient's address). Documents snapshot it when issued.
alter table companies add column address text;
insert into settings (key, value, valid_from, changed_by) values ('nashr_address', 'null', '2000-01-01', 'system');
