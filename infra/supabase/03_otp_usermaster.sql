-- ────────────────────────────────────────────────────────────────────────────
-- BirgenAI migration 03 — Email OTP verification + usermaster view
-- Apply AFTER 02_birgenai_ids_and_profiles.sql
-- ────────────────────────────────────────────────────────────────────────────

-- 1. OTP verified timestamp on profiles (NULL = must complete email OTP flow)
alter table public.profiles
  add column if not exists otp_verified_at timestamptz;

-- Existing deployments: treat everyone who already has an account as verified.
update public.profiles
  set otp_verified_at = coalesce(otp_verified_at, now())
  where otp_verified_at is null;

-- New sign-ups after this migration should start with otp_verified_at = NULL.
-- Re-run handle_new_user insert path does not set otp_verified_at → remains NULL until verify.

-- 2. OTP challenges — written only via service role from Next.js API routes (nodemailer).
create table if not exists public.email_otp_challenges (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  code_hash   text not null,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

create index if not exists email_otp_challenges_user_created
  on public.email_otp_challenges (user_id, created_at desc);

alter table public.email_otp_challenges enable row level security;

-- Deny direct client access; service_role bypasses RLS for API routes.
-- (No policies → default deny for anon/authenticated.)

-- 3. Convenience view — single place for BirgenAI ID + auth email (canonical “master” identity)
create or replace view public.usermaster as
select
  p.id          as auth_user_id,
  p.birgenai_id,
  u.email       as auth_email,
  p.display_name,
  p.otp_verified_at,
  p.plan,
  p.country,
  p.created_at,
  p.updated_at
from public.profiles p
join auth.users u on u.id = p.id;

grant select on public.usermaster to authenticated;

comment on view public.usermaster is
  'Join of public.profiles and auth.users — BirgenAI ID lives on profiles; passwords remain in Supabase Auth.';
