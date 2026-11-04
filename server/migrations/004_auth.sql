-- Invite-only access, users, sessions (brief section 2, SPEC 12.1 request-access fields).

create table access_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text not null,
  role text not null,
  company text not null,
  company_type text not null check (company_type in ('brand', 'agency', 'media_outlet')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'info')),
  reason text,
  created_at timestamptz not null,
  decided_at timestamptz,
  decided_by text
);

create table users (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies,
  email text not null,
  name text not null,
  phone text,
  role text not null check (role in ('buyer', 'seller', 'admin', 'founder')),
  status text not null default 'invited' check (status in ('invited', 'active', 'suspended')),
  password_hash text,
  totp_secret text,
  totp_enabled boolean not null default false,
  created_at timestamptz not null
);
create unique index users_email on users (lower(email));

-- Tokens are stored hashed: a database leak does not give working links or sessions.
create table invites (
  token_hash text primary key,
  user_id uuid not null references users,
  expires_at timestamptz not null,
  used_at timestamptz
);

create table sessions (
  token_hash text primary key,
  user_id uuid not null references users,
  created_at timestamptz not null,
  expires_at timestamptz not null,
  view_as_company_id uuid references companies   -- admin viewing an account, read-only (SPEC 12.1)
);
