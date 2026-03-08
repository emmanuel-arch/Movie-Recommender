import axios from 'axios';
import { Movie, RatingInput, RecommendRequest } from '@/types';
import { enrichMoviesWithStreamUrls } from '@/lib/stream';

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  'https://birgenai-api-529186868469.us-central1.run.app';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

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
    // If enrichment fails, still try to add stream URLs
    return enrichMoviesWithStreamUrls(movies);
  }
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
  const { data } = await api.get<Movie[]>('/movies/popular', { params: { n } });
  // Extract year from title "(YYYY)" if not already set
  const withYear = data.map((m) => {
    if (!m.year) {
      const match = m.title.match(/\((\d{4})\)\s*$/);
      if (match) m.year = match[1];
    }
    return m;
  });
  return enrichWithPosters(withYear);
}

export async function searchMovies(query: string, limit: number = 20): Promise<Movie[]> {
  const { data } = await api.get<Movie[]>('/movies/search', {
    params: { q: query, limit },
  });
  const withYear = data.map((m) => {
    if (!m.year) {
      const match = m.title.match(/\((\d{4})\)\s*$/);
      if (match) m.year = match[1];
    }
    return m;
  });
  return enrichWithPosters(withYear);
}

export async function getRecommendations(
  ratings: RatingInput[],
  n: number = 20,
): Promise<Movie[]> {
  const payload: RecommendRequest = { ratings, n };
  const { data } = await api.post<Movie[]>('/recommend', payload);
  const withYear = data.map((m) => {
    if (!m.year) {
      const match = m.title.match(/\((\d{4})\)\s*$/);
      if (match) m.year = match[1];
    }
    return m;
  });
  return enrichWithPosters(withYear);
}
