-- A demo server's made-up addresses bounce every email (550). Mail to them already waiting or failed stays in the outbox
-- for staff to read instead of retrying (new mail to them is held as it is queued). No such addresses exist on a live system.
update outbox set status = 'held', next_attempt_at = null
  where status in ('queued', 'failed')
    and lower(to_email) in ('demo@northwind.ae', 'huda@brightagency.ae', 'sales@skyline.ae', 'ops@nashr.ae', 'omar@nashr.ae');
