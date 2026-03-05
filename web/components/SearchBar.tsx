'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { searchMovies } from '@/lib/api';
import { Movie } from '@/types';
import MovieCard from './MovieCard';

interface SearchBarProps {
  onRate?: (movie: Movie, rating: number) => void;
  userRatings?: Map<number, number>;
  placeholder?: string;
}

export default function SearchBar({ onRate, userRatings, placeholder = 'Search movies...' }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout>();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); setOpen(false); return; }
    setLoading(true);
    try {
      const data = await searchMovies(q, 12);
      setResults(data);
      setOpen(true);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    clearTimeout(timeoutRef.current);
    if (query.trim()) {
      timeoutRef.current = setTimeout(() => doSearch(query.trim()), 350);
    } else {
      setResults([]);
      setOpen(false);
    }
    return () => clearTimeout(timeoutRef.current);
  }, [query, doSearch]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const clear = () => { setQuery(''); setResults([]); setOpen(false); inputRef.current?.focus(); };

  return (
    <div ref={containerRef} className="relative w-full max-w-2xl">
      {/* Input */}
      <div className="relative flex items-center">
        <Search className="absolute left-4 w-5 h-5 text-birgen-muted pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="w-full pl-11 pr-12 py-3.5 bg-birgen-card border border-birgen-border rounded-xl text-white placeholder-birgen-muted focus:outline-none focus:border-birgen-red/50 focus:ring-1 focus:ring-birgen-red/30 transition-all text-sm"
        />
        <div className="absolute right-3 flex items-center gap-2">
          {loading && <Loader2 className="w-4 h-4 text-birgen-red animate-spin" />}
          {query && !loading && (
            <button onClick={clear} className="text-birgen-muted hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Results dropdown */}
      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-birgen-dark border border-birgen-border rounded-xl overflow-hidden shadow-2xl z-50 animate-scale-in">
          <div className="p-3 border-b border-birgen-border flex items-center justify-between">
            <span className="text-birgen-muted text-xs font-medium uppercase tracking-wider">
              {results.length} results for &ldquo;{query}&rdquo;
            </span>
          </div>
          <div className="scroll-container p-4 max-h-80">
            {results.map((movie) => (
              <MovieCard
                key={movie.movieId}
                movie={movie}
                size="sm"
                userRating={userRatings?.get(movie.movieId)}
                onRate={onRate}
                showRating={Boolean(onRate)}
              />
            ))}
          </div>
        </div>
      )}

      {open && query.length >= 2 && results.length === 0 && !loading && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-birgen-dark border border-birgen-border rounded-xl p-6 text-center z-50">
          <p className="text-birgen-muted text-sm">No movies found for &ldquo;{query}&rdquo;</p>
        </div>
      )}
    </div>
  );
}
