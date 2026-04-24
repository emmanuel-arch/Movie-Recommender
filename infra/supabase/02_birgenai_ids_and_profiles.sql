-- ────────────────────────────────────────────────────────────────────────────
-- BirgenAI migration 02 — cross-subdomain SSO identity + Netflix-style
-- watching profiles (avatars + names within a single account).
--
-- Apply AFTER schema.sql. Idempotent.
--   python infra/supabase/_apply_schema.py      # rerun schema.sql
--   psql $SUPABASE_DB_URL -f infra/supabase/02_birgenai_ids_and_profiles.sql
-- ────────────────────────────────────────────────────────────────────────────

-- ── 1. BirgenAI ID on profiles ─────────────────────────────────────────────
-- Every BirgenAI account gets a stable, human-readable ID of the form
--     BIR-XXXXXXXX
-- where X is a digit (Kenyan-national-ID-style). This ID is the single
-- identifier used across every birgenai.com subdomain for SSO — users can
-- log into any of our properties (movies, hub, …) with it.

alter table public.profiles
  add column if not exists birgenai_id text unique;

-- Generator: picks an 8-digit numeric suffix that isn't already taken.
-- Collision probability is ~0 until we cross ~1M users, at which point the
-- retry loop handles it gracefully.
create or replace function public.generate_birgenai_id()
returns text
language plpgsql
as $$
declare
  candidate text;
  attempts  int := 0;
begin
  loop
    candidate := 'BIR-' || lpad((floor(random() * 100000000))::int::text, 8, '0');
    exit when not exists (select 1 from public.profiles where birgenai_id = candidate);
    attempts := attempts + 1;
    if attempts > 10 then
      -- Extremely unlikely — fall back to a longer suffix.
      candidate := 'BIR-' || lpad((floor(random() * 10000000000))::bigint::text, 10, '0');
      exit;
    end if;
  end loop;
  return candidate;
end;
$$;

-- Backfill any existing rows that don't have one yet.
update public.profiles
  set birgenai_id = public.generate_birgenai_id()
  where birgenai_id is null;

-- Enforce not-null going forward.
alter table public.profiles
  alter column birgenai_id set not null;

-- Re-wire the new-user trigger so every newly created row gets a BIR-ID.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, birgenai_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    public.generate_birgenai_id()
  )
  on conflict (id) do update
    set birgenai_id = coalesce(public.profiles.birgenai_id, excluded.birgenai_id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Lookup helper (used by the "Sign in with BirgenAI ID" flow).
-- Returns the auth email for a given BIR-ID so the web client can exchange
-- the BIR-ID + password for a Supabase session. Runs as security definer
-- because anon callers need it to resolve the email without seeing auth.users.
create or replace function public.email_for_birgenai_id(p_birgenai_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  result text;
begin
  select u.email
    into result
    from public.profiles p
    join auth.users u on u.id = p.id
   where p.birgenai_id = upper(trim(p_birgenai_id));
  return result;
end;
$$;

grant execute on function public.email_for_birgenai_id(text) to anon, authenticated;


-- ── 2. watching_profiles ───────────────────────────────────────────────────
-- Netflix-style "Who's watching?" sub-profiles. Each BirgenAI account (one
-- auth.users row) can have up to 5 watching profiles, each with its own
-- avatar + display name. All watch_sessions / ratings / my-list interactions
-- can optionally be scoped to the active watching_profile.

create table if not exists public.watching_profiles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 32),
  avatar_key  text not null default 'ember',      -- maps to client-side avatar set
  is_kids     boolean not null default false,
  is_default  boolean not null default false,
  pin         text,                                -- optional 4-digit PIN (plain for now; hash later)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists watching_profiles_user
  on public.watching_profiles (user_id, created_at);

-- Cap 5 profiles per account, matching Netflix.
create or replace function public.enforce_watching_profile_cap()
returns trigger
language plpgsql
as $$
begin
  if (select count(*) from public.watching_profiles where user_id = new.user_id) >= 5 then
    raise exception 'max 5 watching profiles per account';
  end if;
  return new;
end;
$$;

drop trigger if exists watching_profiles_cap on public.watching_profiles;
create trigger watching_profiles_cap
  before insert on public.watching_profiles
  for each row execute procedure public.enforce_watching_profile_cap();

-- Only one default profile per account.
create unique index if not exists watching_profiles_one_default
  on public.watching_profiles (user_id)
  where is_default;

alter table public.watching_profiles enable row level security;

drop policy if exists "watching_profiles_self_rw" on public.watching_profiles;
create policy "watching_profiles_self_rw"
  on public.watching_profiles for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Keep updated_at fresh.
create or replace function public.touch_watching_profile()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists watching_profiles_touch on public.watching_profiles;
create trigger watching_profiles_touch
  before update on public.watching_profiles
  for each row execute procedure public.touch_watching_profile();

-- Done.
