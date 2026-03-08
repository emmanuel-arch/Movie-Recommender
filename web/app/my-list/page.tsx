'use client';
import { useState, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { GripVertical, X, Play, Star, Plus, ArrowLeft } from 'lucide-react';
import Navbar from '@/components/Navbar';
import { useMyList } from '@/hooks/useMyList';
import { useRatings } from '@/hooks/useRatings';
import { Movie } from '@/types';

export default function MyListPage() {
  const { myList, removeFromList, reorder } = useMyList();
  const { ratings, count } = useRatings();
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const dragRef = useRef<number | null>(null);

  const handleDragStart = (idx: number) => {
    dragRef.current = idx;
    setDragIdx(idx);
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setOverIdx(idx);
  };

  const handleDrop = (idx: number) => {
    if (dragRef.current !== null && dragRef.current !== idx) {
      reorder(dragRef.current, idx);
    }
    dragRef.current = null;
    setDragIdx(null);
    setOverIdx(null);
  };

  const handleDragEnd = () => {
    dragRef.current = null;
    setDragIdx(null);
    setOverIdx(null);
  };

  return (
    <div className="min-h-screen bg-birgen-black">
      <Navbar ratingCount={count} />

      <div className="pt-24 pb-16 px-4 sm:px-6 lg:px-12 max-w-5xl mx-auto">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-birgen-muted hover:text-white text-sm transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </Link>

        <h1 className="font-display text-4xl sm:text-5xl text-white tracking-wide mb-1">MY LIST</h1>
        <p className="text-birgen-muted mb-8">
          {myList.length === 0
            ? 'Your list is empty. Browse movies and add them here.'
            : `${myList.length} movie${myList.length !== 1 ? 's' : ''} saved. Drag to reorder.`}
        </p>

        {myList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-20 h-20 rounded-full bg-birgen-card border border-birgen-border flex items-center justify-center mb-6">
              <Plus className="w-8 h-8 text-birgen-muted" />
            </div>
            <h2 className="text-white text-xl font-semibold mb-2">Nothing here yet</h2>
            <p className="text-birgen-muted mb-6 max-w-sm">
              Browse movies and click the + button on any movie to add it to your list.
            </p>
            <Link
              href="/browse"
              className="inline-flex items-center gap-2 px-6 py-3 bg-birgen-red hover:bg-birgen-red-light text-white font-semibold rounded-lg transition-all hover:scale-105 active:scale-95"
            >
              Browse Movies
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {myList.map((movie, idx) => {
              const isDragging = dragIdx === idx;
              const isOver = overIdx === idx;
              const imageUrl = movie.backdrop_url || movie.poster_url;
              const displayTitle = movie.title.replace(/\s*\(\d{4}\)\s*$/, '');
              const genres = movie.genres?.split('|').slice(0, 3) || [];
              const userRating = ratings.get(movie.movieId);

              return (
                <div
                  key={movie.movieId}
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDrop={() => handleDrop(idx)}
                  onDragEnd={handleDragEnd}
                  className={`flex items-center gap-4 p-3 rounded-xl transition-all cursor-grab active:cursor-grabbing ${
                    isDragging
                      ? 'opacity-40 scale-[0.98]'
                      : isOver
                      ? 'bg-birgen-red/10 border border-birgen-red/30'
                      : 'bg-birgen-card border border-birgen-border hover:border-birgen-red/20'
                  }`}
                >
                  {/* Drag handle */}
                  <div className="flex-shrink-0 text-birgen-muted hover:text-white">
                    <GripVertical className="w-5 h-5" />
                  </div>

                  {/* Rank number */}
                  <span className="flex-shrink-0 w-8 text-center font-display text-2xl text-birgen-muted">
                    {idx + 1}
                  </span>

                  {/* Thumbnail */}
                  <div className="flex-shrink-0 relative w-28 aspect-[16/10] rounded-md overflow-hidden bg-birgen-dark">
                    {imageUrl ? (
                      <Image src={imageUrl} alt={displayTitle} fill className="object-cover" sizes="112px" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Play className="w-5 h-5 text-birgen-muted" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium text-sm sm:text-base truncate">{displayTitle}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {movie.year && <span className="text-birgen-muted text-xs">{movie.year}</span>}
                      {genres.map((g) => (
                        <span key={g} className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-birgen-silver">
                          {g}
                        </span>
                      ))}
                      {userRating && (
                        <span className="flex items-center gap-0.5 text-xs">
                          <Star className="w-3 h-3 fill-birgen-red text-birgen-red" />
                          <span className="text-white">{userRating}/5</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Remove */}
                  <button
                    onClick={() => removeFromList(movie.movieId)}
                    className="flex-shrink-0 p-2 text-birgen-muted hover:text-birgen-red transition-colors rounded-full hover:bg-white/5"
                    title="Remove from list"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
