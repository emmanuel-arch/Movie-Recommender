'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import Image from 'next/image';
import {
  Play,
  Info,
  VolumeX,
  Volume2,
  X,
  Pause,
  SkipForward,
  SkipBack,
  RotateCcw,
  RotateCw,
  ArrowLeft,
  Film,
} from 'lucide-react';
import { hasStream, getStreamUrl, getStreamMp4Url } from '@/lib/stream';
import { usePlaybackProgress } from '@/hooks/usePlaybackProgress';
import { assetUrl } from '@/lib/assets';

/* ────────────────────────────────────────────────────────
   5 Featured movies — rotating hero with background video
   ──────────────────────────────────────────────────────── */
interface FeaturedMovie {
  movieId: number;
  title: string;
  year: string;
  rating: string;
  maturity: string;
  duration: string;
  overview: string;
  genres: string[];
  backdrop: string;
  video: string;
  tagline: string;
  stream_url?: string | null;
}

const FEATURED_MOVIES: FeaturedMovie[] = [
  {
    movieId: 168250,
    title: 'Get Out',
    year: '2017',
    rating: '7.7',
    maturity: 'R',
    duration: '1h 44m',
    overview:
      'A young African-American visits his white girlfriend\'s parents for the weekend, where his simmering uneasiness about their reception of him eventually reaches a boiling point.',
    genres: ['Horror', 'Thriller', 'Mystery'],
    backdrop: assetUrl('/Images/getout.png'),
    video: assetUrl('/Videos/hero-getout-2017.mp4'),
    tagline: '#1 in Movies Today',
  },
  {
    movieId: 139644,
    title: 'Sicario',
    year: '2015',
    rating: '7.6',
    maturity: 'R',
    duration: '2h 1m',
    overview:
      'An idealistic FBI agent is enlisted by a government task force to aid in the escalating war against drugs at the border area between the U.S. and Mexico.',
    genres: ['Action', 'Crime', 'Drama'],
    backdrop: assetUrl('/Images/hero-sicario.jpg'),
    video: assetUrl('/Videos/hero-sicario-2015.mp4'),
    tagline: '#2 Trending in Kenya',
  },
  {
    movieId: 79132,
    title: 'Inception',
    year: '2010',
    rating: '8.8',
    maturity: 'PG-13',
    duration: '2h 28m',
    overview:
      'A thief who steals corporate secrets through the use of dream-sharing technology is given the inverse task of planting an idea into the mind of a C.E.O.',
    genres: ['Sci-Fi', 'Action', 'Thriller'],
    backdrop: assetUrl('/Images/hero-inception.webp'),
    video: assetUrl('/Videos/hero-inception-2010.mp4'),
    tagline: '#1 Top 10 Movies This Week',
  },
  {
    movieId: 58559,
    title: 'The Dark Knight',
    year: '2008',
    rating: '9.0',
    maturity: 'PG-13',
    duration: '2h 32m',
    overview:
      'When the menace known as the Joker wreaks havoc and chaos on the people of Gotham, Batman must accept one of the greatest psychological and physical tests of his ability to fight injustice.',
    genres: ['Action', 'Crime', 'Drama'],
    backdrop: assetUrl('/Images/hero-the-dark-knight-2008.webp'),
    video: assetUrl('/Videos/hero-thedarkknight-2008.mp4'),
    tagline: '#3 Most Watched Worldwide',
  },
  {
    movieId: 74458,
    title: 'Shutter Island',
    year: '2010',
    rating: '8.2',
    maturity: 'R',
    duration: '2h 18m',
    overview:
      'In 1954, a U.S. Marshal investigates the disappearance of a murderer who escaped from a hospital for the criminally insane on a remote island.',
    genres: ['Mystery', 'Thriller'],
    backdrop: assetUrl('/Images/hero-shutter-island.jpg'),
    video: assetUrl('/Videos/hero-shutter-island.mp4'),
    tagline: '#5 Top 10 Thrillers',
  },
];

const BACKDROP_DURATION = 3000; // show backdrop for 3s before video plays

/* ── More Info Modal ───────────────────────────────────── */
function MoreInfoModal({
  movie,
  onClose,
  onPlay,
}: {
  movie: FeaturedMovie;
  onClose: () => void;
  onPlay: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl mx-4 rounded-2xl overflow-hidden bg-birgen-dark border border-birgen-border shadow-2xl animate-scale-in">
        <div className="relative h-64 sm:h-80">
          <Image
            src={movie.backdrop}
            alt={movie.title}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 672px"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-birgen-dark via-transparent to-transparent" />
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-black/60 border border-white/20 flex items-center justify-center text-white hover:bg-black/80 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 -mt-16 relative z-10">
          <h2 className="font-display text-4xl text-white tracking-wide mb-2">
            {movie.title}
          </h2>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <span className="text-green-400 font-semibold text-sm">{movie.rating} Rating</span>
            <span className="text-birgen-silver text-sm">{movie.year}</span>
            <span className="px-1.5 py-0.5 text-[11px] font-semibold border border-birgen-silver/40 text-birgen-silver rounded">
              {movie.maturity}
            </span>
            <span className="text-birgen-silver text-sm">{movie.duration}</span>
          </div>
          <div className="flex flex-wrap gap-2 mb-4">
            {movie.genres.map((g) => (
              <span key={g} className="text-xs px-2.5 py-1 rounded-full bg-birgen-red/10 border border-birgen-red/30 text-birgen-red font-medium">
                {g}
              </span>
            ))}
          </div>
          <p className="text-birgen-silver text-sm leading-relaxed mb-6">{movie.overview}</p>
          <button
            onClick={onPlay}
            className="flex items-center gap-2 px-7 py-3 bg-white hover:bg-white/90 text-black font-bold rounded-md transition-all hover:scale-105 active:scale-95"
          >
            <Play className="w-5 h-5 fill-black" />
            Play Trailer
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Format seconds to m:ss or h:mm:ss ─────────────────── */
function formatTime(s: number) {
  if (!isFinite(s) || s < 0) return '0:00';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

/* ── Fullscreen Video Player (Netflix-style) ──────────── */
function FullscreenPlayer({
  movies,
  startIndex,
  onClose,
  streamMode = false,
}: {
  movies: FeaturedMovie[];
  startIndex: number;
  onClose: () => void;
  /** When true, plays the full movie stream instead of the hero clip */
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
  const controlsTimer = useRef<NodeJS.Timeout>();
  const { getPosition, savePosition } = usePlaybackProgress();
  const movie = movies[currentIdx];

  // Determine video source: stream URL (full movie) or hero clip
  const streamUrl = movie.stream_url || getStreamUrl(movie.movieId) || getStreamMp4Url(movie.movieId);
  const videoSrc = streamMode && streamUrl ? streamUrl : movie.video;

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
      if (e.key === 'n' || e.key === 'N') goNext();
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
    // Restore saved position in stream mode
    if (streamMode) {
      const handleLoaded = () => {
        const saved = getPosition(movie.movieId);
        if (saved > 0) v.currentTime = saved;
      };
      v.addEventListener('loadedmetadata', handleLoaded);
      return () => v.removeEventListener('loadedmetadata', handleLoaded);
    }
  }, [currentIdx, streamMode, movie.movieId, getPosition]);

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

  const goNext = () => {
    setCurrentIdx((i) => (i + 1) % movies.length);
    resetControlsTimer();
  };

  const goPrev = () => {
    setCurrentIdx((i) => (i - 1 + movies.length) % movies.length);
    resetControlsTimer();
  };

  const onTimeUpdate = () => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    setProgress((v.currentTime / v.duration) * 100);
    setCurrentTime(v.currentTime);
    setDuration(v.duration);
    // Save progress for stream mode
    if (streamMode && Math.floor(v.currentTime) % 5 === 0) {
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

  return (
    <div
      className="fixed inset-0 z-[200] bg-black"
      onMouseMove={resetControlsTimer}
    >
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        autoPlay
        muted={muted}
        playsInline
        onTimeUpdate={onTimeUpdate}
        onEnded={goNext}
      >
        <source src={videoSrc} type={videoSrc.endsWith('.m3u8') ? 'application/x-mpegURL' : 'video/mp4'} />
      </video>

      {/* Controls overlay */}
      <div
        className={`absolute inset-0 flex flex-col justify-between transition-opacity duration-500 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Top: back button + title */}
        <div className="flex items-center gap-4 px-4 sm:px-8 pt-5 pb-10 bg-gradient-to-b from-black/80 via-black/30 to-transparent">
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full flex items-center justify-center text-white hover:bg-white/10 transition-colors"
            aria-label="Back"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div className="flex-1 min-w-0">
            <h3 className="text-white font-semibold text-base sm:text-lg truncate">{movie.title}</h3>
            {streamMode && (
              <span className="text-birgen-red text-xs font-medium flex items-center gap-1 mt-0.5">
                <Film className="w-3 h-3" /> Full Movie
              </span>
            )}
          </div>
        </div>

        {/* Center: tap to play/pause */}
        <button
          onClick={togglePlay}
          className="flex-1 cursor-pointer"
          aria-label={paused ? 'Play' : 'Pause'}
        />

        {/* Bottom: Netflix-style controls */}
        <div className="px-4 sm:px-8 pb-5 pt-10 bg-gradient-to-t from-black/90 via-black/50 to-transparent">
          {/* Progress bar */}
          <div className="group cursor-pointer mb-3" onClick={onProgressClick}>
            <div className="relative h-1 group-hover:h-1.5 bg-white/25 rounded-full transition-all overflow-hidden">
              {/* Buffered / loaded — simplified */}
              <div
                className="absolute inset-y-0 left-0 bg-birgen-red rounded-full transition-[width] duration-150"
                style={{ width: `${progress}%` }}
              />
              {/* Scrubber dot */}
              <div
                className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-birgen-red opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                style={{ left: `calc(${progress}% - 7px)` }}
              />
            </div>
          </div>

          {/* Time + controls row */}
          <div className="flex items-center gap-2 sm:gap-4">
            {/* Play / Pause */}
            <button onClick={togglePlay} className="text-white hover:text-white/80 transition-colors" aria-label={paused ? 'Play' : 'Pause'}>
              {paused ? <Play className="w-7 h-7 fill-white" /> : <Pause className="w-7 h-7" />}
            </button>

            {/* Skip back 15s */}
            <button onClick={() => skip(-15)} className="text-white hover:text-white/80 transition-colors" aria-label="Rewind 15s">
              <RotateCcw className="w-5 h-5" />
            </button>

            {/* Skip forward 15s */}
            <button onClick={() => skip(15)} className="text-white hover:text-white/80 transition-colors" aria-label="Forward 15s">
              <RotateCw className="w-5 h-5" />
            </button>

            {/* Volume */}
            <button onClick={toggleMute} className="text-white hover:text-white/80 transition-colors" aria-label={muted ? 'Unmute' : 'Mute'}>
              {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>

            {/* Time display */}
            <span className="text-white/70 text-xs sm:text-sm font-mono tabular-nums">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>

            <div className="flex-1" />

            {/* Prev */}
            <button onClick={goPrev} className="text-white hover:text-white/80 transition-colors" aria-label="Previous">
              <SkipBack className="w-5 h-5" />
            </button>

            {/* Next */}
            <button onClick={goNext} className="text-white hover:text-white/80 transition-colors" aria-label="Next">
              <SkipForward className="w-5 h-5" />
            </button>

            {/* Movie title in controls */}
            <span className="hidden sm:block text-white/50 text-xs truncate max-w-[160px]">
              {movie.title} ({movie.year})
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Main HeroBanner Component ────────────────────────── */
export default function HeroBanner() {
  const [activeIdx, setActiveIdx] = useState(0);
  const [showPlayer, setShowPlayer] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [playerStartIdx, setPlayerStartIdx] = useState(0);
  const [playerStreamMode, setPlayerStreamMode] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [muted, setMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const timerRef = useRef<NodeJS.Timeout>();
  const backdropTimerRef = useRef<NodeJS.Timeout>();

  const movie = FEATURED_MOVIES[activeIdx];

  // When backdrop changes, wait BACKDROP_DURATION then show video
  useEffect(() => {
    setVideoReady(false);
    clearTimeout(backdropTimerRef.current);
    backdropTimerRef.current = setTimeout(() => {
      setVideoReady(true);
    }, BACKDROP_DURATION);
    return () => clearTimeout(backdropTimerRef.current);
  }, [activeIdx]);

  // When videoReady and video element exists, try to play
  useEffect(() => {
    if (!videoReady || !videoRef.current) return;
    const v = videoRef.current;
    v.load();
    v.play().catch(() => {});
  }, [videoReady, activeIdx]);

  // When background video ends, advance to next movie
  const handleBgVideoEnded = () => {
    setActiveIdx((i) => (i + 1) % FEATURED_MOVIES.length);
  };

  const handlePlay = (idx?: number, stream?: boolean) => {
    setPlayerStartIdx(idx ?? activeIdx);
    setPlayerStreamMode(stream ?? false);
    setShowPlayer(true);
  };

  const handleClosePlayer = () => {
    setShowPlayer(false);
    setPlayerStreamMode(false);
  };

  const handleMoreInfo = () => setShowInfo(true);
  const handleCloseInfo = () => setShowInfo(false);

  const toggleMute = () => {
    setMuted((m) => !m);
    if (videoRef.current) videoRef.current.muted = !videoRef.current.muted;
  };

  return (
    <>
      <div className="relative w-full h-[85vh] min-h-[560px] flex items-end overflow-hidden">
        {/* ── Backdrop images — crossfade via opacity ── */}
        {FEATURED_MOVIES.map((m, i) => (
          <div
            key={m.title}
            className={`absolute inset-0 transition-opacity duration-1000 ${
              i === activeIdx ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <Image
              src={m.backdrop}
              alt={m.title}
              fill
              priority={i === 0}
              quality={90}
              className="object-cover object-top"
              sizes="100vw"
            />
          </div>
        ))}

        {/* ── Background video — fades in over the backdrop ── */}
        {videoReady && (
          <video
            ref={videoRef}
            key={`bg-${activeIdx}`}
            className="absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 opacity-100"
            autoPlay
            muted={muted}
            playsInline
            onEnded={handleBgVideoEnded}
            onError={() => setVideoReady(false)}
          >
            <source src={movie.video} type="video/mp4" />
          </video>
        )}

        {/* Gradient overlays */}
        <div className="absolute inset-0 bg-gradient-to-r from-birgen-black/90 via-birgen-black/40 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-birgen-black via-transparent to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-56 bg-gradient-to-t from-birgen-black to-transparent" />

        {/* ── Content ── */}
        <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
          <div className="max-w-xl" key={activeIdx}>
            {/* Tagline badge */}
            <div className="flex items-center gap-3 mb-4 animate-fade-in">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-birgen-red text-white text-xs font-bold uppercase tracking-wider shadow-lg shadow-birgen-red/30">
                TOP 5
              </span>
              <span className="text-white text-lg sm:text-xl font-semibold tracking-wide drop-shadow-lg">
                {movie.tagline}
              </span>
            </div>

            {/* Title */}
            <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl text-white tracking-wide leading-none drop-shadow-2xl mb-3 hero-title-enter">
              {movie.title}
            </h1>

            {/* Meta line */}
            <div className="flex items-center gap-3 mb-4 flex-wrap hero-meta-enter">
              <span className="text-green-400 font-semibold text-sm">
                {movie.rating} Rating
              </span>
              <span className="text-birgen-silver text-sm">{movie.year}</span>
              <span className="px-1.5 py-0.5 text-[11px] font-semibold border border-birgen-silver/40 text-birgen-silver rounded">
                {movie.maturity}
              </span>
              <span className="text-birgen-silver text-sm">{movie.duration}</span>
              <span className="text-white/40">·</span>
              {movie.genres.map((g, gi) => (
                <span key={g} className="text-sm text-birgen-silver">
                  {g}{gi < movie.genres.length - 1 ? <span className="ml-2 text-white/30">·</span> : ''}
                </span>
              ))}
            </div>

            {/* Overview */}
            <p className="text-birgen-silver text-sm sm:text-base leading-relaxed line-clamp-3 mb-6 max-w-lg hero-meta-enter">
              {movie.overview}
            </p>

            {/* CTA: Play + More Info (Netflix style) */}
            <div className="flex items-center gap-3 hero-meta-enter">
              <button
                onClick={() => handlePlay(undefined, hasStream(movie.movieId))}
                className="flex items-center gap-2 px-7 py-3 bg-white hover:bg-white/90 text-black font-bold rounded-md transition-all duration-200 hover:scale-[1.03] active:scale-95 text-base"
              >
                <Play className="w-6 h-6 fill-black" />
                Play
              </button>
              <button
                onClick={handleMoreInfo}
                className="flex items-center gap-2 px-7 py-3 bg-white/20 hover:bg-white/30 text-white font-semibold rounded-md border border-white/10 transition-all duration-200 hover:scale-[1.03] active:scale-95 backdrop-blur-sm text-base"
              >
                <Info className="w-5 h-5" />
                More Info
              </button>
            </div>
          </div>
        </div>

        {/* ── Speaker + Maturity (bottom-right, Netflix style) ── */}
        <div className="absolute bottom-16 right-6 z-20 flex items-center gap-2">
          <button
            onClick={toggleMute}
            className="w-10 h-10 rounded-full border border-white/40 bg-black/40 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/60 transition-colors"
            aria-label={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
          <span className="px-3 py-1 bg-birgen-black/60 border-l-2 border-white/40 text-white text-xs font-medium backdrop-blur-sm">
            {movie.maturity}
          </span>
        </div>
      </div>

      {/* ── Fullscreen Player ── */}
      {showPlayer && (
        <FullscreenPlayer
          movies={FEATURED_MOVIES}
          startIndex={playerStartIdx}
          onClose={handleClosePlayer}
          streamMode={playerStreamMode}
        />
      )}

      {/* ── More Info Modal ── */}
      {showInfo && (
        <MoreInfoModal
          movie={movie}
          onClose={handleCloseInfo}
          onPlay={() => { handleCloseInfo(); handlePlay(undefined, hasStream(movie.movieId)); }}
        />
      )}
    </>
  );
}
