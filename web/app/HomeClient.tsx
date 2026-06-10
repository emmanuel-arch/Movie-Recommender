'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Sparkles, Star } from 'lucide-react';
import MovieCarousel from '@/components/MovieCarousel';
import ContinueWatchingRow from '@/components/ContinueWatchingRow';
import {
  CATALOG,
  isCriticallyAcclaimed,
  toMovie,
  similarCatalogEntries,
  getCatalogEntryBySlug,
} from '@/lib/catalog';
import { getRecommendations } from '@/lib/api';
import { Movie } from '@/types';
import { useRatings } from '@/hooks/useRatings';
import { useMyList } from '@/hooks/useMyList';
import toast from 'react-hot-toast';

export default function HomeClient() {
  const [recoMovies, setRecoMovies] = useState<Movie[]>([]);
  const [recoLoading, setRecoLoading] = useState(false);
  const { ratings, rateMovie, count, ratedMovies, getRatingInputs } = useRatings();
  const { myList, addToList, removeFromList } = useMyList();
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

  useEffect(() => {
    if (count < 5) {
      setRecoMovies([]);
      return;
    }
    let cancelled = false;
    setRecoLoading(true);
    const inputs = getRatingInputs();
    getRecommendations(inputs, 16)
      .then((rows) => {
        if (cancelled) return;
        const unrated = rows.filter((m) => !ratings.has(m.movieId));
        setRecoMovies(unrated.slice(0, 14));
      })
      .catch(() => {
        if (!cancelled) toast.error('Could not load recommendations');
      })
      .finally(() => {
        if (!cancelled) setRecoLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [count, getRatingInputs, ratings]);

  const newOnBirgen = useMemo(
    () =>
      [...CATALOG]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 12)
        .map(toMovie),
    [],
  );

  const kenyanOriginals = useMemo(
    () => CATALOG.filter((c) => c.kenyanOriginal).map(toMovie),
    [],
  );

  const criticallyAcclaimed = useMemo(
    () => CATALOG.filter((c) => isCriticallyAcclaimed(c)).map(toMovie),
    [],
  );

  const darkPsych = useMemo(
    () => CATALOG.filter((c) => c.darkPsychological).map(toMovie),
    [],
  );

  const africanStories = useMemo(
    () => CATALOG.filter((c) => c.panAfrican).map(toMovie),
    [],
  );

  // Genre rows — let each HD title also live in a genre-coherent row. The action
  // tentpoles land here; Candy Jar (Drama/Comedy) is excluded and surfaces in feel-good.
  const actionAdventure = useMemo(
    () =>
      CATALOG.filter((c) => c.genres.some((g) => g === 'Action' || g === 'Adventure')).map(
        toMovie,
      ),
    [],
  );

  const feelGood = useMemo(
    () =>
      CATALOG.filter((c) => c.genres.some((g) => g === 'Comedy' || g === 'Family')).map(toMovie),
    [],
  );

  const becauseSeed = ratedMovies[ratedMovies.length - 1]?.movie;
  const becauseEntry = becauseSeed
    ? CATALOG.find((c) => c.movieId === becauseSeed.movieId) ||
      getCatalogEntryBySlug(becauseSeed.slug ?? '')
    : undefined;
  const becauseYouWatched = useMemo(() => {
    if (!becauseEntry) return [];
    return similarCatalogEntries(becauseEntry, 8).map(toMovie);
  }, [becauseEntry]);

  const rateMorePool = useMemo(() => {
    const unrated = CATALOG.filter((c) => !ratings.has(c.movieId));
    return [...unrated]
      .sort((a, b) => b.tmdbVoteAverage - a.tmdbVoteAverage)
      .slice(0, 14)
      .map(toMovie);
  }, [ratings]);

  const comingSoonRow = useMemo(
    () => CATALOG.filter((c) => c.comingSoon).map(toMovie),
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

      {count >= 5 && (
        <MovieCarousel
          title="Recommended for you"
          subtitle="From your taste profile — unlocks after 5+ ratings"
          movies={recoMovies}
          loading={recoLoading}
          badge={watchOnBadge}
          {...carouselProps}
        />
      )}

      <MovieCarousel
        title="Kenyan originals"
        subtitle="Our homegrown lane — plus locked originals staging on the platform"
        movies={kenyanOriginals}
        {...carouselProps}
      />

      <MovieCarousel
        title="Critically acclaimed"
        subtitle="TMDB-loved titles curated for your mood profile"
        movies={criticallyAcclaimed}
        {...carouselProps}
      />

      <MovieCarousel
        title="Action & adventure"
        subtitle="High-octane tentpoles — chases, heists, and impossible odds"
        movies={actionAdventure}
        {...carouselProps}
      />

      <MovieCarousel
        title="Dark & psychological"
        subtitle="High stakes, moral grey zones, cinematic shadows"
        movies={darkPsych}
        {...carouselProps}
      />

      <MovieCarousel
        title="African stories"
        subtitle="Nollywood · South Africa · East Africa · pan-African voices"
        movies={africanStories}
        {...carouselProps}
      />

      <MovieCarousel
        title="Feel-good favourites"
        subtitle="Lighter, warmer, funnier — easy watches for any night"
        movies={feelGood}
        {...carouselProps}
      />

      <MovieCarousel
        title="New on BirgenAI"
        subtitle="Recently dated on the roadmap — check back as shipments land"
        movies={newOnBirgen}
        {...carouselProps}
      />

      {becauseEntry && becauseYouWatched.length > 0 && (
        <MovieCarousel
          title={`Because you watched ${becauseEntry.displayTitle}`}
          subtitle="Picks stitched from overlapping DNA in your catalogue"
          movies={becauseYouWatched}
          {...carouselProps}
        />
      )}

      {count < 10 && rateMorePool.length > 0 && (
        <MovieCarousel
          title="Rate more, get better picks"
          subtitle="Quick taps train the algo — no typing required"
          movies={rateMorePool}
          {...carouselProps}
        />
      )}

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
            Rate {5 - count} more movie{5 - count !== 1 ? 's' : ''} to unlock your picks
          </h3>
          <p className="text-birgen-muted mb-6 max-w-md mx-auto">
            BirgenAI needs at least 5 ratings to light up the full recommendation engine — use Train Your AI for
            the TMDB catalogue, while you watch the Kenyan lane here.
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
