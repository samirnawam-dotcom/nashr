-- Email: every message goes through an outbox. With SMTP set up it is sent (retried with growing gaps); without it, it is
-- held, and Nashr's team can read it in the app. Each person gets email in the language they use Nashr in.
create table outbox (
  id uuid primary key default gen_random_uuid(),
  to_email text not null,
  user_id uuid references users,
  company_id uuid references companies,
  kind text not null,
  subject text not null,
  text_body text not null,
  html_body text not null,
  status text not null check (status in ('queued', 'sent', 'failed', 'held')),
  attempts int not null default 0,
  next_attempt_at timestamptz,
  last_error text,
  message_id text,
  created_at timestamptz not null,
  sent_at timestamptz
);
create index outbox_due on outbox (status, next_attempt_at);
create index outbox_created on outbox (created_at desc);
alter table users add column lang text not null default 'en' check (lang in ('en', 'ar'));
