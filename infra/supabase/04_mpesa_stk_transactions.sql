-- ─────────────────────────────────────────────────────────────────────────────
-- M-Pesa STK ↔ user mapping + status (callbacks + polling).
-- Service role bypasses RLS — only Next.js `/api/payments/*` routes touch this table.
-- Run once in Supabase SQL Editor after earlier schema migrations.
--
-- If you deployed an OLDER variant with checkout_request_id-only PK (no intent row):
--     drop table if exists public.mpesa_stk_transactions cascade;
--     then rerun this entire file (only if you have no payment rows you need to keep).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.mpesa_stk_transactions (
  id                     uuid primary key default gen_random_uuid(),
  checkout_request_id    text unique,
  merchant_request_id    text,
  user_id                uuid not null references auth.users(id) on delete cascade,
  amount                 integer not null check (amount > 0),
  status                 text not null default 'pending'
    check (status in ('pending', 'success', 'failed')),
  result_code            integer,
  result_desc            text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists mpesa_stk_transactions_user_created
  on public.mpesa_stk_transactions (user_id, created_at desc);

alter table public.mpesa_stk_transactions enable row level security;

-- Clients never query this directly; policies omitted on purpose.

-- Ask PostgREST to refresh so the table appears immediately (avoids transient PGRST205).
notify pgrst, 'reload schema';
