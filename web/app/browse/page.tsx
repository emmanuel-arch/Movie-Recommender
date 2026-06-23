'use client';

import { useMemo, useState } from 'react';
import Navbar from '@/components/Navbar';
import SearchBar from '@/components/SearchBar';
import MovieCard from '@/components/MovieCard';
import MovieCarousel from '@/components/MovieCarousel';
import { CATALOG, toMovie, hdFeaturedEntries, type CatalogEntry } from '@/lib/catalog';
import { Movie } from '@/types';
import { useRatings } from '@/hooks/useRatings';
import { useMyList } from '@/hooks/useMyList';
import { Grid3X3, Rows3 } from 'lucide-react';
import toast from 'react-hot-toast';

/**
 * Browse rows — Netflix-style. The page leads with genre rows built ONLY from
 * streamable titles (so a viewer scans the whole library at a glance and every card
 * plays), and condenses everything not-yet-licensed into the final two "coming soon"
 * rows. Each row carries a short `chip` so the filter bar can jump straight to a grid
 * of that lane. A playable title naturally appears in several rows (Fast X is in Action
 * AND Crime AND Thriller) — that's the Netflix trick that makes the catalogue feel deep.
 */
interface RowDef {
  chip: string;
  title: string;
  subtitle: string;
  build: () => CatalogEntry[];
}

const playable = (pred: (c: CatalogEntry) => boolean) => () =>
  CATALOG.filter((c) => c.playable && pred(c));

const hasGenre = (c: CatalogEntry, ...g: string[]) => c.genres.some((x) => g.includes(x));

const ROW_DEFS: RowDef[] = [
  {
    chip: 'Now in HD',
    title: 'Now Streaming in HD',
    subtitle: 'Freshly added — full 1080p, play now',
    build: () => hdFeaturedEntries(),
  },
  {
    chip: 'Acclaimed',
    title: 'Critically acclaimed — now streaming',
    subtitle: 'The highest-rated titles in the library, ready to play',
    build: () =>
      CATALOG.filter((c) => c.playable && c.tmdbVoteAverage >= 7.6).sort(
        (a, b) => b.tmdbVoteAverage - a.tmdbVoteAverage,
      ),
  },
  {
    chip: 'Action',
    title: 'Action & blockbusters',
    subtitle: 'Chases, heists, and impossible odds — all in HD',
    build: playable((c) => hasGenre(c, 'Action', 'Adventure')),
  },
  {
    chip: 'Thrillers',
    title: 'Thrillers & suspense',
    subtitle: 'Edge-of-your-seat tension and ticking clocks',
    build: playable((c) => hasGenre(c, 'Thriller')),
  },
  {
    chip: 'Crime',
    title: 'Crime & heists',
    subtitle: 'Cartels, capers, and the people who chase them',
    build: playable((c) => hasGenre(c, 'Crime')),
  },
  {
    chip: 'Sci-fi',
    title: 'Sci-fi & fantasy',
    subtitle: 'Dreams, multiverses, and worlds beyond our own',
    build: playable((c) => hasGenre(c, 'Sci-Fi', 'Fantasy')),
  },
  {
    chip: 'Comedy',
    title: 'Comedy & feel-good',
    subtitle: 'Lighter, warmer, funnier — easy streams for any night',
    build: playable((c) => hasGenre(c, 'Comedy', 'Family', 'Animation')),
  },
  {
    chip: 'Drama',
    title: 'Drama',
    subtitle: 'Character, conflict, and the weight of every choice',
    build: playable((c) => hasGenre(c, 'Drama')),
  },
  {
    chip: 'Sport',
    title: 'Sport & adrenaline',
    subtitle: 'Rivalries, records, and the will to win',
    build: playable((c) => hasGenre(c, 'Sport')),
  },
  {
    chip: 'Horror',
    title: 'Horror & mind-benders',
    subtitle: 'Dread that gets under your skin',
    build: playable((c) => hasGenre(c, 'Horror', 'Mystery')),
  },
  // ── Coming soon — condensed to the final two rows ──────────────────────────
  {
    chip: 'KE & Africa',
    title: 'Kenyan & African originals — coming soon',
    subtitle: 'Our homegrown lane + pan-African voices, licensing onto the platform',
    build: () => CATALOG.filter((c) => c.comingSoon && (c.kenyanOriginal || c.panAfrican)),
  },
  {
    chip: 'Coming soon',
    title: 'Coming soon — global cinema',
    subtitle: 'Award-winners and mind-benders — licensed windows opening next',
    build: () =>
      CATALOG.filter((c) => c.comingSoon && !c.kenyanOriginal && !c.panAfrican),
  },
];

export default function BrowsePage() {
  const [activeChip, setActiveChip] = useState<string>('All');
  const [viewMode, setViewMode] = useState<'grid' | 'carousel'>('carousel');
  const { ratings, rateMovie, count } = useRatings();
  const { myList, addToList, removeFromList } = useMyList();
  const myListIds = new Set(myList.map((m) => m.movieId));

  const handleRate = (movie: Movie, rating: number) => {
    rateMovie(movie, rating);
    toast.success(`Rated ${rating}/5`, { duration: 1500 });
  };

  const carouselProps = {
    userRatings: ratings,
    onRate: handleRate,
    showRating: true,
    myListIds,
    onAddToList: addToList,
    onRemoveFromList: removeFromList,
  };

  // Build every row once. De-dupe within a row by movieId (a title can match two
  // predicates inside the same lane, e.g. Action + Adventure).
  const rows = useMemo(
    () =>
      ROW_DEFS.map((def) => {
        const seen = new Set<number>();
        const movies = def
          .build()
          .filter((c) => (seen.has(c.movieId) ? false : (seen.add(c.movieId), true)))
          .map(toMovie);
        return { ...def, movies };
      }).filter((r) => r.movies.length > 0),
    [],
  );

  const playableCount = useMemo(() => CATALOG.filter((c) => c.playable).length, []);

  // Grid view (or a selected chip) shows a flat grid of that lane's titles.
  const gridMovies = useMemo(() => {
    if (activeChip === 'All') return CATALOG.map(toMovie);
    return rows.find((r) => r.chip === activeChip)?.movies ?? [];
  }, [activeChip, rows]);

  const showCarousels = viewMode === 'carousel' && activeChip === 'All';

  return (
    <div className="min-h-screen bg-birgen-black">
      <Navbar ratingCount={count} />

      <div className="pt-24 pb-6 px-4 sm:px-6 lg:px-12 max-w-[1920px] mx-auto">
        <h1 className="font-display text-4xl sm:text-5xl text-white tracking-wide mb-2">BROWSE</h1>
        <p className="text-birgen-muted mb-6">
          {playableCount} titles streaming now in HD across every genre — the last two rows preview
          what&apos;s landing next.
        </p>

        <SearchBar onRate={handleRate} userRatings={ratings} placeholder="Search within your session..." />

        <div className="flex items-center justify-between mt-5 flex-wrap gap-3">
          <div className="flex gap-2 overflow-x-auto pb-1 flex-1" style={{ scrollbarWidth: 'none' }}>
            <button
              type="button"
              onClick={() => setActiveChip('All')}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                activeChip === 'All'
                  ? 'bg-birgen-red text-white'
                  : 'bg-birgen-card border border-birgen-border text-birgen-silver hover:text-white'
              }`}
            >
              All
            </button>
            {rows.map((r) => (
              <button
                key={r.chip}
                type="button"
                onClick={() => setActiveChip(r.chip)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  activeChip === r.chip
                    ? 'bg-birgen-red text-white'
                    : 'bg-birgen-card border border-birgen-border text-birgen-silver hover:text-white'
                }`}
              >
                {r.chip}
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

      {showCarousels ? (
        <div className="pb-16">
          {rows.map((r) => (
            <MovieCarousel
              key={r.title}
              title={r.title}
              subtitle={r.subtitle}
              movies={r.movies}
              {...carouselProps}
            />
          ))}
        </div>
      ) : (
        <div className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-12 pb-16">
          <p className="text-birgen-muted text-sm mb-5">
            {gridMovies.length} titles in {activeChip === 'All' ? 'full catalogue' : activeChip}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {gridMovies.map((movie) => (
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
