'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Sparkles, RefreshCw, Star, ArrowLeft, TrendingUp } from 'lucide-react';
import Navbar from '@/components/Navbar';
import MovieCard, { MovieCardSkeleton } from '@/components/MovieCard';
import { useRatings, useRecommendations } from '@/hooks/useRatings';
import { Movie } from '@/types';
import toast from 'react-hot-toast';

export default function RecommendationsPage() {
  const { ratings, ratedMovies, rateMovie, getRatingInputs, count, hasEnoughRatings } = useRatings();
  const { recommendations, loading, error, fetchRecommendations } = useRecommendations();
  const [hasFetched, setHasFetched] = useState(false);

  useEffect(() => {
    if (hasEnoughRatings && !hasFetched) {
      fetchRecommendations(getRatingInputs(), 24);
      setHasFetched(true);
    }
  }, [hasEnoughRatings, hasFetched, fetchRecommendations, getRatingInputs]);

  const handleRefresh = () => {
    if (!hasEnoughRatings) return;
    fetchRecommendations(getRatingInputs(), 24);
    toast.success('Refreshing recommendations...');
  };

  const handleRate = (movie: Movie, rating: number) => {
    rateMovie(movie, rating);
    toast.success(`Rated ${rating}/5 ⭐`, { duration: 1500 });
  };

  if (!hasEnoughRatings) {
    return (
      <div className="min-h-screen bg-birgen-black flex flex-col">
        <Navbar ratingCount={count} />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center max-w-md">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-birgen-red/10 border border-birgen-red/20 mb-6">
              <Star className="w-9 h-9 text-birgen-red" />
            </div>
            <h1 className="font-display text-4xl text-white tracking-wide mb-3">
              NOT ENOUGH RATINGS
            </h1>
            <p className="text-birgen-muted mb-2">
              You&apos;ve rated <strong className="text-white">{count}</strong> movie{count !== 1 ? 's' : ''}.
              Rate at least <strong className="text-birgen-red">5</strong> to unlock personalized picks.
            </p>
            <div className="h-2 bg-birgen-border rounded-full overflow-hidden mb-6">
              <div
                className="h-full bg-red-gradient rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, (count / 5) * 100)}%` }}
              />
            </div>
            <Link
              href="/onboarding"
              className="inline-flex items-center gap-2 px-6 py-3 bg-birgen-red hover:bg-birgen-red-light text-white font-semibold rounded-lg transition-all hover:scale-105 active:scale-95 red-glow"
            >
              <Star className="w-4 h-4" />
              Rate Movies Now
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-birgen-black">
      <Navbar ratingCount={count} />

      {/* Header */}
      <div className="pt-24 pb-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <Link href="/onboarding" className="inline-flex items-center gap-2 text-birgen-muted hover:text-white text-sm transition-colors mb-6">
          <ArrowLeft className="w-4 h-4" />
          Back to Rating
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-end gap-4 justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-5 h-5 text-birgen-red" />
              <span className="text-birgen-red text-sm font-semibold uppercase tracking-wider">Personalized For You</span>
            </div>
            <h1 className="font-display text-4xl sm:text-5xl text-white tracking-wide">
              YOUR PICKS
            </h1>
            <p className="text-birgen-muted mt-1">
              Based on your {count} ratings · Updated by BirgenAI SVD model
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-birgen-card border border-birgen-border text-birgen-silver hover:text-white hover:border-birgen-red/30 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-birgen-red' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 sm:mx-6 lg:mx-8 max-w-7xl mb-6 p-4 rounded-xl bg-red-900/20 border border-red-500/30 text-red-400 text-sm">
          Failed to load recommendations. Please try refreshing.
        </div>
      )}

      {/* Your ratings summary */}
      <div className="px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto mb-8">
        <h2 className="text-white font-semibold mb-3 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-birgen-red" />
          Your Rating Profile
        </h2>
        <div className="flex gap-3 overflow-x-auto pb-2 scroll-container">
          {ratedMovies.map(({ movie, rating }) => (
            <div key={movie.movieId} className="flex-shrink-0 w-32 p-3 rounded-xl bg-birgen-card border border-birgen-border text-center">
              <div className="text-3xl mb-1">🎬</div>
              <p className="text-white text-xs line-clamp-2 leading-tight mb-1.5">
                {movie.title.replace(/\s*\(\d{4}\)$/, '')}
              </p>
              <div className="flex justify-center gap-0.5">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star
                    key={s}
                    className="w-2.5 h-2.5"
                    fill={rating >= s ? '#E50914' : 'none'}
                    color={rating >= s ? '#E50914' : '#6B6B6B'}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recommendations grid */}
      <div className="px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto pb-16">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-white font-semibold">
            {loading ? 'Generating...' : `${recommendations.length} Recommendations`}
          </h2>
          {!loading && recommendations.length > 0 && (
            <span className="text-birgen-muted text-xs">Sorted by predicted rating</span>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {loading
            ? Array.from({ length: 24 }).map((_, i) => <MovieCardSkeleton key={i} />)
            : recommendations.map((movie, i) => (
                <div key={movie.movieId} className="relative">
                  {/* Rank badge for top 3 */}
                  {i < 3 && (
                    <div className="absolute -top-2 -left-2 z-10 w-7 h-7 rounded-full bg-birgen-red flex items-center justify-center text-white text-xs font-bold shadow-lg">
                      #{i + 1}
                    </div>
                  )}
                  <MovieCard
                    movie={movie}
                    userRating={ratings.get(movie.movieId)}
                    onRate={handleRate}
                    showRating
                  />
                </div>
              ))}
        </div>

        {!loading && recommendations.length === 0 && !error && (
          <div className="text-center py-16">
            <p className="text-birgen-muted mb-4">No recommendations generated. Try rating more movies.</p>
            <Link href="/onboarding" className="inline-flex items-center gap-2 px-5 py-2.5 bg-birgen-red text-white font-semibold rounded-lg hover:bg-birgen-red-light transition-all">
              Rate More Movies
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
