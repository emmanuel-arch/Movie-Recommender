'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import Image from 'next/image';
import {
  Play,
  Info,
  Star,
  X,
  Pause,
  SkipForward,
  SkipBack,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  ArrowLeft,
} from 'lucide-react';
import { Movie } from '@/types';
import { useRatings } from '@/hooks/useRatings';
import toast from 'react-hot-toast';

/* ── The 5 featured movies with MovieLens IDs ─────────── */
interface Top5Movie {
  movieId: number;
  title: string;
  displayTitle: string;
  year: string;
  rating: string;
  maturity: string;
  duration: string;
  overview: string;
  genres: string;
  genreList: string[];
  poster: string;
  backdrop: string;
  trailer: string;
}

const TOP5_MOVIES: Top5Movie[] = [
  {
    movieId: 168250,
    title: 'Get Out (2017)',
    displayTitle: 'Get Out',
    year: '2017',
    rating: '7.7',
    maturity: 'R',
    duration: '1h 44m',
    overview:
      "A young African-American visits his white girlfriend's parents for the weekend, where his simmering uneasiness about their reception of him eventually reaches a boiling point.",
    genres: 'Horror|Thriller|Mystery',
    genreList: ['Horror', 'Thriller', 'Mystery'],
    poster: '/Images/getout.png',
    backdrop: '/Images/getout.png',
    trailer: '/Videos/trailer-getout-2017.mp4',
  },
  {
    movieId: 139644,
    title: 'Sicario (2015)',
    displayTitle: 'Sicario',
    year: '2015',
    rating: '7.6',
    maturity: 'R',
    duration: '2h 1m',
    overview:
      'An idealistic FBI agent is enlisted by a government task force to aid in the escalating war against drugs at the border area between the U.S. and Mexico.',
    genres: 'Crime|Drama|Mystery',
    genreList: ['Action', 'Crime', 'Drama'],
    poster: '/Images/hero-sicario.jpg',
    backdrop: '/Images/hero-sicario.jpg',
    trailer: '/Videos/trailer-sicario-2015.mp4',
  },
  {
    movieId: 79132,
    title: 'Inception (2010)',
    displayTitle: 'Inception',
    year: '2010',
    rating: '8.8',
    maturity: 'PG-13',
    duration: '2h 28m',
    overview:
      'A thief who steals corporate secrets through the use of dream-sharing technology is given the inverse task of planting an idea into the mind of a C.E.O.',
    genres: 'Action|Crime|Drama|Mystery|Sci-Fi|Thriller|IMAX',
    genreList: ['Sci-Fi', 'Action', 'Thriller'],
    poster: '/Images/hero-inception.webp',
    backdrop: '/Images/hero-inception.webp',
    trailer: '/Videos/trailer-inception-2010.mp4',
  },
  {
    movieId: 58559,
    title: 'Dark Knight, The (2008)',
    displayTitle: 'The Dark Knight',
    year: '2008',
    rating: '9.0',
    maturity: 'PG-13',
    duration: '2h 32m',
    overview:
      'When the menace known as the Joker wreaks havoc and chaos on the people of Gotham, Batman must accept one of the greatest psychological and physical tests of his ability to fight injustice.',
    genres: 'Action|Crime|Drama|IMAX',
    genreList: ['Action', 'Crime', 'Drama'],
    poster: '/Images/hero-the-dark-knight-2008.webp',
    backdrop: '/Images/hero-the-dark-knight-2008.webp',
    trailer: '/Videos/trailer-thedarkknight-2008.mp4',
  },
  {
    movieId: 74458,
    title: 'Shutter Island (2010)',
    displayTitle: 'Shutter Island',
    year: '2010',
    rating: '8.2',
    maturity: 'R',
    duration: '2h 18m',
    overview:
      'In 1954, a U.S. Marshal investigates the disappearance of a murderer who escaped from a hospital for the criminally insane on a remote island.',
    genres: 'Drama|Mystery|Thriller',
    genreList: ['Mystery', 'Thriller', 'Drama'],
    poster: '/Images/hero-shutter-island.jpg',
    backdrop: '/Images/hero-shutter-island.jpg',
    trailer: '/Videos/trailer-shutter-island.mp4',
  },
];

/* ── Format time helper ─────────────────────────────────── */
function formatTime(s: number) {
  if (!isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

/* ── Rating Popup (post-trailer) ─────────────────────────── */
function RatingPopup({
  movie,
  onRate,
  onSkip,
  existingRating,
}: {
  movie: Top5Movie;
  onRate: (rating: number) => void;
  onSkip: () => void;
  existingRating?: number;
}) {
  const [hover, setHover] = useState(0);

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/85 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md mx-4 rounded-2xl overflow-hidden bg-birgen-dark border border-birgen-border shadow-2xl animate-scale-in">
        {/* Backdrop peek */}
        <div className="relative h-40">
          <Image
            src={movie.backdrop}
            alt={movie.displayTitle}
            fill
            className="object-cover"
            sizes="448px"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-birgen-dark via-birgen-dark/60 to-transparent" />
        </div>

        <div className="px-6 pb-6 -mt-10 relative z-10">
          <h3 className="font-display text-3xl text-white tracking-wide mb-1">
            {movie.displayTitle}
          </h3>
          <p className="text-birgen-muted text-sm mb-5">
            How would you rate this movie?
          </p>

          {/* Star rating */}
          <div className="flex justify-center gap-2 mb-6">
            {[1, 2, 3, 4, 5].map((star) => {
              const active = hover > 0 ? star <= hover : existingRating ? star <= existingRating : false;
              return (
                <button
                  key={star}
                  onMouseEnter={() => setHover(star)}
                  onMouseLeave={() => setHover(0)}
                  onClick={() => onRate(star)}
                  className="transition-transform hover:scale-125 active:scale-90"
                >
                  <Star
                    className="w-10 h-10 transition-colors"
                    fill={active ? '#E50914' : 'none'}
                    color={active ? '#E50914' : '#555'}
                    strokeWidth={1.5}
                  />
                </button>
              );
            })}
          </div>

          {hover > 0 && (
            <p className="text-center text-white text-sm mb-4 font-medium">
              {hover}/5 Stars
            </p>
          )}

          <button
            onClick={onSkip}
            className="w-full py-2.5 text-birgen-muted hover:text-white text-sm transition-colors"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Info Popup (hover card) ──────────────────────────────── */
function InfoPopup({
  movie,
  onClose,
  onPlayTrailer,
  onRate,
  userRating,
}: {
  movie: Top5Movie;
  onClose: () => void;
  onPlayTrailer: () => void;
  onRate: (rating: number) => void;
  userRating?: number;
}) {
  const [ratingMode, setRatingMode] = useState(false);
  const [hover, setHover] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg mx-4 rounded-2xl overflow-hidden bg-birgen-dark border border-birgen-border shadow-2xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Backdrop */}
        <div className="relative h-56 sm:h-64">
          <Image
            src={movie.backdrop}
            alt={movie.displayTitle}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 544px"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-birgen-dark via-transparent to-transparent" />
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-black/60 border border-white/20 flex items-center justify-center text-white hover:bg-black/80 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Rating badge */}
          {userRating && (
            <div className="absolute top-4 left-4 flex items-center gap-1 px-2.5 py-1 rounded-md bg-birgen-red/90 shadow-lg">
              <Star className="w-3 h-3 fill-white text-white" />
              <span className="text-xs font-bold text-white">{userRating}/5</span>
            </div>
          )}
        </div>

        <div className="p-5 -mt-14 relative z-10">
          <h2 className="font-display text-3xl text-white tracking-wide mb-1">
            {movie.displayTitle}
          </h2>
          <div className="flex items-center gap-2.5 mb-3 flex-wrap text-sm">
            <span className="text-green-400 font-semibold">{movie.rating}</span>
            <span className="text-birgen-silver">{movie.year}</span>
            <span className="px-1.5 py-0.5 text-[10px] font-semibold border border-birgen-silver/40 text-birgen-silver rounded">
              {movie.maturity}
            </span>
            <span className="text-birgen-silver">{movie.duration}</span>
          </div>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {movie.genreList.map((g) => (
              <span
                key={g}
                className="text-[11px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-birgen-silver"
              >
                {g}
              </span>
            ))}
          </div>
          <p className="text-birgen-silver text-sm leading-relaxed mb-5 line-clamp-3">
            {movie.overview}
          </p>

          {ratingMode ? (
            <div className="animate-fade-in">
              <p className="text-white text-sm mb-3 font-medium">Rate this movie</p>
              <div className="flex justify-center gap-2 mb-4">
                {[1, 2, 3, 4, 5].map((star) => {
                  const active = hover > 0 ? star <= hover : userRating ? star <= userRating : false;
                  return (
                    <button
                      key={star}
                      onMouseEnter={() => setHover(star)}
                      onMouseLeave={() => setHover(0)}
                      onClick={() => {
                        onRate(star);
                        setRatingMode(false);
                      }}
                      className="transition-transform hover:scale-125 active:scale-90"
                    >
                      <Star
                        className="w-9 h-9 transition-colors"
                        fill={active ? '#E50914' : 'none'}
                        color={active ? '#E50914' : '#555'}
                        strokeWidth={1.5}
                      />
                    </button>
                  );
                })}
              </div>
              {hover > 0 && (
                <p className="text-center text-birgen-muted text-xs">{hover}/5</p>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <button
                onClick={onPlayTrailer}
                className="flex items-center gap-2 px-6 py-2.5 bg-white hover:bg-white/90 text-black font-bold rounded-md transition-all hover:scale-[1.03] active:scale-95 text-sm"
              >
                <Play className="w-5 h-5 fill-black" />
                Watch Trailer
              </button>
              <button
                onClick={() => setRatingMode(true)}
                className="flex items-center gap-2 px-6 py-2.5 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-md border border-white/10 transition-all hover:scale-[1.03] active:scale-95 text-sm"
              >
                <Star className="w-4 h-4" />
                {userRating ? 'Re-rate' : 'Rate Movie'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Fullscreen Trailer Player ────────────────────────────── */
function TrailerPlayer({
  movies,
  startIndex,
  onClose,
  onRateMovie,
  userRatings,
}: {
  movies: Top5Movie[];
  startIndex: number;
  onClose: () => void;
  onRateMovie: (movie: Top5Movie, rating: number) => void;
  userRatings: Map<number, number>;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentIdx, setCurrentIdx] = useState(startIndex);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [showRatingPopup, setShowRatingPopup] = useState(false);
  const controlsTimer = useRef<NodeJS.Timeout>();
  const movie = movies[currentIdx];

  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => setShowControls(false), 3500);
  }, []);

  useEffect(() => {
    resetControlsTimer();
    return () => clearTimeout(controlsTimer.current);
  }, [resetControlsTimer]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (showRatingPopup) return;
      if (e.key === 'Escape') onClose();
      if (e.key === ' ') {
        e.preventDefault();
        togglePlay();
      }
      if (e.key === 'ArrowRight') skip(15);
      if (e.key === 'ArrowLeft') skip(-15);
      if (e.key === 'm') toggleMute();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.load();
    v.play().catch(() => {});
    setPaused(false);
    setProgress(0);
    setCurrentTime(0);
    setShowRatingPopup(false);
  }, [currentIdx]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play();
      setPaused(false);
    } else {
      v.pause();
      setPaused(true);
    }
    resetControlsTimer();
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
    resetControlsTimer();
  };

  const skip = (seconds: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(v.duration, v.currentTime + seconds));
    resetControlsTimer();
  };

  const goNext = () => {
    setCurrentIdx((i) => (i + 1) % movies.length);
    resetControlsTimer();
  };

  const goPrev = () => {
    setCurrentIdx((i) => (i - 1 + movies.length) % movies.length);
    resetControlsTimer();
  };

  const handleTrailerEnded = () => {
    setShowRatingPopup(true);
  };

  const handleRateInPopup = (rating: number) => {
    onRateMovie(movie, rating);
    setShowRatingPopup(false);
    // Move to next after rating
    goNext();
  };

  const handleSkipRating = () => {
    setShowRatingPopup(false);
    goNext();
  };

  const onTimeUpdate = () => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    setProgress((v.currentTime / v.duration) * 100);
    setCurrentTime(v.currentTime);
    setDuration(v.duration);
  };

  const onProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    v.currentTime = pct * v.duration;
    resetControlsTimer();
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black" onMouseMove={resetControlsTimer}>
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        autoPlay
        muted={muted}
        playsInline
        onTimeUpdate={onTimeUpdate}
        onEnded={handleTrailerEnded}
      >
        <source src={movie.trailer} type="video/mp4" />
      </video>

      {/* Controls overlay */}
      <div
        className={`absolute inset-0 flex flex-col justify-between transition-opacity duration-500 ${
          showControls && !showRatingPopup ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Top bar */}
        <div className="flex items-center gap-4 px-4 sm:px-8 pt-5 pb-10 bg-gradient-to-b from-black/80 via-black/30 to-transparent">
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full flex items-center justify-center text-white hover:bg-white/10 transition-colors"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div className="flex-1 min-w-0">
            <h3 className="text-white font-semibold text-base sm:text-lg truncate">
              {movie.displayTitle}
            </h3>
            <p className="text-white/50 text-xs">Full Trailer</p>
          </div>
        </div>

        {/* Center tap area */}
        <button onClick={togglePlay} className="flex-1 cursor-pointer" />

        {/* Bottom controls */}
        <div className="px-4 sm:px-8 pb-5 pt-10 bg-gradient-to-t from-black/90 via-black/50 to-transparent">
          {/* Progress bar */}
          <div className="group cursor-pointer mb-3" onClick={onProgressClick}>
            <div className="relative h-1 group-hover:h-1.5 bg-white/25 rounded-full transition-all overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 bg-birgen-red rounded-full transition-[width] duration-150"
                style={{ width: `${progress}%` }}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-birgen-red opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                style={{ left: `calc(${progress}% - 7px)` }}
              />
            </div>
          </div>

          {/* Controls row */}
          <div className="flex items-center gap-2 sm:gap-4">
            <button
              onClick={togglePlay}
              className="text-white hover:text-white/80 transition-colors"
            >
              {paused ? (
                <Play className="w-7 h-7 fill-white" />
              ) : (
                <Pause className="w-7 h-7" />
              )}
            </button>
            <button
              onClick={() => skip(-15)}
              className="text-white hover:text-white/80 transition-colors"
            >
              <RotateCcw className="w-5 h-5" />
            </button>
            <button
              onClick={() => skip(15)}
              className="text-white hover:text-white/80 transition-colors"
            >
              <RotateCw className="w-5 h-5" />
            </button>
            <button
              onClick={toggleMute}
              className="text-white hover:text-white/80 transition-colors"
            >
              {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
            <span className="text-white/70 text-xs sm:text-sm font-mono tabular-nums">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
            <div className="flex-1" />
            <button
              onClick={goPrev}
              className="text-white hover:text-white/80 transition-colors"
            >
              <SkipBack className="w-5 h-5" />
            </button>
            <button
              onClick={goNext}
              className="text-white hover:text-white/80 transition-colors"
            >
              <SkipForward className="w-5 h-5" />
            </button>
            <span className="hidden sm:block text-white/50 text-xs truncate max-w-[160px]">
              {movie.displayTitle} ({movie.year})
            </span>
          </div>
        </div>
      </div>

      {/* Rating popup after trailer ends */}
      {showRatingPopup && (
        <RatingPopup
          movie={movie}
          onRate={handleRateInPopup}
          onSkip={handleSkipRating}
          existingRating={userRatings.get(movie.movieId)}
        />
      )}
    </div>
  );
}

/* ── Main Top 5 Kenya Section ─────────────────────────────── */
export default function Top5Kenya() {
  const { ratings, rateMovie } = useRatings();
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [infoMovie, setInfoMovie] = useState<Top5Movie | null>(null);
  const [trailerPlayer, setTrailerPlayer] = useState<{
    open: boolean;
    startIndex: number;
  }>({ open: false, startIndex: 0 });
  const hoverTimeout = useRef<NodeJS.Timeout>();

  const handleMouseEnter = (idx: number) => {
    clearTimeout(hoverTimeout.current);
    hoverTimeout.current = setTimeout(() => setHoveredIdx(idx), 150);
  };

  const handleMouseLeave = () => {
    clearTimeout(hoverTimeout.current);
    setHoveredIdx(null);
  };

  const handleRate = (movie: Top5Movie, rating: number) => {
    const asMovie: Movie = {
      movieId: movie.movieId,
      title: movie.title,
      genres: movie.genres,
      year: movie.year,
      poster_url: movie.poster,
      backdrop_url: movie.backdrop,
      overview: movie.overview,
    };
    rateMovie(asMovie, rating);
    toast.success(`Rated "${movie.displayTitle}" ${rating}/5`, { duration: 2000 });
  };

  const openTrailer = (idx: number) => {
    setInfoMovie(null);
    setTrailerPlayer({ open: true, startIndex: idx });
  };

  return (
    <>
      <section className="relative py-6 mt-2">
        {/* Section header */}
        <div className="mb-4 px-4 sm:px-6 lg:px-8">
          <h2 className="text-xl sm:text-2xl font-bold text-white">
            Top 5 Movies in Kenya Today
          </h2>
        </div>

        {/* Red accent line */}
        <div className="h-px bg-gradient-to-r from-birgen-red via-birgen-red/30 to-transparent mx-4 sm:mx-6 lg:mx-8 mb-5" />

        {/* 5-column grid — all movies visible, equal spacing */}
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 sm:gap-4">
            {TOP5_MOVIES.map((movie, idx) => {
              const userRating = ratings.get(movie.movieId);
              const isHovered = hoveredIdx === idx;
              return (
                <div
                  key={movie.movieId}
                  className="relative group"
                  onMouseEnter={() => handleMouseEnter(idx)}
                  onMouseLeave={handleMouseLeave}
                >
                  {/* Landscape card with rank number */}
                  <div
                    className={`relative aspect-[16/10] rounded-lg overflow-hidden cursor-pointer transition-all duration-300 ${
                      isHovered
                        ? 'scale-105 z-20 shadow-2xl shadow-black/80 ring-1 ring-birgen-red/40'
                        : 'z-10'
                    }`}
                    onClick={() => setInfoMovie(movie)}
                  >
                    {/* Backdrop image */}
                    <Image
                      src={movie.backdrop}
                      alt={movie.displayTitle}
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 20vw"
                    />

                    {/* Bottom gradient for readability */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                    {/* Large rank number — bottom left, overlapping edge */}
                    <span
                      className="absolute -bottom-2 -left-1 select-none pointer-events-none font-display leading-none text-transparent top5-number"
                      style={{
                        fontSize: 'clamp(72px, 6vw, 120px)',
                        WebkitTextStroke: '2px rgba(255,255,255,0.3)',
                      }}
                    >
                      {idx + 1}
                    </span>

                    {/* Movie title — bottom right */}
                    <div className="absolute bottom-2 right-2 left-12 text-right">
                      <p className="text-white text-xs sm:text-sm font-semibold leading-tight drop-shadow-lg line-clamp-1">
                        {movie.displayTitle}
                      </p>
                      <p className="text-white/60 text-[10px] mt-0.5">{movie.year}</p>
                    </div>

                    {/* Rating badge — top right */}
                    {userRating && (
                      <div className="absolute top-2 right-2 flex items-center gap-0.5 px-2 py-0.5 rounded bg-birgen-red/90 shadow-md z-10">
                        <Star className="w-2.5 h-2.5 fill-white text-white" />
                        <span className="text-[10px] font-bold text-white">
                          {userRating}/5
                        </span>
                      </div>
                    )}

                    {/* Hover play icon overlay */}
                    <div
                      className={`absolute inset-0 flex items-center justify-center transition-opacity duration-200 ${
                        isHovered ? 'opacity-100' : 'opacity-0'
                      }`}
                    >
                      <div className="w-11 h-11 rounded-full bg-white/90 flex items-center justify-center shadow-lg backdrop-blur-sm">
                        <Play className="w-5 h-5 fill-black text-black ml-0.5" />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Info popup */}
      {infoMovie && (
        <InfoPopup
          movie={infoMovie}
          onClose={() => setInfoMovie(null)}
          onPlayTrailer={() => {
            const idx = TOP5_MOVIES.findIndex(
              (m) => m.movieId === infoMovie.movieId,
            );
            openTrailer(idx >= 0 ? idx : 0);
          }}
          onRate={(rating) => handleRate(infoMovie, rating)}
          userRating={ratings.get(infoMovie.movieId)}
        />
      )}

      {/* Fullscreen trailer player */}
      {trailerPlayer.open && (
        <TrailerPlayer
          movies={TOP5_MOVIES}
          startIndex={trailerPlayer.startIndex}
          onClose={() => setTrailerPlayer({ open: false, startIndex: 0 })}
          onRateMovie={handleRate}
          userRatings={ratings}
        />
      )}
    </>
  );
}
