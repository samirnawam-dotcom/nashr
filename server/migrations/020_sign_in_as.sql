-- Nashr staff signing in as a buyer or publisher user to help them: full access as that person, for a limited time,
-- with a written reason. Every change made is logged under the staff member's name (SPEC 12.1, extended).
alter table sessions
  add column act_as_user_id uuid references users,
  add column act_as_until timestamptz,
  add column act_as_reason text;
