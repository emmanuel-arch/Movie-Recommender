'use client';
/**
 * "Now Streaming in HD" — the top content row, rendered directly under the Hero and
 * ABOVE the Top 5 section. It groups the freshly added full-HD (1080p) titles by
 * AVAILABILITY/QUALITY rather than genre (the Netflix "Recently Added / Now in HD"
 * pattern), so a drama like Candy Jar sits naturally beside an action tentpole like
 * Fast X. Each title also carries real genres, so it additionally surfaces in the
 * genre rows below (Action & adventure, Feel-good, etc.).
 *
 * Self-contained (its own rating/list hooks) so it can live in the server-rendered
 * home page without threading props through. Titles whose HLS hasn't been uploaded yet
 * are simply `playable: false` in the catalog → the card opens a "Coming Soon" sheet
 * until their upload lands and the flag is flipped.
 */

import { useMemo } from 'react';
import MovieCarousel from '@/components/MovieCarousel';
import { hdFeaturedEntries, toMovie } from '@/lib/catalog';
import { useRatings } from '@/hooks/useRatings';
import { useMyList } from '@/hooks/useMyList';
import { Movie } from '@/types';
import toast from 'react-hot-toast';

export default function FeaturedHDRow() {
  const { ratings, rateMovie } = useRatings();
  const { myList, addToList, removeFromList } = useMyList();
  const myListIds = new Set(myList.map((m) => m.movieId));

  const movies = useMemo(() => hdFeaturedEntries().map(toMovie), []);
  if (movies.length === 0) return null;

  const handleRate = (movie: Movie, rating: number) => {
    rateMovie(movie, rating);
    toast.success(`Rated "${movie.title.replace(/\s*\(\d{4}\)$/, '')}" ${rating}/5`);
  };

  const hdBadge = (
    <span className="ml-2 rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-birgen-red/90 text-white">
      HD
    </span>
  );

  return (
    <MovieCarousel
      title="Now Streaming in HD"
      subtitle="Freshly added — full 1080p, play now"
      movies={movies}
      badge={hdBadge}
      userRatings={ratings}
      onRate={handleRate}
      showRating
      myListIds={myListIds}
      onAddToList={addToList}
      onRemoveFromList={removeFromList}
    />
  );
}
