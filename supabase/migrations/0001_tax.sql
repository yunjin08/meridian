-- Tax records for the PH 8% flat-rate module. Applied once via the Supabase
-- SQL editor. Access is server-side only (service role), so RLS is enabled
-- with no policies to lock out the anon and authenticated roles.

create table public.tax_income_entries (
  id uuid primary key default gen_random_uuid(),
  received_on date not null,
  source text not null check (char_length(source) between 1 and 120),
  amount_php numeric(14,2) not null check (amount_php >= 0),
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tax_income_entries_received_on_idx
  on public.tax_income_entries (received_on desc);

create table public.tax_filings (
  tax_year integer not null check (tax_year between 2000 and 2100),
  period text not null check (period in ('Q1', 'Q2', 'Q3', 'ANNUAL')),
  filed_on date not null,
  amount_paid_php numeric(14,2) not null check (amount_paid_php >= 0),
  created_at timestamptz not null default now(),
  primary key (tax_year, period)
);

alter table public.tax_income_entries enable row level security;
alter table public.tax_filings enable row level security;
