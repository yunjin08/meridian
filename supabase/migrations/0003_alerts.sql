-- Price/indicator alerts. Moved off localStorage into Supabase so a scheduled
-- function can evaluate them and email the owner even when no browser tab is
-- open. Applied once via the Supabase SQL editor. Access is server-side only
-- (service role), so RLS is enabled with no policies to lock out the anon and
-- authenticated roles.

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  label text not null check (char_length(label) between 1 and 120),
  symbol text not null check (char_length(symbol) between 1 and 20),
  condition_type text not null check (condition_type in (
    'price_above', 'price_below', 'price_crosses',
    'rsi_above', 'rsi_below', 'macd_crossover', 'macd_crossunder'
  )),
  -- null only for the macd_* conditions, which carry no threshold
  threshold numeric,
  active boolean not null default true,
  triggered boolean not null default false,
  triggered_at timestamptz,
  auto_reset boolean not null default false,
  -- previous close the cron last saw for this alert, so price_crosses can detect
  -- a crossing across two separate cron runs. Null until the first evaluation.
  last_price numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index alerts_active_idx on public.alerts (active) where active;

alter table public.alerts enable row level security;
