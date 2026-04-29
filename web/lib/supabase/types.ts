/**
 * Shared Supabase row types — mirror `infra/supabase/schema.sql`.
 * Keep these in sync when you change the schema.
 */

export interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  plan: 'free' | 'premium';
  country: string | null;
  /**
   * Stable cross-subdomain identifier of the form `BIR-XXXXXXXX`. Assigned
   * automatically on signup by `public.handle_new_user()` and unique across
   * every BirgenAI property.
   */
  birgenai_id: string;
  /** Set after email OTP verification (after migration `03_otp_usermaster.sql`). */
  otp_verified_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface WatchingProfile {
  id: string;
  user_id: string;
  name: string;
  avatar_key: string;
  is_kids: boolean;
  is_default: boolean;
  pin: string | null;
  created_at: string;
  updated_at: string;
}

export interface WatchSession {
  id: string;
  user_id: string;
  movie_id: number | null;
  movie_slug: string | null;
  position_seconds: number;
  duration_seconds: number | null;
  watched_seconds: number;
  device: string | null;
  started_at: string;
  updated_at: string;
}

export interface MonthlyUsage {
  user_id: string;
  month: string;
  total_seconds: number;
  updated_at: string;
}

export interface Rating {
  user_id: string;
  movie_id: number | null;
  movie_slug: string | null;
  rating: number;
  rated_at: string;
}

export interface KenyanMovie {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  genres: string[];
  mood_tags: string[];
  year: number | null;
  duration_minutes: number | null;
  poster_url: string | null;
  thumbnail_url: string | null;
  backdrop_url: string | null;
  trailer_url: string | null;
  hls_master_url: string | null;
  tmdb_genre_ids: number[];
  birgen_rating: number;
  language: string;
  maturity: string;
  is_published: boolean;
  sort_weight: number;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: 'screen_time_limit' | 'screen_time_warn' | 'new_kenyan' | string;
  title: string;
  message: string;
  cta_url: string | null;
  cta_label: string | null;
  seen_at: string | null;
  dismissed_at: string | null;
  created_at: string;
  month: string | null;
}

export interface ContinueWatchingView {
  user_id: string;
  movie_id: number | null;
  movie_slug: string | null;
  position_seconds: number;
  duration_seconds: number | null;
  updated_at: string;
  kenyan_title: string | null;
  kenyan_backdrop: string | null;
  kenyan_hls: string | null;
  percent_watched: number;
}
