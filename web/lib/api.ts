import axios, { type AxiosError, type AxiosRequestConfig } from 'axios';
import { Movie, RatingInput, RecommendRequest } from '@/types';
import { enrichMoviesWithStreamUrls } from '@/lib/stream';
import type { KenyanMovie } from '@/lib/supabase/types';

/**
 * Preferred base URL (in priority order):
 *   1. NEXT_PUBLIC_API_URL             — explicit override
 *   2. NEXT_PUBLIC_API_PROXY_URL       — Cloudflare Worker edge cache (birgenai.com/api)
 *   3. Cloud Run origin                — absolute fallback
 *
 * Routing requests through the Worker kills 429s because the Worker caches
 * hot endpoints (/movies/popular, /movies/search, /kenyan/*) at the edge
 * and only misses occasionally.
 */
const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API_PROXY_URL ||
  'https://birgenai-api-529186868469.us-central1.run.app';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// ── Retry with exponential backoff for 429 / 5xx ──────────────────────
const RETRY_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_RETRIES = 3;

async function withRetry<T>(
  fn: () => Promise<T>,
  retries = MAX_RETRIES,
): Promise<T> {
  let attempt = 0;
  let lastErr: unknown = null;
  while (attempt <= retries) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const axErr = e as AxiosError;
      const status = axErr.response?.status ?? 0;
      const retryable = !axErr.response || RETRY_STATUS.has(status);
      if (!retryable || attempt === retries) break;
      // Respect Retry-After when present.
      const retryAfter = Number(axErr.response?.headers?.['retry-after']);
      const delay = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : Math.min(500 * 2 ** attempt + Math.random() * 300, 6000);
      await new Promise((r) => setTimeout(r, delay));
      attempt += 1;
    }
  }
  throw lastErr;
}

async function apiGet<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  return withRetry(async () => (await api.get<T>(url, config)).data);
}

async function apiPost<T>(url: string, body: unknown, config?: AxiosRequestConfig): Promise<T> {
  return withRetry(async () => (await api.post<T>(url, body, config)).data);
}

// ── TMDB enrichment (client → Next.js API route) ───────────────────
async function enrichWithPosters(movies: Movie[]): Promise<Movie[]> {
  if (!movies.length) return movies;
  try {
    const res = await fetch('/api/enrich', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(movies),
    });
    if (!res.ok) throw new Error('Enrich failed');
    const enriched = (await res.json()) as Movie[];
    return enrichMoviesWithStreamUrls(enriched);
  } catch {
    return enrichMoviesWithStreamUrls(movies);
  }
}

function withYear(movies: Movie[]): Movie[] {
  return movies.map((m) => {
    if (!m.year) {
      const match = m.title.match(/\((\d{4})\)\s*$/);
      if (match) m.year = match[1];
    }
    return m;
  });
}

// ── Public helpers ──────────────────────────────────────────────────
export async function healthCheck(): Promise<boolean> {
  try {
    await api.get('/');
    return true;
  } catch {
    return false;
  }
}

export async function getPopularMovies(n: number = 50): Promise<Movie[]> {
  const data = await apiGet<Movie[]>('/movies/popular', { params: { n } });
  return enrichWithPosters(withYear(data));
}

export async function searchMovies(query: string, limit: number = 20): Promise<Movie[]> {
  const data = await apiGet<Movie[]>('/movies/search', { params: { q: query, limit } });
  return enrichWithPosters(withYear(data));
}

export async function getRecommendations(
  ratings: RatingInput[],
  n: number = 20,
): Promise<Movie[]> {
  const payload: RecommendRequest = { ratings, n };
  const data = await apiPost<Movie[]>('/recommend', payload);
  return enrichWithPosters(withYear(data));
}

// ── Kenyan (algorithm bridge) ──────────────────────────────────────
export interface KenyanRecommendation extends KenyanMovie {
  match_score: number;
}

export async function getKenyanCatalogue(): Promise<KenyanMovie[]> {
  return apiGet<KenyanMovie[]>('/kenyan/catalogue');
}

export async function getKenyanRecommendationsForUser(
  userId: string,
  n: number = 10,
): Promise<KenyanRecommendation[]> {
  return apiGet<KenyanRecommendation[]>(`/kenyan/recommendations/${userId}`, {
    params: { n },
  });
}

export async function getKenyanRecommendationsGuest(
  ratings: RatingInput[],
  n: number = 10,
): Promise<KenyanRecommendation[]> {
  return apiPost<KenyanRecommendation[]>('/kenyan/recommendations', { ratings, n });
}
