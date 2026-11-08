-- Each side sees the other's business profile before deciding (owner decision): what the company is and does, never how to reach it.
alter table companies
  add column if not exists industry text,
  add column if not exists website text,
  add column if not exists about text;
