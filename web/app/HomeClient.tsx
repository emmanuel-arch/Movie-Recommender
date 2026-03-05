'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Sparkles, Star } from 'lucide-react';
import MovieCarousel from '@/components/MovieCarousel';
import { getPopularMovies } from '@/lib/api';
import { Movie } from '@/types';
import { useRatings } from '@/hooks/useRatings';
import toast from 'react-hot-toast';

const GENRE_FILTERS: Record<string, string[]> = {
  Action: ['Action'],
  Comedy: ['Comedy'],
  Drama: ['Drama'],
  Sci_Fi: ['Sci-Fi'],
  Horror: ['Horror'],
  Thriller: ['Thriller'],
};

function filterByGenre(movies: Movie[], genres: string[]) {
  return movies.filter((m) => genres.some((g) => m.genres?.includes(g)));
}

export default function HomeClient() {
  const [allMovies, setAllMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const { ratings, rateMovie, count, hasEnoughRatings } = useRatings();

  useEffect(() => {
    getPopularMovies(100)
      .then(setAllMovies)
      .catch(() => toast.error('Failed to load movies'))
      .finally(() => setLoading(false));
  }, []);

  const handleRate = (movie: Movie, rating: number) => {
    rateMovie(movie, rating);
    toast.success(`Rated "${movie.title.replace(/\s*\(\d{4}\)$/, '')}" ${rating}/5 ⭐`);
  };

  return (
    <div className="pb-8">
      {/* Carousels */}
      <MovieCarousel
        title="🔥 Trending & Popular"
        subtitle="Top-rated movies loved by millions"
        movies={allMovies.slice(0, 30)}
        loading={loading}
        userRatings={ratings}
        onRate={handleRate}
        showRating
      />

      <MovieCarousel
        title="🎬 Action & Adventure"
        movies={filterByGenre(allMovies, ['Action']).slice(0, 20)}
        loading={loading}
        userRatings={ratings}
        onRate={handleRate}
        showRating
      />

      <MovieCarousel
        title="😂 Comedy"
        movies={filterByGenre(allMovies, ['Comedy']).slice(0, 20)}
        loading={loading}
        userRatings={ratings}
        onRate={handleRate}
        showRating
      />

      <MovieCarousel
        title="🎭 Drama"
        movies={filterByGenre(allMovies, ['Drama']).slice(0, 20)}
        loading={loading}
        userRatings={ratings}
        onRate={handleRate}
        showRating
      />

      <MovieCarousel
        title="🚀 Sci-Fi"
        movies={filterByGenre(allMovies, ['Sci-Fi']).slice(0, 20)}
        loading={loading}
        userRatings={ratings}
        onRate={handleRate}
        showRating
      />

      <MovieCarousel
        title="👻 Horror & Thriller"
        movies={filterByGenre(allMovies, ['Horror', 'Thriller']).slice(0, 20)}
        loading={loading}
        userRatings={ratings}
        onRate={handleRate}
        showRating
      />

      {/* Onboarding CTA */}
      {count < 5 && (
        <div className="mx-4 sm:mx-6 lg:mx-8 mt-10 mb-4 p-8 rounded-2xl bg-gradient-to-br from-birgen-dark to-birgen-card border border-birgen-border text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-birgen-red/10 border border-birgen-red/20 mb-4">
            <Star className="w-7 h-7 text-birgen-red" />
          </div>
          <h3 className="text-white text-2xl font-bold mb-2">
            Rate {5 - count} more movie{5 - count !== 1 ? 's' : ''} to unlock your picks
          </h3>
          <p className="text-birgen-muted mb-6 max-w-md mx-auto">
            BirgenAI needs at least 5 ratings to generate personalized recommendations. The more you rate, the better it gets.
          </p>
          <Link
            href="/onboarding"
            className="inline-flex items-center gap-2 px-6 py-3 bg-birgen-red hover:bg-birgen-red-light text-white font-semibold rounded-lg transition-all hover:scale-105 active:scale-95 red-glow"
          >
            <Sparkles className="w-4 h-4" />
            Rate Top Movies
          </Link>
        </div>
      )}
    </div>
  );
}
