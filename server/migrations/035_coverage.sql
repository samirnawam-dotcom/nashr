-- Media coverage submissions (owner's prototype): a publisher describes a programme, show or coverage opportunity; Nashr's team
-- reviews it; once approved it goes on sale as a product on its coverage dates.
create table if not exists coverage_submissions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  outlet_id uuid not null references outlets(id),
  status text not null default 'draft' check (status in ('draft', 'submitted', 'changes_requested', 'approved', 'rejected')),
  data jsonb not null default '{}',
  created_by uuid references users(id),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  submitted_at timestamptz,
  decided_at timestamptz,
  decided_by text,
  decision_note text,
  placement_id uuid references placements(id)
);
create index if not exists coverage_company on coverage_submissions (company_id, updated_at desc);
create index if not exists coverage_status on coverage_submissions (status, submitted_at);
