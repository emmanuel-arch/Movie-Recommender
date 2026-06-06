'use client';
/**
 * Thin wrapper that renders the unified VideoPlayer for a playable movie slug,
 * wiring up the recommended "Next Movie" (Top 5 order, wrapping). Use this for
 * any in-place (modal) full-movie playback so every avenue is identical.
 *
 *   - onChangeSlug provided → Next/Ended swap the movie in place (modal usage)
 *   - onChangeSlug omitted  → Next/Ended just close
 */

import VideoPlayer from '@/components/VideoPlayer';
import { getPlayableBySlug, getNextPlayable } from '@/lib/playableMovies';
import { getStreamMp4Url } from '@/lib/stream';
import { getSubtitleTracksForSlug } from '@/lib/subtitles';

function runtimeLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function FullMoviePlayer({
  slug,
  onClose,
  onChangeSlug,
}: {
  slug: string;
  onClose: () => void;
  onChangeSlug?: (slug: string) => void;
}) {
  const movie = getPlayableBySlug(slug);
  if (!movie) return null;

  const next = getNextPlayable(slug);
  const goNext = () => {
    if (next && onChangeSlug) onChangeSlug(next.slug);
    else onClose();
  };

  return (
    <VideoPlayer
      src={movie.src}
      fallbackMp4={getStreamMp4Url(movie.movieId)}
      poster={movie.backdrop}
      title={movie.title}
      subtitle={`${movie.year} · ${movie.maturity} · ${runtimeLabel(movie.runtimeMinutes)}`}
      subtitles={getSubtitleTracksForSlug(slug)}
      fullMovie
      target={{ movieSlug: slug }}
      onClose={onClose}
      onEnded={goNext}
      nextUp={
        next
          ? {
              title: next.title,
              year: next.year,
              overview: next.overview,
              backdrop: next.backdrop,
              onPlay: goNext,
            }
          : null
      }
    />
  );
}
