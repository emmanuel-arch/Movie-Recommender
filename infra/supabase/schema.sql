-- ────────────────────────────────────────────────────────────────────────────
-- BirgenAI Supabase schema
-- Run this ONCE in a fresh Supabase project's SQL editor, or via:
--   psql $SUPABASE_DB_URL -f schema.sql
--
-- Includes: tables, indexes, RLS policies, and the `update_monthly_usage()`
-- RPC used by the Cloudflare cron Worker.
-- ────────────────────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

-- ── 1. profiles ────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text,
  avatar_url    text,
  plan          text not null default 'free' check (plan in ('free','premium')),
  country       text default 'KE',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_self_select"
  on public.profiles for select using (auth.uid() = id);

create policy "profiles_self_update"
  on public.profiles for update using (auth.uid() = id);

-- Auto-create profile row when a new auth.users row appears.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── 2. watch_sessions ──────────────────────────────────────────────────────
-- One row per (user, movie). Upserted every ~10s while the video plays.
create table if not exists public.watch_sessions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  movie_id          integer,                       -- MovieLens ID (Hollywood catalogue)
  movie_slug        text,                          -- Kenyan content slug (R2 folder)
  position_seconds  integer not null default 0,
  duration_seconds  integer,
  watched_seconds   integer not null default 0,    -- cumulative unique seconds watched
  device            text,                          -- 'web','ios','android','tv'
  started_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Either movie_id or movie_slug must be set.
alter table public.watch_sessions
  drop constraint if exists watch_sessions_one_id;
alter table public.watch_sessions
  add constraint watch_sessions_one_id
  check (movie_id is not null or movie_slug is not null);

-- Upsert conflict target: (user, movie). We unique-index on each nullable key.
create unique index if not exists watch_sessions_user_movie_id
  on public.watch_sessions (user_id, movie_id)
  where movie_id is not null;

create unique index if not exists watch_sessions_user_movie_slug
  on public.watch_sessions (user_id, movie_slug)
  where movie_slug is not null;

create index if not exists watch_sessions_user_updated
  on public.watch_sessions (user_id, updated_at desc);

alter table public.watch_sessions enable row level security;

create policy "watch_sessions_self_rw"
  on public.watch_sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── 3. monthly_usage ───────────────────────────────────────────────────────
-- Populated by the nightly `update_monthly_usage()` RPC below. Used by the
-- screen-time paywall.
create table if not exists public.monthly_usage (
  user_id       uuid not null references auth.users(id) on delete cascade,
  month         date not null,                     -- always first day of month
  total_seconds integer not null default 0,
  updated_at    timestamptz not null default now(),
  primary key (user_id, month)
);

alter table public.monthly_usage enable row level security;

create policy "monthly_usage_self_select"
  on public.monthly_usage for select
  using (auth.uid() = user_id);

-- ── 4. ratings ─────────────────────────────────────────────────────────────
-- Mirrors the MovieLens structure but tied to a real auth user. These feed the
-- SVD recommender and the Kenyan algorithm bridge.
create table if not exists public.ratings (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  movie_id   integer,
  movie_slug text,
  rating     numeric(2,1) not null check (rating between 0.5 and 5.0),
  rated_at   timestamptz not null default now(),
  check (movie_id is not null or movie_slug is not null)
);

-- One rating per (user, movie). Postgres can't put COALESCE inside a primary
-- key, so we enforce uniqueness through two partial unique indexes — one per
-- non-null key. The surrogate `id` column gives PostgREST a stable row handle.
create unique index if not exists ratings_user_movie_id_unique
  on public.ratings (user_id, movie_id)
  where movie_id is not null;

create unique index if not exists ratings_user_movie_slug_unique
  on public.ratings (user_id, movie_slug)
  where movie_slug is not null;

create index if not exists ratings_movie_id on public.ratings (movie_id) where movie_id is not null;
create index if not exists ratings_movie_slug on public.ratings (movie_slug) where movie_slug is not null;

alter table public.ratings enable row level security;

create policy "ratings_self_rw"
  on public.ratings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── 5. kenyan_movies ───────────────────────────────────────────────────────
-- Editorial catalogue for the Kenyan slate that the algorithm bridge ranks.
create table if not exists public.kenyan_movies (
  id                uuid primary key default gen_random_uuid(),
  slug              text unique not null,
  title             text not null,
  description       text,
  genres            text[] not null default '{}',
  mood_tags         text[] not null default '{}',
  year              integer,
  duration_minutes  integer,
  poster_url        text,
  thumbnail_url     text,
  backdrop_url      text,
  trailer_url       text,
  hls_master_url    text,                           -- direct R2 master.m3u8
  tmdb_genre_ids    integer[] not null default '{}',
  birgen_rating     numeric(3,2) default 0,         -- internal editorial score 0–5
  language          text default 'sw',
  maturity          text default 'PG-13',
  is_published      boolean not null default false,
  sort_weight       integer not null default 0,     -- higher = pinned higher
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists kenyan_movies_published_weight
  on public.kenyan_movies (is_published, sort_weight desc);

alter table public.kenyan_movies enable row level security;

create policy "kenyan_movies_public_select"
  on public.kenyan_movies for select
  using (is_published = true);

-- ── 6. notifications ───────────────────────────────────────────────────────
-- Queue written by the Cloudflare cron Worker. Dequeued by the web client.
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  type        text not null,                       -- 'screen_time_limit','screen_time_warn','new_kenyan'
  title       text not null,
  message     text not null,
  cta_url     text,
  cta_label   text,
  seen_at     timestamptz,
  dismissed_at timestamptz,
  created_at  timestamptz not null default now(),
  month       date default date_trunc('month', now())::date
);

-- Prevent duplicate notifications of the same type in the same month.
create unique index if not exists notifications_unique_monthly
  on public.notifications (user_id, type, month);

create index if not exists notifications_user_unseen
  on public.notifications (user_id, created_at desc)
  where seen_at is null;

alter table public.notifications enable row level security;

create policy "notifications_self_select"
  on public.notifications for select using (auth.uid() = user_id);

create policy "notifications_self_update"
  on public.notifications for update using (auth.uid() = user_id);

-- ── 7. update_monthly_usage() RPC ──────────────────────────────────────────
-- Rolls up current-month screen time from watch_sessions → monthly_usage.
-- Uses `watched_seconds` (cumulative unique seconds actually watched), not
-- position_seconds (which resets on scrubs).
create or replace function public.update_monthly_usage()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_month date := date_trunc('month', now())::date;
begin
  insert into public.monthly_usage as mu (user_id, month, total_seconds, updated_at)
  select
    ws.user_id,
    current_month,
    coalesce(sum(ws.watched_seconds), 0)::int,
    now()
  from public.watch_sessions ws
  where ws.updated_at >= current_month
  group by ws.user_id
  on conflict (user_id, month)
  do update set
    total_seconds = excluded.total_seconds,
    updated_at    = excluded.updated_at;
end;
$$;

grant execute on function public.update_monthly_usage() to service_role;

-- ── 8. helpful views ───────────────────────────────────────────────────────
create or replace view public.continue_watching as
select
  ws.user_id,
  ws.movie_id,
  ws.movie_slug,
  ws.position_seconds,
  ws.duration_seconds,
  ws.updated_at,
  km.title           as kenyan_title,
  km.backdrop_url    as kenyan_backdrop,
  km.hls_master_url  as kenyan_hls,
  case
    when ws.duration_seconds > 0 then
      round((ws.position_seconds::numeric / ws.duration_seconds) * 100, 1)
    else 0
  end as percent_watched
from public.watch_sessions ws
left join public.kenyan_movies km on km.slug = ws.movie_slug
where ws.position_seconds > 60
  and (ws.duration_seconds is null or ws.position_seconds < ws.duration_seconds * 0.95);

-- Views don't have RLS; inherit from the base table.
grant select on public.continue_watching to authenticated;

-- Done.
