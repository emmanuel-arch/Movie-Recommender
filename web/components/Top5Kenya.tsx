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
  Film,
  Plus,
  Check,
} from 'lucide-react';
import { Movie } from '@/types';
import { useRatings } from '@/hooks/useRatings';
import { useMyList } from '@/hooks/useMyList';
import { hasStream, getStreamUrl, getStreamMp4Url } from '@/lib/stream';
import { usePlaybackProgress } from '@/hooks/usePlaybackProgress';
import { useCardArt } from '@/hooks/useCardArt';
import toast from 'react-hot-toast';
import AuthModal from '@/components/AuthModal';
import { useAuth } from '@/components/AuthProvider';
import { announceMediaPlay } from '@/lib/mediaBus';
import FullMoviePlayer from '@/components/FullMoviePlayer';
import { getPlayableByMovieId } from '@/lib/playableMovies';
import {
  top10KenyaEntries,
  catalogCardPath,
  catalogBackdropPath,
  catalogPosterPath,
  catalogTrailerPath,
} from '@/lib/catalog';

/* ── Top 10 card shape (built from the catalog below) ─────────── */
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
  /** Cinematic 16:9 art with the title baked in; falls back to backdrop until uploaded. */
  card: string;
  trailer: string;
}

/** Only the original launch-5 titles ship a real trailer MP4; HD titles are play-only. */
const TRAILER_SLUGS = new Set([
  'get-out',
  'sicario',
  'inception',
  'the-dark-knight',
  'shutter-island',
]);

function formatRuntime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/**
 * "Top 10 Movies in Kenya Today" — derived from the catalog (Get Out + Sicario, then
 * the eight broadest-appeal full-HD titles). Every entry is `playable: true`, so the
 * card sends the viewer straight to the 1080p stream. Order = TOP10_KENYA_SLUGS.
 */
const TOP10_MOVIES: Top5Movie[] = top10KenyaEntries().map((e) => ({
  movieId: e.movieId,
  title: `${e.displayTitle} (${e.year})`,
  displayTitle: e.displayTitle,
  year: String(e.year),
  rating: e.tmdbVoteAverage.toFixed(1),
  maturity: e.maturity,
  duration: formatRuntime(e.runtimeMinutes),
  overview: e.overview,
  genres: e.genres.join('|'),
  genreList: e.genres,
  poster: catalogPosterPath(e),
  backdrop: catalogBackdropPath(e),
  card: catalogCardPath(e),
  trailer: TRAILER_SLUGS.has(e.slug) ? catalogTrailerPath(e) : '',
}));

/* ── Format time helper ─────────────────────────────────── */
function formatTime(s: number) {
  if (!isFinite(s) || s < 0) return '0:00';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
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
  onPlayMovie,
  onPlayTrailer,
  onRate,
  userRating,
  inMyList,
  onToggleList,
}: {
  movie: Top5Movie;
  onClose: () => void;
  onPlayMovie: () => void;
  onPlayTrailer: () => void;
  onRate: (rating: number) => void;
  userRating?: number;
  inMyList: boolean;
  onToggleList: () => void;
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
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={onPlayMovie}
                className="flex items-center gap-2 px-6 py-2.5 bg-white hover:bg-white/90 text-black font-bold rounded-md transition-all hover:scale-[1.03] active:scale-95 text-sm"
              >
                <Play className="w-5 h-5 fill-black" />
                Play Movie
              </button>
              {movie.trailer && (
                <button
                  onClick={onPlayTrailer}
                  className="flex items-center gap-2 px-6 py-2.5 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-md border border-white/10 transition-all hover:scale-[1.03] active:scale-95 text-sm"
                >
                  <Film className="w-4 h-4" />
                  Watch Trailer
                </button>
              )}
              <button
                onClick={onToggleList}
                className="flex items-center gap-2 px-6 py-2.5 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-md border border-white/10 transition-all hover:scale-[1.03] active:scale-95 text-sm"
              >
                {inMyList ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                {inMyList ? 'In My List' : 'My List'}
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
  streamMode = false,
}: {
  movies: Top5Movie[];
  startIndex: number;
  onClose: () => void;
  onRateMovie: (movie: Top5Movie, rating: number) => void;
  userRatings: Map<number, number>;
  streamMode?: boolean;
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
  const lastSaveRef = useRef(0);
  const movie = movies[currentIdx];
  const { getPosition, savePosition } = usePlaybackProgress();

  // Compute video source
  const isStreaming = streamMode && hasStream(movie.movieId);
  const videoSrc = isStreaming
    ? (getStreamUrl(movie.movieId) || getStreamMp4Url(movie.movieId) || movie.trailer)
    : movie.trailer;

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
    lastSaveRef.current = 0;

    // Restore saved position for full movies
    if (isStreaming) {
      const saved = getPosition(movie.movieId);
      if (saved > 0) {
        const onLoaded = () => {
          v.currentTime = saved;
          v.removeEventListener('loadedmetadata', onLoaded);
        };
        v.addEventListener('loadedmetadata', onLoaded);
      }
    }
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

    // Save playback progress every 5s in stream mode
    if (isStreaming) {
      const now = Date.now();
      if (now - lastSaveRef.current > 5000) {
        savePosition(movie.movieId, v.currentTime, v.duration);
        lastSaveRef.current = now;
      }
    }
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
        onPlay={announceMediaPlay}
        onEnded={handleTrailerEnded}
      >
        <source
          src={videoSrc}
          type={videoSrc.endsWith('.m3u8') ? 'application/x-mpegURL' : 'video/mp4'}
        />
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
            <p className="text-white/50 text-xs flex items-center gap-1">
              {isStreaming && <Film className="w-3 h-3 text-birgen-red" />}
              {isStreaming ? 'Full Movie' : 'Full Trailer'}
            </p>
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

/* ── Single Top 5 card (rank + cinematic art) ─────────────── */
function Top5Card({
  movie,
  idx,
  isHovered,
  userRating,
  onOpen,
  onMouseEnter,
  onMouseLeave,
}: {
  movie: Top5Movie;
  idx: number;
  isHovered: boolean;
  userRating?: number;
  onOpen: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  // Playable Top 5 titles use cinematic art with the title baked in; until that art is
  // uploaded we fall back to the title-less backdrop and re-draw the title (showTitle).
  const { src, showTitle, onError } = useCardArt(movie.card, movie.backdrop, movie.poster);

  return (
    <div className="relative group" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <div
        className={`relative aspect-video rounded-lg overflow-hidden cursor-pointer transition-all duration-300 ${
          isHovered ? 'scale-105 z-20 shadow-2xl shadow-black/80 ring-1 ring-birgen-red/40' : 'z-10'
        }`}
        onClick={onOpen}
      >
        <Image
          src={src ?? movie.backdrop}
          alt={movie.displayTitle}
          fill
          className="object-cover"
          sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 20vw"
          onError={onError}
        />

        {/* Rank number — always shown (Netflix Top 10 style) */}
        <span
          className="absolute -bottom-2 -left-1 select-none pointer-events-none font-display leading-none text-transparent top5-number z-[3]"
          style={{ fontSize: 'clamp(72px, 6vw, 120px)', WebkitTextStroke: '2px rgba(255,255,255,0.3)' }}
        >
          {idx + 1}
        </span>

        {/* Title — drawn only when there's no baked-in cinematic title */}
        {showTitle && (
          <>
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none z-[2]" />
            <div className="absolute bottom-2 right-2 left-12 text-right z-[3]">
              <p className="text-white text-xs sm:text-sm font-semibold leading-tight drop-shadow-lg line-clamp-1">
                {movie.displayTitle}
              </p>
              <p className="text-white/60 text-[10px] mt-0.5">{movie.year}</p>
            </div>
          </>
        )}

        {/* Rating badge — top right */}
        {userRating && (
          <div className="absolute top-2 right-2 flex items-center gap-0.5 px-2 py-0.5 rounded bg-birgen-red/90 shadow-md z-[4]">
            <Star className="w-2.5 h-2.5 fill-white text-white" />
            <span className="text-[10px] font-bold text-white">{userRating}/5</span>
          </div>
        )}

        {/* Hover play icon overlay */}
        <div
          className={`absolute inset-0 flex items-center justify-center transition-opacity duration-200 z-[4] ${
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
}

/* ── Main Top 5 Kenya Section ─────────────────────────────── */
export default function Top5Kenya() {
  const { ratings, rateMovie } = useRatings();
  const { myList, addToList, removeFromList } = useMyList();
  const myListIds = new Set(myList.map((m) => m.movieId));
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [infoMovie, setInfoMovie] = useState<Top5Movie | null>(null);
  const [trailerPlayer, setTrailerPlayer] = useState<{
    open: boolean;
    startIndex: number;
    streamMode: boolean;
  }>({ open: false, startIndex: 0, streamMode: false });
  const [pendingPlayIdx, setPendingPlayIdx] = useState<number | null>(null);
  // The unified full-movie player (Netflix-grade VideoPlayer) plays by slug.
  const [moviePlayerSlug, setMoviePlayerSlug] = useState<string | null>(null);
  const hoverTimeout = useRef<NodeJS.Timeout>();
  const { user } = useAuth();

  const playFullMovie = (idx: number) => {
    const movie = TOP10_MOVIES[idx];
    const slug = movie ? getPlayableByMovieId(movie.movieId)?.slug ?? null : null;
    if (slug) setMoviePlayerSlug(slug);
    else setTrailerPlayer({ open: true, startIndex: idx, streamMode: true }); // fallback
  };

  const handleMouseEnter = (idx: number) => {
    clearTimeout(hoverTimeout.current);
    hoverTimeout.current = setTimeout(() => setHoveredIdx(idx), 150);
  };

  const handleMouseLeave = () => {
    clearTimeout(hoverTimeout.current);
    setHoveredIdx(null);
  };

  const top5ToMovie = (movie: Top5Movie): Movie => ({
    movieId: movie.movieId,
    title: movie.title,
    genres: movie.genres,
    year: movie.year,
    poster_url: movie.poster,
    backdrop_url: movie.backdrop,
    overview: movie.overview,
  });

  const handleRate = (movie: Top5Movie, rating: number) => {
    rateMovie(top5ToMovie(movie), rating);
    toast.success(`Rated "${movie.displayTitle}" ${rating}/5`, { duration: 2000 });
  };

  const handleToggleList = (movie: Top5Movie) => {
    if (myListIds.has(movie.movieId)) {
      removeFromList(movie.movieId);
      toast.success(`Removed "${movie.displayTitle}" from My List`, { duration: 2000 });
    } else {
      addToList(top5ToMovie(movie));
      toast.success(`Added "${movie.displayTitle}" to My List`, { duration: 2000 });
    }
  };

  // Watch Trailer — always plays the trailer asset, never the full stream.
  const openTrailer = (idx: number) => {
    setInfoMovie(null);
    setTrailerPlayer({ open: true, startIndex: idx, streamMode: false });
  };

  // Play Movie — opens the unified Netflix-grade player (resume + screen-time).
  // Auth-gated for streamable titles.
  const openMovie = (idx: number) => {
    setInfoMovie(null);
    const movie = TOP10_MOVIES[idx];
    if (movie && hasStream(movie.movieId) && !user) {
      setPendingPlayIdx(idx);
      return;
    }
    playFullMovie(idx);
  };

  return (
    <>
      <section className="relative py-6 mt-2">
        {/* Section header */}
        <div className="mb-4 px-4 sm:px-6 lg:px-8">
          <h2 className="text-xl sm:text-2xl font-bold text-white">
            Top 10 Movies in Kenya Today
          </h2>
        </div>

        {/* Red accent line */}
        <div className="h-px bg-gradient-to-r from-birgen-red via-birgen-red/30 to-transparent mx-4 sm:mx-6 lg:mx-8 mb-5" />

        {/* 5-column grid — 10 ranked titles wrap to two rows on desktop */}
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {TOP10_MOVIES.map((movie, idx) => (
              <Top5Card
                key={movie.movieId}
                movie={movie}
                idx={idx}
                isHovered={hoveredIdx === idx}
                userRating={ratings.get(movie.movieId)}
                onOpen={() => setInfoMovie(movie)}
                onMouseEnter={() => handleMouseEnter(idx)}
                onMouseLeave={handleMouseLeave}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Info popup */}
      {infoMovie && (
        <InfoPopup
          movie={infoMovie}
          onClose={() => setInfoMovie(null)}
          onPlayMovie={() => {
            const idx = TOP10_MOVIES.findIndex(
              (m) => m.movieId === infoMovie.movieId,
            );
            openMovie(idx >= 0 ? idx : 0);
          }}
          onPlayTrailer={() => {
            const idx = TOP10_MOVIES.findIndex(
              (m) => m.movieId === infoMovie.movieId,
            );
            openTrailer(idx >= 0 ? idx : 0);
          }}
          onRate={(rating) => handleRate(infoMovie, rating)}
          userRating={ratings.get(infoMovie.movieId)}
          inMyList={myListIds.has(infoMovie.movieId)}
          onToggleList={() => handleToggleList(infoMovie)}
        />
      )}

      {/* Fullscreen trailer player */}
      {trailerPlayer.open && (
        <TrailerPlayer
          movies={TOP10_MOVIES}
          startIndex={trailerPlayer.startIndex}
          onClose={() => setTrailerPlayer({ open: false, startIndex: 0, streamMode: false })}
          onRateMovie={handleRate}
          userRatings={ratings}
          streamMode={trailerPlayer.streamMode}
        />
      )}

      {/* Unified Netflix-grade full-movie player */}
      {moviePlayerSlug && (
        <FullMoviePlayer
          slug={moviePlayerSlug}
          onClose={() => setMoviePlayerSlug(null)}
          onChangeSlug={(s) => setMoviePlayerSlug(s)}
        />
      )}

      {/* Auth gate before full-movie streaming */}
      {pendingPlayIdx !== null && (
        <AuthModal
          title="You're 1 click away from watching"
          subtitle={`Sign up to resume ${TOP10_MOVIES[pendingPlayIdx].displayTitle} across devices`}
          onClose={() => setPendingPlayIdx(null)}
          onContinueGuest={() => {
            const idx = pendingPlayIdx;
            setPendingPlayIdx(null);
            playFullMovie(idx);
          }}
        />
      )}
    </>
  );
}
