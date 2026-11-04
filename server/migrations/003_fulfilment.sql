-- Fulfilment (creative, proof, issues, pre-run check), documents and notifications.

alter table deals add column make_good_at timestamptz;          -- new run time after a make-good
alter table deals add column extra_creative_rounds int not null default 0; -- allowed by seller or admin
alter table deals add column placeholder boolean not null default false;     -- buyer never sent creative; seller runs a placeholder
alter table companies add column invoice_mode text not null default 'generate' check (invoice_mode in ('generate', 'upload'));

create table creatives (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals,
  version int not null,
  file_key text not null,
  file_type text not null,
  file_size bigint not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'changes_requested', 'technical_issue', 'rejected')),
  reason text,
  uploaded_at timestamptz not null,
  reviewed_at timestamptz,
  unique (deal_id, version)
);

create table proofs (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals,
  items jsonb not null,           -- { "tearsheet": "files/..", "live_link": "https://..", ... }
  note text,
  submitted_at timestamptz not null
);

create table issues (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals,
  reason text not null check (reason in ('did_not_run', 'wrong_time', 'wrong_position', 'creative_altered', 'quality', 'other')),
  note text not null,
  evidence jsonb,
  offer jsonb,                    -- { "type": "corrected_proof" | "make_good" | "partial_refund", ... }
  status text not null default 'open' check (status in ('open', 'resolved', 'escalated')),
  opened_at timestamptz not null,
  closed_at timestamptz
);

create table prerun_checks (
  deal_id uuid primary key references deals,
  requested_at timestamptz not null,
  seller_confirmed_at timestamptz,
  buyer_confirmed_at timestamptz
);

-- Gapless numbering per series (UAE tax invoices must run in sequence).
create table document_series (
  series text primary key,
  last bigint not null default 0
);

-- Documents are structured data first (UAE e-invoicing); a PDF is only a rendering. Never changed once issued.
create table documents (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('receipt', 'media_invoice', 'commission_invoice', 'credit_note')),
  number text not null,
  issuer_id uuid references companies,      -- null = Nashr
  recipient_id uuid references companies,
  deal_id uuid references deals,
  related_id uuid references documents,     -- credit note → the invoice it credits
  on_behalf boolean not null default false,  -- issued by Nashr on the publisher's behalf
  tax_document boolean not null,
  currency text not null,
  subtotal bigint not null,
  vat_bp int not null,
  vat bigint not null,
  total bigint not null,
  lines jsonb not null,
  file_key text,                             -- the publisher's own uploaded invoice
  issued_at timestamptz not null,
  unique (issuer_id, type, number)
);
create trigger documents_append_only before update or delete on documents
  for each row execute function forbid_change();

create table notifications (
  id bigserial primary key,
  company_id uuid not null references companies,
  kind text not null,
  deal_id uuid references deals,
  data jsonb,
  created_at timestamptz not null,
  read_at timestamptz
);

insert into settings (key, value, valid_from, changed_by) values
  ('max_creative_rounds',   '2',         '2000-01-01', 'system'),
  ('issue_response_hours',  '48',        '2000-01-01', 'system'),
  ('prerun_hours',          '48',        '2000-01-01', 'system'),
  ('media_invoice_timing',  '"payment"', '2000-01-01', 'system'),  -- or "run"
  ('nashr_legal_name',      '"Nashr"',   '2000-01-01', 'system'),
  ('nashr_trn',             'null',      '2000-01-01', 'system');
