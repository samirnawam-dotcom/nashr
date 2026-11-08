-- The Order (insertion order, SPEC 11.2 #1): Nashr confirms the booking to the buyer and the publisher when the publisher accepts. Not a tax document.
alter table documents drop constraint documents_type_check;
alter table documents add constraint documents_type_check check (type in ('order', 'receipt', 'media_invoice', 'commission_invoice', 'credit_note'));
