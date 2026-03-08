'use client';
import { useRef, useState, useCallback, useEffect } from 'react';
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
  myListIds?: Set<number>;
  onAddToList?: (movie: Movie) => void;
  onRemoveFromList?: (movieId: number) => void;
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
  myListIds,
  onAddToList,
  onRemoveFromList,
}: MovieCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkScroll();
    el.addEventListener('scroll', checkScroll, { passive: true });
    window.addEventListener('resize', checkScroll);
    return () => {
      el.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
    };
  }, [checkScroll, movies]);

  const scroll = (dir: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const amount = scrollRef.current.clientWidth;
    scrollRef.current.scrollBy({
      left: dir === 'right' ? amount : -amount,
      behavior: 'smooth',
    });
  };

  return (
    <section className="relative py-4 group/carousel">
      {/* Header */}
      <div className="flex items-end justify-between mb-3 px-4 sm:px-6 lg:px-12">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-lg sm:text-xl font-bold text-white">{title}</h2>
            {badge}
          </div>
          {subtitle && (
            <p className="text-birgen-muted text-sm mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>

      {/* Scroll wrapper */}
      <div className="relative">
        {/* Left edge-hover arrow */}
        {canScrollLeft && (
          <button
            onClick={() => scroll('left')}
            className="absolute left-0 top-0 bottom-0 w-12 z-30 flex items-center justify-center bg-gradient-to-r from-black/80 to-transparent opacity-0 group-hover/carousel:opacity-100 transition-opacity duration-300 cursor-pointer"
            aria-label="Scroll left"
          >
            <ChevronLeft className="w-8 h-8 text-white drop-shadow-lg" />
          </button>
        )}

        {/* Right edge-hover arrow */}
        {canScrollRight && (
          <button
            onClick={() => scroll('right')}
            className="absolute right-0 top-0 bottom-0 w-12 z-30 flex items-center justify-center bg-gradient-to-l from-black/80 to-transparent opacity-0 group-hover/carousel:opacity-100 transition-opacity duration-300 cursor-pointer"
            aria-label="Scroll right"
          >
            <ChevronRight className="w-8 h-8 text-white drop-shadow-lg" />
          </button>
        )}

        {/* Scroll container — landscape grid items */}
        <div
          ref={scrollRef}
          className="flex gap-2 overflow-x-auto scrollbar-hide px-4 sm:px-6 lg:px-12 scroll-smooth"
          style={{ scrollbarWidth: 'none' }}
        >
          {loading
            ? Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex-shrink-0 w-[48%] sm:w-[31%] md:w-[23%] lg:w-[19%]">
                  <MovieCardSkeleton />
                </div>
              ))
            : movies.map((movie) => (
                <div key={movie.movieId} className="flex-shrink-0 w-[48%] sm:w-[31%] md:w-[23%] lg:w-[19%]">
                  <MovieCard
                    movie={movie}
                    userRating={userRatings?.get(movie.movieId)}
                    onRate={onRate}
                    showRating={showRating}
                    inMyList={myListIds?.has(movie.movieId) ?? false}
                    onAddToList={onAddToList}
                    onRemoveFromList={onRemoveFromList}
                  />
                </div>
              ))}
        </div>
      </div>
    </section>
  );
}
