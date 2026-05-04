/**
 * HLS source resolution + small helpers.
 *
 *   getKenyanHlsUrl(slug)  → https://<R2_PUBLIC_HOST>/Videos/<slug>/master.m3u8
 *   getKenyanPosterUrl(slug)
 *
 * The 5 launch titles are mapped below until the Supabase `kenyan_movies`
 * table takes over at runtime (client fetches the catalogue and caches it).
 */

const R2_BASE = (process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? '').replace(/\/$/, '');
/** e.g. `Videos` (default) or `Videos/films` to match your R2 layout. */
const HLS_ROOT = (process.env.NEXT_PUBLIC_HLS_ROOT ?? 'Videos').replace(/\/$/, '');

/**
 * MovieLens ID → Kenyan catalogue slug, for the featured 5 titles.
 * When you add more HLS-streamed movies, either extend this map OR publish
 * the movie in Supabase with `hls_master_url` set.
 */
export const KENYAN_HLS_MAP: Record<number, string> = {
  168250: 'get-out',
  139644: 'sicario',
  79132: 'inception',
  58559: 'the-dark-knight',
  74458: 'shutter-island',
};

export function getKenyanHlsUrl(slug: string): string | null {
  if (!R2_BASE || !slug) return null;
  return `${R2_BASE}/${HLS_ROOT}/${slug}/master.m3u8`;
}

export function getKenyanPosterUrl(slug: string): string | null {
  if (!R2_BASE || !slug) return null;
  return `${R2_BASE}/${HLS_ROOT}/${slug}/poster.jpg`;
}

export function getHlsUrlForMovieId(movieId: number): string | null {
  const slug = KENYAN_HLS_MAP[movieId];
  return slug ? getKenyanHlsUrl(slug) : null;
}

export function getSlugForMovieId(movieId: number): string | null {
  return KENYAN_HLS_MAP[movieId] ?? null;
}

/** Returns true if this movie is streamable through our R2-backed HLS pipeline. */
export function hasHlsStream(movieId: number): boolean {
  return !!R2_BASE && !!KENYAN_HLS_MAP[movieId];
}

/** Feature detection — used by the player to pick HLS.js vs native playback. */
export function isHlsUrl(src: string | null | undefined): boolean {
  return !!src && /\.m3u8($|\?)/i.test(src);
}
