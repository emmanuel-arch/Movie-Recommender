-- ─────────────────────────────────────────────────────────────────────────────
-- Upgrade LEGACY mpesa table (PRIMARY KEY(checkout_request_id), NOT NULL)
-- → intent-first shape: PRIMARY KEY(id), checkout_request_id UNIQUE NULL-able.
--
-- Safe to re-run after success (checks for column id).
-- If this errors (e.g. wrong table name): create fresh from 04 only.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
begin
  if exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'mpesa_stk_transactions'
      and c.column_name = 'id'
  ) then
    notify pgrst, 'reload schema';
    raise notice 'mpesa_stk_transactions already has id — no upgrade needed.';
    return;
  end if;

  if not exists (
    select 1
    from information_schema.tables t
    where t.table_schema = 'public'
      and t.table_name = 'mpesa_stk_transactions'
  ) then
    raise exception 'public.mpesa_stk_transactions does not exist — run 04_mpesa_stk_transactions.sql first.';
  end if;

  alter table public.mpesa_stk_transactions
    drop constraint if exists mpesa_stk_transactions_pkey;

  alter table public.mpesa_stk_transactions
    alter column checkout_request_id drop not null;

  alter table public.mpesa_stk_transactions
    add column if not exists id uuid default gen_random_uuid();

  update public.mpesa_stk_transactions set id = gen_random_uuid() where id is null;

  alter table public.mpesa_stk_transactions
    alter column id set default gen_random_uuid();

  alter table public.mpesa_stk_transactions
    alter column id set not null;

  alter table public.mpesa_stk_transactions
    add constraint mpesa_stk_transactions_pkey primary key (id);

  create unique index if not exists mpesa_stk_transactions_checkout_uidx
    on public.mpesa_stk_transactions (checkout_request_id);

end $$;

notify pgrst, 'reload schema';
