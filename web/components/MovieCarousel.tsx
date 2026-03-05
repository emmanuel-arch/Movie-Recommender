'use client';
import { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import MovieCard, { MovieCardSkeleton } from './MovieCard';
import { Movie } from '@/types';

interface MovieCarouselProps {
  title: string;
  subtitle?: string;
  movies: Movie[];
  loading?: boolean;
  userRatings?: Map<number, number>;
  onRate?: (movie: Movie, rating: number) => void;
  showRating?: boolean;
  badge?: React.ReactNode;
}

export default function MovieCarousel({
  title,
  subtitle,
  movies,
  loading = false,
  userRatings,
  onRate,
  showRating = false,
  badge,
}: MovieCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (dir: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const amount = scrollRef.current.clientWidth * 0.75;
    scrollRef.current.scrollBy({
      left: dir === 'right' ? amount : -amount,
      behavior: 'smooth',
    });
  };

  return (
    <section className="relative py-6">
      {/* Header */}
      <div className="flex items-end justify-between mb-4 px-4 sm:px-6 lg:px-8">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl sm:text-2xl font-bold text-white">{title}</h2>
            {badge}
          </div>
          {subtitle && (
            <p className="text-birgen-muted text-sm mt-0.5">{subtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => scroll('left')}
            className="p-1.5 rounded-full bg-white/5 hover:bg-birgen-red/20 border border-birgen-border hover:border-birgen-red/30 transition-all text-white"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => scroll('right')}
            className="p-1.5 rounded-full bg-white/5 hover:bg-birgen-red/20 border border-birgen-border hover:border-birgen-red/30 transition-all text-white"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Red accent line */}
      <div className="h-px bg-gradient-to-r from-birgen-red via-birgen-red/30 to-transparent mx-4 sm:mx-6 lg:mx-8 mb-4" />

      {/* Scroll container */}
      <div
        ref={scrollRef}
        className="scroll-container px-4 sm:px-6 lg:px-8"
      >
        {loading
          ? Array.from({ length: 8 }).map((_, i) => (
              <MovieCardSkeleton key={i} />
            ))
          : movies.map((movie) => (
              <MovieCard
                key={movie.movieId}
                movie={movie}
                userRating={userRatings?.get(movie.movieId)}
                onRate={onRate}
                showRating={showRating}
              />
            ))}
      </div>
    </section>
  );
}
