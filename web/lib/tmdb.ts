// TMDB API integration for movie posters and metadata
// Uses Bearer token (API Read Access Token) for server-side calls

const TMDB_READ_TOKEN = process.env.TMDB_READ_ACCESS_TOKEN || '';
const TMDB_API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY || '';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG = 'https://image.tmdb.org/t/p';

/** Build headers — prefer Bearer token; fall back to API key query param */
function tmdbHeaders(): HeadersInit {
  if (TMDB_READ_TOKEN) {
    return {
      Authorization: `Bearer ${TMDB_READ_TOKEN}`,
      'Content-Type': 'application/json',
    };
  }
  return {};
}

/** Append api_key if we don't have a Bearer token */
function tmdbUrl(path: string, params: Record<string, string> = {}): string {
  const url = new URL(`${TMDB_BASE}${path}`);
  if (!TMDB_READ_TOKEN && TMDB_API_KEY) {
    url.searchParams.set('api_key', TMDB_API_KEY);
  }
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return url.toString();
}

export const tmdbPoster = (
  path: string | null,
  size: 'w342' | 'w500' | 'w780' | 'original' = 'w500',
) => (path ? `${TMDB_IMG}/${size}${path}` : null);

export const tmdbBackdrop = (
  path: string | null,
  size: 'w780' | 'w1280' | 'original' = 'w1280',
) => (path ? `${TMDB_IMG}/${size}${path}` : null);

export async function searchTMDB(title: string, year?: string) {
  if (!TMDB_READ_TOKEN && !TMDB_API_KEY) return null;
  try {
    const url = tmdbUrl('/search/movie', {
      query: title,
      ...(year ? { year } : {}),
    });
    const res = await fetch(url, { headers: tmdbHeaders(), next: { revalidate: 86400 } });
    if (!res.ok) return null;
    const data = await res.json();
    return data.results?.[0] || null;
  } catch {
    return null;
  }
}

export async function getTMDBById(tmdbId: number) {
  if (!TMDB_READ_TOKEN && !TMDB_API_KEY) return null;
  try {
    const url = tmdbUrl(`/movie/${tmdbId}`, { append_to_response: 'credits' });
    const res = await fetch(url, { headers: tmdbHeaders(), next: { revalidate: 86400 } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Get trending movies from TMDB for the hero banner */
export async function getTrending(timeWindow: 'day' | 'week' = 'week') {
  if (!TMDB_READ_TOKEN && !TMDB_API_KEY) return [];
  try {
    const url = tmdbUrl(`/trending/movie/${timeWindow}`);
    const res = await fetch(url, { headers: tmdbHeaders(), next: { revalidate: 3600 } });
    if (!res.ok) return [];
    const data = await res.json();
    return data.results || [];
  } catch {
    return [];
  }
}

// Enrich a list of movies with TMDB poster/backdrop URLs
export async function enrichMoviesWithPosters(
  movies: Array<{ movieId: number; title: string; year?: string | null }>
) {
  const enriched = await Promise.all(
    movies.map(async (movie) => {
      const tmdb = await searchTMDB(
        movie.title.replace(/\s*\(\d{4}\)\s*$/, '').trim(),
        movie.year ?? undefined,
      );
      return {
        ...movie,
        poster_url: tmdb ? tmdbPoster(tmdb.poster_path) : null,
        backdrop_url: tmdb ? tmdbBackdrop(tmdb.backdrop_path) : null,
        overview: tmdb?.overview || '',
        tmdb_id: tmdb?.id || null,
      };
    }),
  );
  return enriched;
}

// Server-side batch enrichment with rate limiting
export async function batchEnrichMovies(
  movies: Array<{ movieId: number; title: string; year?: string | null }>,
  batchSize = 8,
) {
  const results: Array<Record<string, unknown>> = [];
  for (let i = 0; i < movies.length; i += batchSize) {
    const batch = movies.slice(i, i + batchSize);
    const enriched = await Promise.all(
      batch.map(async (m) => {
        const tmdb = await searchTMDB(
          m.title.replace(/\s*\(\d{4}\)\s*$/, '').trim(),
          m.year ?? undefined,
        );
        return {
          ...m,
          poster_url: tmdb ? tmdbPoster(tmdb.poster_path) : null,
          backdrop_url: tmdb ? tmdbBackdrop(tmdb.backdrop_path) : null,
          overview: tmdb?.overview || '',
          tmdb_id: tmdb?.id,
        };
      }),
    );
    results.push(...enriched);
    // Small delay to avoid TMDB rate limiting (40 req/s)
    if (i + batchSize < movies.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  return results;
}
