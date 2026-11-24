-- Sign-ups from events (owner's request for a conference): people register their interest. No account and no access request.
create table if not exists registrations (
  id uuid primary key default gen_random_uuid(),
  event text not null default 'general',
  side text not null check (side in ('buyer', 'media_outlet')),
  name text not null,
  company text not null,
  email text not null,
  phone text not null,
  created_at timestamptz not null
);
create index if not exists registrations_event on registrations (event, created_at desc);
