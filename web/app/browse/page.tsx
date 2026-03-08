'use client';
import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import SearchBar from '@/components/SearchBar';
import MovieCard, { MovieCardSkeleton } from '@/components/MovieCard';
import MovieCarousel from '@/components/MovieCarousel';
import { getPopularMovies } from '@/lib/api';
import { Movie } from '@/types';
import { useRatings } from '@/hooks/useRatings';
import { useMyList } from '@/hooks/useMyList';
import { Grid3X3, Rows3 } from 'lucide-react';
import toast from 'react-hot-toast';

const GENRES = ['All', 'Action', 'Adventure', 'Comedy', 'Drama', 'Horror', 'Sci-Fi', 'Thriller', 'Romance', 'Animation', 'Documentary', 'Crime', 'Mystery', 'Fantasy'];

export default function BrowsePage() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeGenre, setActiveGenre] = useState('All');
  const [viewMode, setViewMode] = useState<'grid' | 'carousel'>('carousel');
  const { ratings, rateMovie, count } = useRatings();
  const { myList, addToList, removeFromList } = useMyList();
  const myListIds = new Set(myList.map((m) => m.movieId));

  useEffect(() => {
    getPopularMovies(100)
      .then(setMovies)
      .catch(() => toast.error('Failed to load movies'))
      .finally(() => setLoading(false));
  }, []);

  const handleRate = (movie: Movie, rating: number) => {
    rateMovie(movie, rating);
    toast.success(`Rated ${rating}/5`, { duration: 1500 });
  };

  const filtered = activeGenre === 'All'
    ? movies
    : movies.filter((m) => m.genres?.includes(activeGenre));

  const genreGroups = GENRES.slice(1).map((genre) => ({
    genre,
    movies: movies.filter((m) => m.genres?.includes(genre)).slice(0, 25),
  })).filter((g) => g.movies.length > 0);

  return (
    <div className="min-h-screen bg-birgen-black">
      <Navbar ratingCount={count} />

      {/* Header */}
      <div className="pt-24 pb-6 px-4 sm:px-6 lg:px-12 max-w-[1920px] mx-auto">
        <h1 className="font-display text-4xl sm:text-5xl text-white tracking-wide mb-2">BROWSE</h1>
        <p className="text-birgen-muted mb-6">Explore our entire movie catalog</p>

        <SearchBar onRate={handleRate} userRatings={ratings} placeholder="Search any movie..." />

        <div className="flex items-center justify-between mt-5 flex-wrap gap-3">
          <div className="flex gap-2 overflow-x-auto pb-1 flex-1" style={{ scrollbarWidth: 'none' }}>
            {GENRES.map((g) => (
              <button
                key={g}
                onClick={() => setActiveGenre(g)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  activeGenre === g
                    ? 'bg-birgen-red text-white'
                    : 'bg-birgen-card border border-birgen-border text-birgen-silver hover:text-white'
                }`}
              >
                {g}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 bg-birgen-card border border-birgen-border rounded-lg p-1">
            <button
              onClick={() => setViewMode('carousel')}
              className={`p-1.5 rounded transition-colors ${viewMode === 'carousel' ? 'bg-birgen-red text-white' : 'text-birgen-muted hover:text-white'}`}
            >
              <Rows3 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded transition-colors ${viewMode === 'grid' ? 'bg-birgen-red text-white' : 'text-birgen-muted hover:text-white'}`}
            >
              <Grid3X3 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {viewMode === 'carousel' && activeGenre === 'All' ? (
        <div className="pb-16">
          {loading
            ? [1, 2, 3].map((i) => (
                <MovieCarousel key={i} title="Loading..." movies={[]} loading />
              ))
            : genreGroups.map(({ genre, movies: gMovies }) => (
                <MovieCarousel
                  key={genre}
                  title={genre}
                  movies={gMovies}
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
            {filtered.length} movies in {activeGenre === 'All' ? 'all categories' : activeGenre}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {loading
              ? Array.from({ length: 20 }).map((_, i) => <MovieCardSkeleton key={i} />)
              : filtered.map((movie) => (
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
