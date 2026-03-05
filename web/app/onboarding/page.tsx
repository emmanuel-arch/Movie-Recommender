'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Star, Sparkles, Trash2, ChevronRight, Search } from 'lucide-react';
import Navbar from '@/components/Navbar';
import MovieCard from '@/components/MovieCard';
import { MovieCardSkeleton } from '@/components/MovieCard';
import SearchBar from '@/components/SearchBar';
import { getPopularMovies } from '@/lib/api';
import { Movie } from '@/types';
import { useRatings } from '@/hooks/useRatings';
import toast from 'react-hot-toast';

const GENRE_TABS = ['All', 'Action', 'Comedy', 'Drama', 'Sci-Fi', 'Horror', 'Thriller', 'Romance', 'Animation'];

export default function OnboardingPage() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeGenre, setActiveGenre] = useState('All');
  const { ratings, ratedMovies, rateMovie, removeRating, count, hasEnoughRatings } = useRatings();

  useEffect(() => {
    getPopularMovies(100)
      .then(setMovies)
      .catch(() => toast.error('Failed to load movies'))
      .finally(() => setLoading(false));
  }, []);

  const handleRate = (movie: Movie, rating: number) => {
    rateMovie(movie, rating);
    toast.success(`Rated "${movie.title.replace(/\s*\(\d{4}\)$/, '')}" ${rating}/5`, { duration: 1500 });
  };

  const filtered = activeGenre === 'All'
    ? movies
    : movies.filter((m) => m.genres?.includes(activeGenre));

  return (
    <div className="min-h-screen bg-birgen-black">
      <Navbar ratingCount={count} />

      {/* Page Header */}
      <div className="pt-24 pb-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-end gap-6 justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Star className="w-5 h-5 text-birgen-red fill-birgen-red" />
              <span className="text-birgen-red text-sm font-semibold uppercase tracking-wider">Rate Movies</span>
            </div>
            <h1 className="font-display text-4xl sm:text-5xl text-white tracking-wide">
              TRAIN YOUR AI
            </h1>
            <p className="text-birgen-muted mt-2 max-w-lg">
              Rate movies you&apos;ve watched. The more you rate, the more personalized your recommendations become. Aim for at least 10 ratings.
            </p>
          </div>

          {/* Progress */}
          <div className="flex-shrink-0 p-5 rounded-2xl bg-birgen-card border border-birgen-border min-w-[200px]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-birgen-muted text-sm">Progress</span>
              <span className="text-birgen-red font-bold">{count}/5 min</span>
            </div>
            <div className="h-2 bg-birgen-border rounded-full overflow-hidden mb-3">
              <div
                className="h-full bg-red-gradient rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, (count / 5) * 100)}%` }}
              />
            </div>
            {hasEnoughRatings ? (
              <Link
                href="/recommendations"
                className="flex items-center justify-center gap-2 w-full py-2.5 bg-birgen-red hover:bg-birgen-red-light text-white text-sm font-semibold rounded-lg transition-all hover:scale-105 active:scale-95 red-glow"
              >
                <Sparkles className="w-4 h-4" />
                See My Picks
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            ) : (
              <p className="text-birgen-muted text-xs text-center">
                Rate {Math.max(0, 5 - count)} more to unlock
              </p>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="mt-6">
          <SearchBar
            onRate={handleRate}
            userRatings={ratings}
            placeholder="Search for a specific movie to rate..."
          />
        </div>

        {/* Genre tabs */}
        <div className="flex gap-2 mt-6 overflow-x-auto pb-2 scroll-container">
          {GENRE_TABS.map((g) => (
            <button
              key={g}
              onClick={() => setActiveGenre(g)}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                activeGenre === g
                  ? 'bg-birgen-red text-white'
                  : 'bg-birgen-card border border-birgen-border text-birgen-silver hover:text-white hover:border-birgen-red/30'
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Movie grid */}
          <div className="flex-1">
            <p className="text-birgen-muted text-sm mb-4">
              {filtered.length} movies · Click stars to rate
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {loading
                ? Array.from({ length: 20 }).map((_, i) => (
                    <MovieCardSkeleton key={i} size="sm" />
                  ))
                : filtered.map((movie) => (
                    <MovieCard
                      key={movie.movieId}
                      movie={movie}
                      userRating={ratings.get(movie.movieId)}
                      onRate={handleRate}
                      showRating
                      size="sm"
                    />
                  ))}
            </div>
          </div>

          {/* Ratings sidebar */}
          {count > 0 && (
            <div className="lg:w-72 flex-shrink-0">
              <div className="sticky top-20 p-5 rounded-2xl bg-birgen-card border border-birgen-border">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-white font-semibold">Your Ratings</h3>
                  <span className="text-birgen-red text-sm font-bold">{count}</span>
                </div>
                <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                  {ratedMovies.map(({ movie, rating }) => (
                    <div key={movie.movieId} className="flex items-center gap-3 group">
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm truncate">
                          {movie.title.replace(/\s*\(\d{4}\)$/, '')}
                        </p>
                        <div className="flex gap-0.5 mt-1">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star
                              key={s}
                              className="w-3 h-3"
                              fill={rating >= s ? '#E50914' : 'none'}
                              color={rating >= s ? '#E50914' : '#6B6B6B'}
                            />
                          ))}
                        </div>
                      </div>
                      <button
                        onClick={() => removeRating(movie.movieId)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-birgen-muted hover:text-birgen-red transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                {hasEnoughRatings && (
                  <Link
                    href="/recommendations"
                    className="flex items-center justify-center gap-2 mt-4 w-full py-3 bg-birgen-red hover:bg-birgen-red-light text-white text-sm font-semibold rounded-lg transition-all hover:scale-105 active:scale-95 red-glow"
                  >
                    <Sparkles className="w-4 h-4" />
                    Get Recommendations
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
