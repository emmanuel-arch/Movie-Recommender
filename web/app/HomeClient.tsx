'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Sparkles, Star } from 'lucide-react';
import MovieCarousel from '@/components/MovieCarousel';
import ContinueWatchingRow from '@/components/ContinueWatchingRow';
import {
  CATALOG,
  toMovie,
  similarCatalogEntries,
  recommendPlayable,
  getCatalogEntryBySlug,
} from '@/lib/catalog';
import { KENYAN_HLS_MAP } from '@/lib/hls';
import { Movie } from '@/types';
import { useRatings } from '@/hooks/useRatings';
import { useMyList } from '@/hooks/useMyList';
import { useContinueWatching } from '@/hooks/useWatchSession';
import toast from 'react-hot-toast';

export default function HomeClient() {
  const { ratings, rateMovie, count, ratedMovies } = useRatings();
  const { myList, addToList, removeFromList } = useMyList();
  const { items: continueItems } = useContinueWatching();
  const myListIds = new Set(myList.map((m) => m.movieId));

  const handleRate = (movie: Movie, rating: number) => {
    rateMovie(movie, rating);
    toast.success(`Rated "${movie.title.replace(/\s*\(\d{4}\)$/, '')}" ${rating}/5`);
  };

  const carouselProps = {
    userRatings: ratings,
    onRate: handleRate,
    showRating: true,
    myListIds,
    onAddToList: addToList,
    onRemoveFromList: removeFromList,
  };

  // Slugs the viewer has actually started/finished — feeds the taste model alongside
  // their star ratings so "Recommended for you" reflects what they *watch*, not just rate.
  const watchedSlugs = useMemo(
    () =>
      continueItems
        .map((i) => i.movieSlug ?? (i.movieId != null ? KENYAN_HLS_MAP[i.movieId] : null))
        .filter((s): s is string => !!s),
    [continueItems],
  );

  // ── PLAYABLE rows (the whole top of the page streams in HD) ──────────────

  // Personalised, playable-only. Cold-start (no ratings/history) → best-reviewed
  // playable titles; diverges toward the viewer's genres as they rate and watch.
  const recommended = useMemo(
    () => recommendPlayable(ratings, watchedSlugs, 14).map(toMovie),
    [ratings, watchedSlugs],
  );

  const playable = useMemo(() => CATALOG.filter((c) => c.playable), []);

  const actionBlockbusters = useMemo(
    () =>
      playable
        .filter((c) => c.genres.some((g) => g === 'Action' || g === 'Adventure'))
        .map(toMovie),
    [playable],
  );

  const crimeThrillers = useMemo(
    () =>
      playable
        .filter((c) => c.genres.some((g) => g === 'Thriller' || g === 'Crime' || g === 'Mystery'))
        .map(toMovie),
    [playable],
  );

  const comedyFeelGood = useMemo(
    () =>
      playable
        .filter((c) => c.genres.some((g) => g === 'Comedy' || g === 'Family' || g === 'Animation'))
        .map(toMovie),
    [playable],
  );

  const acclaimedNowStreaming = useMemo(
    () =>
      [...playable]
        .filter((c) => c.tmdbVoteAverage >= 7.6)
        .sort((a, b) => b.tmdbVoteAverage - a.tmdbVoteAverage)
        .map(toMovie),
    [playable],
  );

  // "Because you watched X" — seeded from the latest rating, but only ever suggests
  // playable titles so the row stays clickable-to-stream.
  const becauseSeed = ratedMovies[ratedMovies.length - 1]?.movie;
  const becauseEntry = becauseSeed
    ? CATALOG.find((c) => c.movieId === becauseSeed.movieId) ||
      getCatalogEntryBySlug(becauseSeed.slug ?? '')
    : undefined;
  const becauseYouWatched = useMemo(() => {
    if (!becauseEntry) return [];
    return similarCatalogEntries(becauseEntry, 16)
      .filter((c) => c.playable && c.movieId !== becauseEntry.movieId)
      .slice(0, 10)
      .map(toMovie);
  }, [becauseEntry]);

  const rateMorePool = useMemo(() => {
    return [...playable]
      .filter((c) => !ratings.has(c.movieId))
      .sort((a, b) => b.tmdbVoteAverage - a.tmdbVoteAverage)
      .slice(0, 14)
      .map(toMovie);
  }, [playable, ratings]);

  // ── COMING-SOON rows (not yet streamable — anchored to the bottom) ───────
  const kenyanOriginals = useMemo(
    () => CATALOG.filter((c) => c.kenyanOriginal).map(toMovie),
    [],
  );

  const africanStories = useMemo(
    () => CATALOG.filter((c) => c.panAfrican && !c.kenyanOriginal).map(toMovie),
    [],
  );

  const comingSoonRow = useMemo(
    () =>
      CATALOG.filter((c) => c.comingSoon && !c.kenyanOriginal && !c.panAfrican).map(toMovie),
    [],
  );

  const watchOnBadge = (
    <span className="ml-2 rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-white/10 text-white/90 border border-white/20">
      Watch on BirgenAI
    </span>
  );

  return (
    <div className="pb-8">
      <ContinueWatchingRow />

      <MovieCarousel
        title="Recommended for you"
        subtitle={
          count > 0
            ? 'Tuned to the titles you rate and watch — all streaming now'
            : 'Top picks streaming now — rate a few to make these yours'
        }
        movies={recommended}
        badge={watchOnBadge}
        {...carouselProps}
      />

      <MovieCarousel
        title="Action & blockbusters"
        subtitle="High-octane tentpoles — chases, heists, and impossible odds, all in HD"
        movies={actionBlockbusters}
        {...carouselProps}
      />

      <MovieCarousel
        title="Crime, thrillers & mind-benders"
        subtitle="High stakes, moral grey zones, twists you won't see coming"
        movies={crimeThrillers}
        {...carouselProps}
      />

      <MovieCarousel
        title="Laugh-out-loud & feel-good"
        subtitle="Lighter, warmer, funnier — easy streams for any night"
        movies={comedyFeelGood}
        {...carouselProps}
      />

      <MovieCarousel
        title="Critically acclaimed — now streaming"
        subtitle="The highest-rated titles in the catalogue, ready to play"
        movies={acclaimedNowStreaming}
        {...carouselProps}
      />

      {becauseEntry && becauseYouWatched.length > 0 && (
        <MovieCarousel
          title={`Because you watched ${becauseEntry.displayTitle}`}
          subtitle="Streaming picks stitched from overlapping DNA in your taste"
          movies={becauseYouWatched}
          {...carouselProps}
        />
      )}

      {count < 10 && rateMorePool.length > 0 && (
        <MovieCarousel
          title="Rate more, get better picks"
          subtitle="Quick taps train your row above — no typing required"
          movies={rateMorePool}
          {...carouselProps}
        />
      )}

      {/* ── Coming soon / not yet streaming — anchored below the playable rows ── */}
      <MovieCarousel
        title="Kenyan originals"
        subtitle="Our homegrown lane — staging on the platform, launching soon"
        movies={kenyanOriginals}
        {...carouselProps}
      />

      <MovieCarousel
        title="African stories"
        subtitle="Nollywood · South Africa · pan-African voices — licensing soon"
        movies={africanStories}
        {...carouselProps}
      />

      <MovieCarousel
        title="Coming soon"
        subtitle="Licensed windows opening — tap a card for notify-me on launch"
        movies={comingSoonRow}
        {...carouselProps}
      />

      {count < 5 && (
        <div className="mx-4 sm:mx-6 lg:mx-12 mt-10 mb-4 p-8 rounded-2xl bg-gradient-to-br from-birgen-dark to-birgen-card border border-birgen-border text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-birgen-red/10 border border-birgen-red/20 mb-4">
            <Star className="w-7 h-7 text-birgen-red" />
          </div>
          <h3 className="text-white text-2xl font-bold mb-2">
            Rate a few titles to personalise your picks
          </h3>
          <p className="text-birgen-muted mb-6 max-w-md mx-auto">
            Tap the stars on any movie you&apos;ve seen — your &ldquo;Recommended for you&rdquo; row
            re-tunes instantly. Or train on the wider TMDB catalogue for even sharper matches.
          </p>
          <Link
            href="/onboarding"
            className="inline-flex items-center gap-2 px-6 py-3 bg-birgen-red hover:bg-birgen-red-light text-white font-semibold rounded-lg transition-all hover:scale-105 active:scale-95 red-glow"
          >
            <Sparkles className="w-4 h-4" />
            Train your AI (TMDB picks)
          </Link>
        </div>
      )}
    </div>
  );
}
