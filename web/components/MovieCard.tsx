'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { Star, Play, Plus, Check, ThumbsUp, X, ArrowLeft, Pause, RotateCcw, RotateCw, Volume2, VolumeX, Film } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Movie } from '@/types';
import { hasStream, getStreamUrl, getStreamMp4Url } from '@/lib/stream';
import { usePlaybackProgress } from '@/hooks/usePlaybackProgress';
import { useCardArt } from '@/hooks/useCardArt';
import { announceMediaPlay } from '@/lib/mediaBus';
import FullMoviePlayer from '@/components/FullMoviePlayer';
import { getPlayableBySlug } from '@/lib/playableMovies';

interface MovieCardProps {
  movie: Movie;
  userRating?: number;
  onRate?: (movie: Movie, rating: number) => void;
  showRating?: boolean;
  size?: 'sm' | 'md' | 'lg';
  inMyList?: boolean;
  onAddToList?: (movie: Movie) => void;
  onRemoveFromList?: (movieId: number) => void;
}

export default function MovieCard({
  movie,
  userRating,
  onRate,
  showRating = false,
  inMyList = false,
  onAddToList,
  onRemoveFromList,
}: MovieCardProps) {
  const [hovered, setHovered] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showRatingPopup, setShowRatingPopup] = useState(false);
  const [playerMode, setPlayerMode] = useState<'movie' | 'trailer' | null>(null);
  const [ratingHover, setRatingHover] = useState(0);
  const router = useRouter();
  // A playable title routes full-movie playback through the unified player.
  const playableSlug = movie.slug && getPlayableBySlug(movie.slug) ? movie.slug : null;

  const genres = movie.genres?.split('|').slice(0, 2) || [];
  const rated = userRating !== undefined && userRating > 0;
  const displayTitle = movie.title.replace(/\s*\(\d{4}\)\s*$/, '');
  // Playable titles use cinematic art with the title baked in; everything else uses the
  // title-less backdrop + a code-drawn title. `showTitle` also covers the pre-upload 404 fallback.
  const { src: imageUrl, showTitle, onError } = useCardArt(
    movie.card_url,
    movie.backdrop_url,
    movie.poster_url,
  );
  // Popups prefer the clean, title-less backdrop — but HD titles intentionally have no
  // backdrop, so fall back to the card art (then poster) instead of showing a broken image.
  const { src: popupImage, onError: onPopupError } = useCardArt(
    movie.backdrop_url,
    movie.card_url,
    movie.poster_url,
  );
  const hasTrailer = !!movie.trailer_url;

  const handleRate = (rating: number) => {
    onRate?.(movie, rating);
    setShowRatingPopup(false);
  };

  return (
    <>
      <div
        className="relative group cursor-pointer"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Landscape card — click opens the info popup */}
        <div
          onClick={() => setShowInfo(true)}
          className={`relative aspect-video rounded-md overflow-hidden bg-birgen-card transition-all duration-300 ${
            hovered ? 'scale-105 z-20 shadow-2xl shadow-black/80 ring-1 ring-white/10' : 'z-10'
          }`}
        >
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={movie.title}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 20vw"
              className="object-cover"
              loading="lazy"
              onError={onError}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-birgen-card to-birgen-dark">
              <span className="text-birgen-muted text-xs text-center px-3 line-clamp-2">
                {displayTitle}
              </span>
            </div>
          )}

          {/* Bottom gradient — only needed under a code-drawn title (baked-in art needs none) */}
          {showTitle && (
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent pointer-events-none z-[2]" />
          )}

          {movie.comingSoon && (
            <div className="absolute top-1.5 left-1.5 z-[11] px-1.5 py-0.5 rounded bg-black/70 border border-white/15 text-[9px] font-bold uppercase tracking-wider text-white/95">
              Soon
            </div>
          )}

          {/* Rating badge — top right */}
          {rated && (
            <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 px-2 py-0.5 rounded bg-birgen-red/90 shadow-md z-[11]">
              <Star className="w-2.5 h-2.5 fill-white text-white" />
              <span className="text-[10px] font-bold text-white">{userRating}/5</span>
            </div>
          )}

          {/* Predicted rating badge */}
          {movie.predicted_rating && !rated && (
            <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 px-2 py-0.5 rounded bg-black/70 backdrop-blur-sm z-[11]">
              <Star className="w-2.5 h-2.5 fill-birgen-red text-birgen-red" />
              <span className="text-[10px] font-medium text-white">{movie.predicted_rating}</span>
            </div>
          )}

          {/* My List badge */}
          {inMyList && !rated && (
            <div className="absolute top-1.5 left-1.5 flex items-center gap-0.5 px-2 py-0.5 rounded bg-white/20 backdrop-blur-sm z-[11]">
              <Check className="w-2.5 h-2.5 text-white" />
              <span className="text-[10px] font-medium text-white">Listed</span>
            </div>
          )}

          {/* Bottom info — drawn only when there's no baked-in cinematic title */}
          {showTitle && (
            <div className="absolute bottom-1.5 left-2 right-2 z-[3] pointer-events-none">
              <p className="text-white text-xs sm:text-sm font-medium leading-tight drop-shadow-lg line-clamp-1">
                {displayTitle}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                {movie.year && (
                  <span className="text-white/50 text-[10px]">{movie.year}</span>
                )}
                {genres.length > 0 && (
                  <span className="text-white/40 text-[10px]">{genres.join(' · ')}</span>
                )}
              </div>
            </div>
          )}

          {/* Hover play overlay — single white play button opens the popup */}
          <div
            className={`absolute inset-0 flex items-center justify-center transition-opacity duration-200 z-20 pointer-events-none ${
              hovered ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <div className="w-11 h-11 rounded-full bg-white/90 flex items-center justify-center shadow-lg backdrop-blur-sm">
              <Play className="w-5 h-5 fill-black text-black ml-0.5" />
            </div>
          </div>
        </div>
      </div>

      {/* Rating popup */}
      {showRatingPopup && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in"
          onClick={() => setShowRatingPopup(false)}
        >
          <div
            className="relative w-full max-w-sm mx-4 rounded-xl overflow-hidden bg-birgen-dark border border-birgen-border shadow-2xl animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            {popupImage && (
              <div className="relative h-36">
                <Image src={popupImage} alt={displayTitle} fill className="object-cover" sizes="400px" onError={onPopupError} />
                <div className="absolute inset-0 bg-gradient-to-t from-birgen-dark via-birgen-dark/50 to-transparent" />
              </div>
            )}
            <div className="px-5 pb-5 -mt-8 relative z-10">
              <h3 className="font-display text-2xl text-white tracking-wide mb-1">{displayTitle}</h3>
              <p className="text-birgen-muted text-sm mb-4">Rate this movie</p>
              <div className="flex justify-center gap-2 mb-4">
                {[1, 2, 3, 4, 5].map((star) => {
                  const active = ratingHover > 0 ? star <= ratingHover : userRating ? star <= userRating : false;
                  return (
                    <button
                      key={star}
                      onMouseEnter={() => setRatingHover(star)}
                      onMouseLeave={() => setRatingHover(0)}
                      onClick={() => handleRate(star)}
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
              {ratingHover > 0 && (
                <p className="text-center text-white text-sm font-medium mb-2">{ratingHover}/5</p>
              )}
              <button
                onClick={() => setShowRatingPopup(false)}
                className="w-full py-2 text-birgen-muted hover:text-white text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Info popup */}
      {showInfo && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in"
          onClick={() => setShowInfo(false)}
        >
          <div
            className="relative w-full max-w-lg mx-4 rounded-xl overflow-hidden bg-birgen-dark border border-birgen-border shadow-2xl animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            {popupImage && (
              <div className="relative h-52">
                <Image src={popupImage} alt={displayTitle} fill className="object-cover" sizes="544px" onError={onPopupError} />
                <div className="absolute inset-0 bg-gradient-to-t from-birgen-dark via-transparent to-transparent" />
                <button
                  onClick={() => setShowInfo(false)}
                  className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 border border-white/20 flex items-center justify-center text-white hover:bg-black/80"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
            <div className="p-5 -mt-12 relative z-10">
              <h2 className="font-display text-3xl text-white tracking-wide mb-1">{displayTitle}</h2>
              <div className="flex items-center gap-2 mb-3 flex-wrap text-sm">
                {movie.year && <span className="text-birgen-silver">{movie.year}</span>}
                {movie.avg_rating && (
                  <span className="text-green-400 font-semibold">
                    {Number(movie.avg_rating).toFixed(1)}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {genres.map((g) => (
                  <span key={g} className="text-[11px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-birgen-silver">
                    {g}
                  </span>
                ))}
              </div>
              {movie.overview && (
                <p className="text-birgen-silver text-sm leading-relaxed mb-4 line-clamp-3">{movie.overview}</p>
              )}
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={() => {
                    setShowInfo(false);
                    setPlayerMode('movie');
                  }}
                  className="flex items-center gap-2 px-5 py-2.5 bg-white hover:bg-white/90 text-black font-bold rounded-md transition-all hover:scale-[1.03] active:scale-95 text-sm"
                >
                  <Play className="w-4 h-4 fill-black" />
                  Play Movie
                </button>
                {hasTrailer && (
                  <button
                    onClick={() => {
                      setShowInfo(false);
                      setPlayerMode('trailer');
                    }}
                    className="flex items-center gap-2 px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-md border border-white/10 transition-all hover:scale-[1.03] active:scale-95 text-sm"
                  >
                    <Film className="w-4 h-4" />
                    Watch Trailer
                  </button>
                )}
                <button
                  onClick={() => {
                    if (inMyList) {
                      onRemoveFromList?.(movie.movieId);
                    } else {
                      onAddToList?.(movie);
                    }
                  }}
                  className="flex items-center gap-2 px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-md border border-white/10 transition-all text-sm"
                >
                  {inMyList ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  {inMyList ? 'In My List' : 'My List'}
                </button>
                <button
                  onClick={() => {
                    setShowInfo(false);
                    setShowRatingPopup(true);
                  }}
                  className="flex items-center gap-2 px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-md border border-white/10 transition-all text-sm"
                >
                  <ThumbsUp className="w-4 h-4" />
                  Rate
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Full movie → unified Netflix-grade player (playable titles only). */}
      {playerMode === 'movie' && playableSlug && (
        <FullMoviePlayer
          slug={playableSlug}
          onClose={() => setPlayerMode(null)}
          onChangeSlug={(s) => {
            setPlayerMode(null);
            router.push(`/watch/${s}`);
          }}
        />
      )}

      {/* Trailer, or non-playable "Coming Soon", keep the lightweight player. */}
      {playerMode && !(playerMode === 'movie' && playableSlug) && (
        <StreamPlayer
          movie={movie}
          displayTitle={displayTitle}
          mode={playerMode}
          inMyList={inMyList}
          onAddToList={onAddToList}
          onClose={() => setPlayerMode(null)}
        />
      )}
    </>
  );
}

/* ── Format seconds to m:ss ───────────────────────────── */
function fmtTime(s: number) {
  if (!isFinite(s) || s < 0) return '0:00';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

/* ── Fullscreen Stream Player ─────────────────────────── */
function StreamPlayer({
  movie,
  displayTitle,
  mode,
  inMyList,
  onAddToList,
  onClose,
}: {
  movie: Movie;
  displayTitle: string;
  /** 'trailer' plays the short trailer asset; 'movie' plays the full stream. */
  mode: 'movie' | 'trailer';
  inMyList: boolean;
  onAddToList?: (movie: Movie) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsTimer = useRef<NodeJS.Timeout>();
  const { getPosition, savePosition } = usePlaybackProgress();

  const isTrailer = mode === 'trailer';
  const streamAvailable = isTrailer
    ? !!movie.trailer_url
    : hasStream(movie.movieId) || !!movie.stream_url;
  const videoSrc = isTrailer
    ? movie.trailer_url || null
    : movie.stream_url || getStreamUrl(movie.movieId) || getStreamMp4Url(movie.movieId);

  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);

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
      if (e.key === 'Escape') onClose();
      if (e.key === ' ') { e.preventDefault(); togglePlay(); }
      if (e.key === 'ArrowRight') skip(15);
      if (e.key === 'ArrowLeft') skip(-15);
      if (e.key === 'm') toggleMute();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  // Restore saved position when video loads (full movie only — never trailers)
  useEffect(() => {
    const v = videoRef.current;
    if (!v || isTrailer) return;
    const handleLoaded = () => {
      const saved = getPosition(movie.movieId);
      if (saved > 0) v.currentTime = saved;
    };
    v.addEventListener('loadedmetadata', handleLoaded);
    return () => v.removeEventListener('loadedmetadata', handleLoaded);
  }, [movie.movieId, getPosition, isTrailer]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setPaused(false); }
    else { v.pause(); setPaused(true); }
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

  const onTimeUpdate = () => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    setProgress((v.currentTime / v.duration) * 100);
    setCurrentTime(v.currentTime);
    setDuration(v.duration);
    // Save progress every ~5s worth of updates (full movie only — not trailers)
    if (!isTrailer && Math.floor(v.currentTime) % 5 === 0) {
      savePosition(movie.movieId, v.currentTime, v.duration);
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

  // ── If no stream, show "Coming Soon" ──
  if (!streamAvailable || !videoSrc) {
    return (
      <div className="fixed inset-0 z-[200] bg-black flex flex-col">
        <div className="flex items-center gap-4 px-6 pt-5">
          <button onClick={onClose} className="w-10 h-10 rounded-full flex items-center justify-center text-white hover:bg-white/10 transition-colors">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h3 className="text-white font-semibold text-lg">{displayTitle}</h3>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div className="w-24 h-24 rounded-full border-2 border-birgen-red/30 flex items-center justify-center mb-6">
            <Play className="w-10 h-10 text-birgen-red/60" />
          </div>
          <h2 className="font-display text-4xl text-white tracking-wide mb-3 text-center">COMING SOON</h2>
          <p className="text-birgen-muted text-center max-w-md mb-2">
            Full streaming for <span className="text-white font-medium">{displayTitle}</span> will be available when BirgenAI launches its streaming service.
          </p>
          <p className="text-birgen-red text-sm font-medium mb-8">Stay tuned for updates</p>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="flex items-center gap-2 px-6 py-3 bg-white hover:bg-white/90 text-black font-bold rounded-md transition-all">
              <ArrowLeft className="w-4 h-4" /> Go Back
            </button>
            <button
              onClick={() => { if (!inMyList) onAddToList?.(movie); onClose(); }}
              className="flex items-center gap-2 px-6 py-3 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-md border border-white/10 transition-all"
            >
              <Plus className="w-4 h-4" /> Add to My List
            </button>
          </div>
        </div>
        <div className="px-6 pb-6">
          <div className="h-1 bg-white/10 rounded-full overflow-hidden"><div className="h-full w-0 bg-birgen-red rounded-full" /></div>
          <div className="flex items-center justify-between mt-2 text-white/40 text-xs font-mono"><span>0:00</span><span>0:00</span></div>
        </div>
      </div>
    );
  }

  // ── Full streaming player ──
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
        onEnded={onClose}
      >
        {/* Try HLS first, then MP4 fallback */}
        <source src={videoSrc} type={videoSrc.endsWith('.m3u8') ? 'application/x-mpegURL' : 'video/mp4'} />
        {getStreamMp4Url(movie.movieId) && videoSrc.endsWith('.m3u8') && (
          <source src={getStreamMp4Url(movie.movieId)!} type="video/mp4" />
        )}
      </video>

      {/* Controls overlay */}
      <div className={`absolute inset-0 flex flex-col justify-between transition-opacity duration-500 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        {/* Top */}
        <div className="flex items-center gap-4 px-4 sm:px-8 pt-5 pb-10 bg-gradient-to-b from-black/80 via-black/30 to-transparent">
          <button onClick={onClose} className="w-10 h-10 rounded-full flex items-center justify-center text-white hover:bg-white/10 transition-colors">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div className="flex-1 min-w-0">
            <h3 className="text-white font-semibold text-base sm:text-lg truncate">{displayTitle}</h3>
            <p className="text-white/50 text-xs flex items-center gap-1.5 mt-0.5">
              {!isTrailer && <Film className="w-3 h-3 text-birgen-red" />}
              {isTrailer ? 'Trailer' : 'Full Movie'}
            </p>
          </div>
        </div>

        {/* Center: tap to play/pause */}
        <button onClick={togglePlay} className="flex-1 cursor-pointer" aria-label={paused ? 'Play' : 'Pause'} />

        {/* Bottom controls */}
        <div className="px-4 sm:px-8 pb-5 pt-10 bg-gradient-to-t from-black/90 via-black/50 to-transparent">
          {/* Progress bar */}
          <div className="group cursor-pointer mb-3" onClick={onProgressClick}>
            <div className="relative h-1 group-hover:h-1.5 bg-white/25 rounded-full transition-all overflow-hidden">
              <div className="absolute inset-y-0 left-0 bg-birgen-red rounded-full transition-[width] duration-150" style={{ width: `${progress}%` }} />
              <div className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-birgen-red opacity-0 group-hover:opacity-100 transition-opacity shadow-lg" style={{ left: `calc(${progress}% - 7px)` }} />
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <button onClick={togglePlay} className="text-white hover:text-white/80 transition-colors">
              {paused ? <Play className="w-7 h-7 fill-white" /> : <Pause className="w-7 h-7" />}
            </button>
            <button onClick={() => skip(-15)} className="text-white hover:text-white/80 transition-colors">
              <RotateCcw className="w-5 h-5" />
            </button>
            <button onClick={() => skip(15)} className="text-white hover:text-white/80 transition-colors">
              <RotateCw className="w-5 h-5" />
            </button>
            <button onClick={toggleMute} className="text-white hover:text-white/80 transition-colors">
              {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
            <span className="text-white/70 text-xs sm:text-sm font-mono tabular-nums">
              {fmtTime(currentTime)} / {fmtTime(duration)}
            </span>
            <div className="flex-1" />
            <span className="hidden sm:block text-white/50 text-xs truncate max-w-[200px]">{displayTitle}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Skeleton loader — landscape
export function MovieCardSkeleton() {
  return (
    <div>
      <div className="aspect-video rounded-md shimmer" />
    </div>
  );
}
