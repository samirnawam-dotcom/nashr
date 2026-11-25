-- What people thought of Athena's answers (thumbs up or down), and the questions it could not answer, for Nashr's team to
-- teach it next. The question is kept as typed; no other personal data.
create table if not exists athena_feedback (
  id bigserial primary key,
  company_id uuid references companies,
  user_id uuid references users,
  question text not null,
  answer text,
  helpful boolean,              -- null: not rated (an unanswered question, logged automatically)
  unknown boolean not null default false,
  created_at timestamptz not null
);
create index if not exists athena_feedback_at on athena_feedback (created_at desc);
