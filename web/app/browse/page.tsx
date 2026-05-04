'use client';

import { useMemo, useState } from 'react';
import Navbar from '@/components/Navbar';
import SearchBar from '@/components/SearchBar';
import MovieCard from '@/components/MovieCard';
import MovieCarousel from '@/components/MovieCarousel';
import { CATALOG, toMovie } from '@/lib/catalog';
import { Movie } from '@/types';
import { useRatings } from '@/hooks/useRatings';
import { useMyList } from '@/hooks/useMyList';
import { Grid3X3, Rows3 } from 'lucide-react';
import toast from 'react-hot-toast';

const SECTIONS = Array.from(new Set(CATALOG.map((c) => c.browseSection)));

export default function BrowsePage() {
  const [activeSection, setActiveSection] = useState<string>('All');
  const [viewMode, setViewMode] = useState<'grid' | 'carousel'>('carousel');
  const { ratings, rateMovie, count } = useRatings();
  const { myList, addToList, removeFromList } = useMyList();
  const myListIds = new Set(myList.map((m) => m.movieId));

  const allMovies = useMemo(() => CATALOG.map(toMovie), []);

  const handleRate = (movie: Movie, rating: number) => {
    rateMovie(movie, rating);
    toast.success(`Rated ${rating}/5`, { duration: 1500 });
  };

  const filtered =
    activeSection === 'All'
      ? allMovies
      : allMovies.filter((m) => {
          const entry = CATALOG.find((c) => c.movieId === m.movieId);
          return entry?.browseSection === activeSection;
        });

  const sectionGroups = useMemo(
    () =>
      SECTIONS.map((section) => ({
        section,
        movies: allMovies.filter((m) => CATALOG.find((c) => c.movieId === m.movieId)?.browseSection === section),
      })).filter((g) => g.movies.length > 0),
    [allMovies],
  );

  return (
    <div className="min-h-screen bg-birgen-black">
      <Navbar ratingCount={count} />

      <div className="pt-24 pb-6 px-4 sm:px-6 lg:px-12 max-w-[1920px] mx-auto">
        <h1 className="font-display text-4xl sm:text-5xl text-white tracking-wide mb-2">BROWSE</h1>
        <p className="text-birgen-muted mb-6">
          Full BirgenAI catalogue — {CATALOG.length} curated tiles. HD streams on the launch five; the rest signal what
          is landing next.
        </p>

        <SearchBar onRate={handleRate} userRatings={ratings} placeholder="Search within your session..." />

        <div className="flex items-center justify-between mt-5 flex-wrap gap-3">
          <div className="flex gap-2 overflow-x-auto pb-1 flex-1" style={{ scrollbarWidth: 'none' }}>
            <button
              type="button"
              onClick={() => setActiveSection('All')}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                activeSection === 'All'
                  ? 'bg-birgen-red text-white'
                  : 'bg-birgen-card border border-birgen-border text-birgen-silver hover:text-white'
              }`}
            >
              All
            </button>
            {SECTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setActiveSection(s)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  activeSection === s
                    ? 'bg-birgen-red text-white'
                    : 'bg-birgen-card border border-birgen-border text-birgen-silver hover:text-white'
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 bg-birgen-card border border-birgen-border rounded-lg p-1">
            <button
              type="button"
              onClick={() => setViewMode('carousel')}
              className={`p-1.5 rounded transition-colors ${viewMode === 'carousel' ? 'bg-birgen-red text-white' : 'text-birgen-muted hover:text-white'}`}
            >
              <Rows3 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded transition-colors ${viewMode === 'grid' ? 'bg-birgen-red text-white' : 'text-birgen-muted hover:text-white'}`}
            >
              <Grid3X3 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {viewMode === 'carousel' && activeSection === 'All' ? (
        <div className="pb-16">
          {sectionGroups.map(({ section, movies: m }) => (
            <MovieCarousel
              key={section}
              title={section}
              movies={m}
              userRatings={ratings}
              onRate={handleRate}
              showRating
              myListIds={myListIds}
              onAddToList={addToList}
              onRemoveFromList={removeFromList}
            />
          ))}
        </div>
      ) : (
        <div className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-12 pb-16">
          <p className="text-birgen-muted text-sm mb-5">
            {filtered.length} titles in {activeSection === 'All' ? 'full catalogue' : activeSection}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {filtered.map((movie) => (
              <MovieCard
                key={movie.movieId}
                movie={movie}
                userRating={ratings.get(movie.movieId)}
                onRate={handleRate}
                showRating
                inMyList={myListIds.has(movie.movieId)}
                onAddToList={addToList}
                onRemoveFromList={removeFromList}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
