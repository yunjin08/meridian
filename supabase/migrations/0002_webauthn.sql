-- Passkey credentials for owner sign-in. Applied once via the Supabase SQL
-- editor. Access is server-side only (service role), so RLS is enabled with no
-- policies to lock out the anon and authenticated roles.
--
-- No user_id column: the dashboard has one owner, so every row here is theirs.
-- A users table for a single owner would misdescribe the app.

create table public.webauthn_credentials (
  credential_id text primary key,
  public_key text not null,
  counter bigint not null default 0 check (counter >= 0),
  transports text[] not null default '{}',
  device_label text not null check (char_length(device_label) between 1 and 120),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index webauthn_credentials_last_used_idx
  on public.webauthn_credentials (last_used_at desc nulls last);

alter table public.webauthn_credentials enable row level security;
