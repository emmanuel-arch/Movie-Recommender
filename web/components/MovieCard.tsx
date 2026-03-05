'use client';
import Image from 'next/image';
import { Star, Plus, Check } from 'lucide-react';
import { Movie } from '@/types';

interface MovieCardProps {
  movie: Movie;
  userRating?: number;
  onRate?: (movie: Movie, rating: number) => void;
  showRating?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const GENRES_COLORS: Record<string, string> = {
  Action: 'bg-red-500/20 text-red-400',
  Comedy: 'bg-yellow-500/20 text-yellow-400',
  Drama: 'bg-blue-500/20 text-blue-400',
  Horror: 'bg-purple-500/20 text-purple-400',
  'Sci-Fi': 'bg-cyan-500/20 text-cyan-400',
  Thriller: 'bg-orange-500/20 text-orange-400',
  Romance: 'bg-pink-500/20 text-pink-400',
  Animation: 'bg-green-500/20 text-green-400',
  Documentary: 'bg-gray-500/20 text-gray-400',
};

function getGenreColor(genre: string) {
  for (const [key, val] of Object.entries(GENRES_COLORS)) {
    if (genre.includes(key)) return val;
  }
  return 'bg-white/10 text-white/60';
}

export default function MovieCard({
  movie,
  userRating,
  onRate,
  showRating = false,
  size = 'md',
}: MovieCardProps) {
  const sizeClasses = {
    sm: 'w-36 sm:w-40',
    md: 'w-44 sm:w-52',
    lg: 'w-52 sm:w-64',
  };

  const imgHeights = { sm: 'h-52 sm:h-60', md: 'h-60 sm:h-72', lg: 'h-72 sm:h-80' };

  const genres = movie.genres?.split('|').slice(0, 2) || [];
  const rated = userRating !== undefined && userRating > 0;

  return (
    <div className={`movie-card relative flex-shrink-0 ${sizeClasses[size]} group cursor-pointer`}>
      {/* Poster */}
      <div className={`relative ${imgHeights[size]} rounded-lg overflow-hidden bg-birgen-card`}>
        {movie.poster_url ? (
          <Image
            src={movie.poster_url}
            alt={movie.title}
            fill
            sizes="(max-width: 768px) 40vw, 20vw"
            className="object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-birgen-card to-birgen-dark">
            <div className="w-16 h-16 rounded-full bg-birgen-red/10 flex items-center justify-center">
              <span className="text-3xl">🎬</span>
            </div>
            <span className="text-birgen-muted text-xs text-center px-3 line-clamp-2">
              {movie.title}
            </span>
          </div>
        )}

        {/* Overlay on hover */}
        <div className="absolute inset-0 bg-card-gradient opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {/* Predicted rating badge */}
        {movie.predicted_rating && (
          <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-md bg-black/80 backdrop-blur-sm">
            <Star className="w-3 h-3 fill-birgen-red text-birgen-red" />
            <span className="text-xs font-medium text-white">{movie.predicted_rating}</span>
          </div>
        )}

        {/* Rated badge */}
        {rated && (
          <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-md bg-birgen-red/90">
            <Check className="w-3 h-3 text-white" />
            <span className="text-xs font-medium text-white">{userRating}/5</span>
          </div>
        )}

        {/* Year */}
        {movie.year && (
          <div className="absolute bottom-2 left-2 text-xs text-white/60 bg-black/60 px-2 py-0.5 rounded">
            {movie.year}
          </div>
        )}
      </div>

      {/* Info below poster */}
      <div className="mt-2 px-0.5">
        <p className="text-white text-sm font-medium line-clamp-2 leading-snug">
          {movie.title.replace(/\s*\(\d{4}\)\s*$/, '')}
        </p>

        {/* Genres */}
        {genres.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {genres.map((g) => (
              <span
                key={g}
                className={`text-[10px] px-1.5 py-0.5 rounded ${getGenreColor(g)} font-medium`}
              >
                {g}
              </span>
            ))}
          </div>
        )}

        {/* Star rating input */}
        {showRating && onRate && (
          <div className="star-rating flex gap-0.5 mt-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => onRate(movie, star)}
                className="star p-0.5"
              >
                <Star
                  className="w-4 h-4"
                  fill={userRating && userRating >= star ? '#E50914' : 'none'}
                  color={userRating && userRating >= star ? '#E50914' : '#6B6B6B'}
                />
              </button>
            ))}
          </div>
        )}

        {/* Avg rating */}
        {movie.avg_rating && !showRating && (
          <div className="flex items-center gap-1 mt-1.5">
            <Star className="w-3 h-3 fill-birgen-red text-birgen-red" />
            <span className="text-birgen-silver text-xs">{Number(movie.avg_rating).toFixed(1)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Skeleton loader
export function MovieCardSkeleton({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = { sm: 'w-36 sm:w-40', md: 'w-44 sm:w-52', lg: 'w-52 sm:w-64' };
  const imgHeights = { sm: 'h-52 sm:h-60', md: 'h-60 sm:h-72', lg: 'h-72 sm:h-80' };
  return (
    <div className={`flex-shrink-0 ${sizeClasses[size]}`}>
      <div className={`${imgHeights[size]} rounded-lg shimmer`} />
      <div className="mt-2 space-y-2">
        <div className="h-4 rounded shimmer w-full" />
        <div className="h-3 rounded shimmer w-2/3" />
      </div>
    </div>
  );
}
