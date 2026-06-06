/**
 * The ordered list of currently-playable full movies, derived from the catalog
 * (the "Playable now" titles, in catalog order — same order as Top 5). Drives the
 * in-player "Next Movie" recommendation: we only ever recommend a playable title,
 * and wrap around (last → first) so there's always a next movie.
 */

import { CATALOG, catalogBackdropPath, catalogPosterPath } from '@/lib/catalog';
import { getKenyanHlsUrl } from '@/lib/hls';

export interface PlayableMovie {
  slug: string;
  movieId: number;
  title: string;
  year: number;
  overview: string;
  backdrop: string;
  poster: string;
  maturity: string;
  runtimeMinutes: number;
  /** HLS master URL (may be '' if not resolvable). */
  src: string;
}

export const PLAYABLE_MOVIES: PlayableMovie[] = CATALOG.filter((e) => e.playable).map((e) => ({
  slug: e.slug,
  movieId: e.movieId,
  title: e.displayTitle,
  year: e.year,
  overview: e.overview,
  backdrop: catalogBackdropPath(e),
  poster: catalogPosterPath(e),
  maturity: e.maturity,
  runtimeMinutes: e.runtimeMinutes,
  src: getKenyanHlsUrl(e.slug) ?? '',
}));

export function getPlayableBySlug(slug: string): PlayableMovie | undefined {
  return PLAYABLE_MOVIES.find((m) => m.slug === slug);
}

export function getPlayableByMovieId(movieId: number): PlayableMovie | undefined {
  return PLAYABLE_MOVIES.find((m) => m.movieId === movieId);
}

/**
 * Next playable movie after `slug`, wrapping last → first. Falls back to the
 * first title when the current slug isn't found (or is the only one, returns
 * null to avoid recommending itself).
 */
export function getNextPlayable(slug: string | null | undefined): PlayableMovie | null {
  if (PLAYABLE_MOVIES.length === 0) return null;
  if (PLAYABLE_MOVIES.length === 1) return null;
  const i = slug ? PLAYABLE_MOVIES.findIndex((m) => m.slug === slug) : -1;
  if (i === -1) return PLAYABLE_MOVIES[0];
  return PLAYABLE_MOVIES[(i + 1) % PLAYABLE_MOVIES.length];
}

/** Subtitle languages we will support (truly selectable once VTTs are uploaded). */
export const SUPPORTED_SUBTITLE_LANGS = [
  { code: 'en', label: 'English' },
  { code: 'sw', label: 'Kiswahili' },
  { code: 'fr', label: 'French' },
] as const;

/** Audio tracks. Only English is real today; the rest are shown but locked. */
export const AUDIO_TRACKS = [
  { code: 'en', label: 'English [Original]', enabled: true },
  { code: 'fr', label: 'French', enabled: false },
  { code: 'de', label: 'German', enabled: false },
  { code: 'hi', label: 'Hindi', enabled: false },
  { code: 'it', label: 'Italian', enabled: false },
  { code: 'ja', label: 'Japanese', enabled: false },
  { code: 'pl', label: 'Polish', enabled: false },
  { code: 'pt-BR', label: 'Portuguese (Brazil)', enabled: false },
  { code: 'ru', label: 'Russian', enabled: false },
  { code: 'es-419', label: 'Spanish (Latin America)', enabled: false },
  { code: 'es-ES', label: 'Spanish (Spain)', enabled: false },
] as const;

/** Locked subtitle languages shown below the supported ones (display-only). */
export const LOCKED_SUBTITLE_LANGS = [
  'Arabic',
  'Chinese (Simplified)',
  'Chinese (Traditional)',
  'Croatian',
  'Czech',
  'Danish',
  'Dutch',
  'Finnish',
  'German',
  'Greek',
  'Hebrew',
  'Hindi',
  'Italian',
  'Japanese',
  'Korean',
  'Polish',
  'Portuguese (Brazil)',
  'Russian',
  'Spanish (Latin America)',
  'Spanish (Spain)',
  'Turkish',
] as const;

export const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5] as const;
