-- Athena's monthly report: one per company per month (the job may run many times a day; this keeps it to one).
create table if not exists athena_reports (
  company_id uuid not null references companies,
  month text not null,              -- the month reported on, YYYY-MM
  sent_at timestamptz not null,
  primary key (company_id, month)
);
