'use client';
/**
 * BirgenAI VideoPlayer — the ONE Netflix-grade player used everywhere a full
 * movie plays (Hero, Top 5, Browse, Continue Watching, /watch). Every avenue
 * routes through this so the experience is identical.
 *
 *   ✓ Adaptive HLS via HLS.js (+ native HLS on Safari/iOS, MP4 fallback)
 *   ✓ Resume from last position, progress + screen-time accounting, paywall
 *   ✓ Center play/pause pulse that fades out
 *   ✓ 10s rewind / 10s forward (number inside the ring), hover-grow
 *   ✓ Volume flyout (hover the speaker → vertical slider)
 *   ✓ Title centered; right cluster: Next Movie · Audio&Subtitles · Speed · Fullscreen
 *   ✓ Next Movie recommends the next *playable* title (Top 5 order, wraps)
 *   ✓ Keybindings: Space, ←/→ (10s), M, F, N (next), Esc
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Check,
  Film,
  Captions,
  SkipForward,
  Gauge,
  Lock,
  Layers,
} from 'lucide-react';
import Hls, { type Level } from 'hls.js';
import Image from 'next/image';
import { isHlsUrl } from '@/lib/hls';
import type { SubtitleTrack } from '@/lib/subtitles';
import { useWatchSession, type PlaybackTarget } from '@/hooks/useWatchSession';
import { useScreenTime } from '@/hooks/useScreenTime';
import { useAuth } from '@/components/AuthProvider';
import { announceMediaPlay } from '@/lib/mediaBus';
import {
  AUDIO_TRACKS,
  SUPPORTED_SUBTITLE_LANGS,
  LOCKED_SUBTITLE_LANGS,
  PLAYBACK_SPEEDS,
} from '@/lib/playableMovies';

export interface NextUpMovie {
  title: string;
  year?: string | number;
  overview?: string;
  backdrop?: string | null;
  onPlay: () => void;
}

export interface VideoPlayerProps {
  src: string;
  fallbackMp4?: string | null;
  poster?: string | null;
  title: string;
  subtitle?: string;
  fullMovie?: boolean;
  target?: PlaybackTarget;
  subtitles?: SubtitleTrack[];
  onClose: () => void;
  onEnded?: () => void;
  /** The next recommended playable movie (renders the Next-Movie control). */
  nextUp?: NextUpMovie | null;
  enforceScreenTime?: boolean;
}

function formatTime(s: number): string {
  if (!isFinite(s) || s < 0) return '0:00';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function VideoPlayer({
  src,
  fallbackMp4,
  poster,
  title,
  subtitle,
  fullMovie,
  target,
  subtitles = [],
  onClose,
  onEnded,
  nextUp,
  enforceScreenTime = true,
}: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTimeRef = useRef<number>(0);

  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [pulse, setPulse] = useState<'play' | 'pause' | null>(null);

  // Right-cluster menus.
  const [nextOpen, setNextOpen] = useState(false);
  const [trackOpen, setTrackOpen] = useState(false);
  const [speedOpen, setSpeedOpen] = useState(false);
  const [qualityOpen, setQualityOpen] = useState(false);
  const [activeCC, setActiveCC] = useState<string>('off');
  const [rate, setRate] = useState(1);
  const [levels, setLevels] = useState<Level[]>([]);
  const [currentLevel, setCurrentLevel] = useState<number>(-1); // actually playing (ABR)
  const [qualityChoice, setQualityChoice] = useState<number>(-1); // -1 = Auto

  const [bufferedPercent, setBufferedPercent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [capBlock, setCapBlock] = useState(false);

  const { user } = useAuth();
  const screenTime = useScreenTime();

  const trackingTarget = useMemo<PlaybackTarget | null>(
    () => (fullMovie && target ? target : null),
    [fullMovie, target],
  );
  const watchSession = useWatchSession(trackingTarget ?? {});

  const hlsSrc = isHlsUrl(src) ? src : null;
  const directSrc = hlsSrc ? null : src;

  // ── hls.js bootstrap ──────────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    setLoading(true);

    if (hlsSrc) {
      if (Hls.isSupported()) {
        const hls = new Hls({
          capLevelToPlayerSize: true,
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
          backBufferLength: 30,
          startLevel: -1,
          abrEwmaDefaultEstimate: 500_000,
        });
        hls.loadSource(hlsSrc);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setLevels(hls.levels ?? []);
          setLoading(false);
          void video.play().catch(() => {});
        });
        hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => setCurrentLevel(data.level));
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                hls.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                hls.recoverMediaError();
                break;
              default:
                hls.destroy();
                if (fallbackMp4 && video) video.src = fallbackMp4;
                break;
            }
          }
        });
        hlsRef.current = hls;
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = hlsSrc;
        setLoading(false);
      } else if (fallbackMp4) {
        video.src = fallbackMp4;
        setLoading(false);
      }
    } else if (directSrc) {
      video.src = directSrc;
      setLoading(false);
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [hlsSrc, directSrc, fallbackMp4]);

  // ── restore resume position ───────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !trackingTarget) return;
    const onLoaded = async () => {
      const pos = await watchSession.getResumePosition();
      if (pos > 5 && pos < (video.duration || Infinity) - 30) {
        video.currentTime = pos;
      }
    };
    video.addEventListener('loadedmetadata', onLoaded);
    return () => video.removeEventListener('loadedmetadata', onLoaded);
  }, [trackingTarget, watchSession]);

  // ── auto-hide controls ────────────────────────────────────────────────────
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => setShowControls(false), 3500);
  }, []);

  useEffect(() => {
    resetControlsTimer();
    return () => {
      if (controlsTimer.current) clearTimeout(controlsTimer.current);
      if (pulseTimer.current) clearTimeout(pulseTimer.current);
    };
  }, [resetControlsTimer]);

  // ── center play/pause pulse ───────────────────────────────────────────────
  const flashPulse = useCallback((kind: 'play' | 'pause') => {
    setPulse(kind);
    if (pulseTimer.current) clearTimeout(pulseTimer.current);
    pulseTimer.current = setTimeout(() => setPulse(null), 2000);
  }, []);

  // ── controls ──────────────────────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => {});
      setPaused(false);
      flashPulse('play');
    } else {
      v.pause();
      setPaused(true);
      flashPulse('pause');
    }
    resetControlsTimer();
  }, [resetControlsTimer, flashPulse]);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
    resetControlsTimer();
  }, [resetControlsTimer]);

  const skip = useCallback(
    (seconds: number) => {
      const v = videoRef.current;
      if (!v) return;
      v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + seconds));
      resetControlsTimer();
    },
    [resetControlsTimer],
  );

  const setSpeed = useCallback((r: number) => {
    const v = videoRef.current;
    if (v) v.playbackRate = r;
    setRate(r);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const container = containerRef.current;
    const video = videoRef.current as
      | (HTMLVideoElement & { webkitEnterFullscreen?: () => void })
      | null;
    if (!document.fullscreenElement) {
      try {
        if (container?.requestFullscreen) await container.requestFullscreen();
        else if (video?.webkitEnterFullscreen) video.webkitEnterFullscreen();
      } catch {
        /* needs a user gesture in some browsers */
      }
    } else {
      await document.exitFullscreen().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (capBlock) return;
      if (e.key === 'Escape') onClose();
      else if (e.key === ' ') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowRight') skip(10);
      else if (e.key === 'ArrowLeft') skip(-10);
      else if (e.key === 'm' || e.key === 'M') toggleMute();
      else if (e.key === 'f' || e.key === 'F') void toggleFullscreen();
      else if ((e.key === 'n' || e.key === 'N') && nextUp) nextUp.onPlay();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [capBlock, onClose, togglePlay, skip, toggleMute, toggleFullscreen, nextUp]);

  // ── progress + screen-time accounting ────────────────────────────────────
  const onTimeUpdate = useCallback(() => {
    const v = videoRef.current;
    if (!v || !isFinite(v.duration)) return;
    const now = v.currentTime;
    const delta = now - lastTimeRef.current;
    const watchedDelta = delta > 0 && delta < 2 ? delta : 0;
    lastTimeRef.current = now;

    setCurrentTime(now);
    setDuration(v.duration);
    setProgress((now / v.duration) * 100);

    if (v.buffered && v.buffered.length > 0) {
      const end = v.buffered.end(v.buffered.length - 1);
      setBufferedPercent((end / v.duration) * 100);
    }

    if (trackingTarget) watchSession.tick(now, v.duration, watchedDelta);

    if (enforceScreenTime && user && !screenTime.isPremium && screenTime.isOverCap && fullMovie) {
      v.pause();
      setPaused(true);
      setCapBlock(true);
    }
  }, [trackingTarget, watchSession, enforceScreenTime, user, screenTime.isPremium, screenTime.isOverCap, fullMovie]);

  const onProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const v = videoRef.current;
      if (!v || !v.duration) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      v.currentTime = pct * v.duration;
      resetControlsTimer();
    },
    [resetControlsTimer],
  );

  const handleEnded = useCallback(() => {
    if (trackingTarget) void watchSession.flush();
    onEnded?.();
  }, [trackingTarget, watchSession, onEnded]);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current;
    const vol = Number(e.target.value);
    setVolume(vol);
    if (v) {
      v.volume = vol;
      if (vol === 0 && !v.muted) {
        v.muted = true;
        setMuted(true);
      } else if (vol > 0 && v.muted) {
        v.muted = false;
        setMuted(false);
      }
    }
  }, []);

  // ── subtitles ─────────────────────────────────────────────────────────────
  const applyCaption = useCallback((lang: string) => {
    const v = videoRef.current;
    if (!v) return;
    const tracks = v.textTracks;
    for (let i = 0; i < tracks.length; i++) {
      tracks[i].mode = lang !== 'off' && tracks[i].language === lang ? 'showing' : 'disabled';
    }
  }, []);

  const selectCaption = useCallback(
    (lang: string) => {
      setActiveCC(lang);
      applyCaption(lang);
      resetControlsTimer();
    },
    [applyCaption, resetControlsTimer],
  );

  useEffect(() => {
    applyCaption(activeCC);
  }, [applyCaption, activeCC, subtitles, src]);

  const availableSubLangs = useMemo(() => new Set(subtitles.map((t) => t.lang)), [subtitles]);

  // ── render ───────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[200] bg-black select-none"
      onMouseMove={resetControlsTimer}
      onTouchStart={resetControlsTimer}
    >
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        autoPlay
        playsInline
        poster={poster ?? undefined}
        onTimeUpdate={onTimeUpdate}
        onEnded={handleEnded}
        onPause={() => setPaused(true)}
        onPlay={() => {
          setPaused(false);
          announceMediaPlay();
        }}
        onWaiting={() => setLoading(true)}
        onCanPlay={() => setLoading(false)}
      >
        {subtitles.map((t) => (
          <track key={t.lang} kind="subtitles" srcLang={t.lang} label={t.label} src={t.src} />
        ))}
      </video>

      {/* Loading spinner */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-14 h-14 rounded-full border-[3px] border-white/20 border-t-birgen-red animate-spin" />
        </div>
      )}

      {/* Center play/pause pulse */}
      {pulse && !capBlock && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-24 h-24 rounded-full bg-black/55 backdrop-blur-sm flex items-center justify-center animate-fade-pulse">
            {pulse === 'pause' ? (
              <Pause className="w-12 h-12 text-white fill-white" />
            ) : (
              <Play className="w-12 h-12 text-white fill-white ml-1" />
            )}
          </div>
        </div>
      )}

      {/* Screen-time paywall */}
      {capBlock && (
        <ScreenTimePaywall totalSeconds={screenTime.totalSeconds} cap={screenTime.cap} onClose={onClose} />
      )}

      {/* Controls overlay */}
      <div
        className={`absolute inset-0 flex flex-col justify-between transition-opacity duration-500 ${
          showControls && !capBlock ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Top bar */}
        <div className="flex items-center gap-4 px-4 sm:px-8 pt-5 pb-10 bg-gradient-to-b from-black/80 via-black/30 to-transparent">
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full flex items-center justify-center text-white hover:bg-white/10 transition-colors"
            aria-label="Back"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div className="flex-1 min-w-0">
            <h3 className="text-white font-semibold text-base sm:text-lg truncate">{title}</h3>
            <p className="text-white/50 text-xs flex items-center gap-1.5 mt-0.5">
              {fullMovie && <Film className="w-3 h-3 text-birgen-red" />}
              {fullMovie ? 'Full Movie' : 'Trailer'}
              {subtitle && <span className="text-white/30">·</span>}
              {subtitle && <span>{subtitle}</span>}
            </p>
          </div>
        </div>

        {/* Center tap area — click toggles play, double-click toggles fullscreen */}
        <button
          onClick={togglePlay}
          onDoubleClick={() => void toggleFullscreen()}
          className="flex-1 cursor-pointer"
          aria-label={paused ? 'Play' : 'Pause'}
        />

        {/* Bottom bar */}
        <div className="px-4 sm:px-8 pb-5 pt-10 bg-gradient-to-t from-black/90 via-black/50 to-transparent">
          {/* Progress bar */}
          <div
            className="group cursor-pointer mb-3"
            onClick={onProgressClick}
            role="slider"
            tabIndex={0}
            aria-label="Seek"
            aria-valuenow={Math.round(progress)}
          >
            <div className="relative h-1 group-hover:h-1.5 bg-white/25 rounded-full transition-all overflow-hidden">
              <div className="absolute inset-y-0 left-0 bg-white/30 rounded-full" style={{ width: `${bufferedPercent}%` }} />
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
          <div className="flex items-center gap-4 sm:gap-6">
            {/* Play / Pause */}
            <button onClick={togglePlay} className="text-white transition-transform hover:scale-110" aria-label={paused ? 'Play' : 'Pause'}>
              {paused ? <Play className="w-14 h-14 fill-white" /> : <Pause className="w-14 h-14 fill-white" />}
            </button>

            {/* Rewind 10 */}
            <SkipButton seconds={10} dir="back" onClick={() => skip(-10)} />
            {/* Forward 10 */}
            <SkipButton seconds={10} dir="fwd" onClick={() => skip(10)} />

            {/* Volume with hover flyout */}
            <div className="relative group/vol flex items-center">
              <button onClick={toggleMute} className="text-white transition-transform hover:scale-110" aria-label={muted ? 'Unmute' : 'Mute'}>
                {muted || volume === 0 ? <VolumeX className="w-12 h-12" /> : <Volume2 className="w-12 h-12" />}
              </button>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 pb-3 hidden group-hover/vol:block">
                <div className="flex items-center justify-center h-28 w-10 rounded-full bg-black/80 border border-white/10 backdrop-blur">
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={muted ? 0 : volume}
                    onChange={handleVolumeChange}
                    className="w-24 accent-birgen-red -rotate-90"
                    aria-label="Volume"
                  />
                </div>
              </div>
            </div>

            {/* Time */}
            <span className="text-white/80 text-sm sm:text-base font-mono tabular-nums">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>

            {/* Centered title */}
            <div className="flex-1 hidden md:flex justify-center px-4 min-w-0">
              <span className="text-white text-xl sm:text-2xl font-bold truncate">{title}</span>
            </div>
            <div className="flex-1 md:hidden" />

            {/* Next Movie */}
            {nextUp && (
              <div
                className="relative"
                onMouseEnter={() => setNextOpen(true)}
                onMouseLeave={() => setNextOpen(false)}
              >
                <button onClick={() => nextUp.onPlay()} className="text-white transition-transform hover:scale-110" aria-label="Next movie">
                  <SkipForward className="w-12 h-12" />
                </button>
                {nextOpen && (
                  <div className="absolute right-0 bottom-full pb-8 w-[640px] max-w-[92vw]">
                   <div className="rounded-xl overflow-hidden border border-white/10 shadow-2xl bg-gradient-to-b from-neutral-800 to-neutral-900">
                    <div className="px-6 py-4 border-b border-white/10">
                      <h4 className="text-white font-bold text-2xl">Next Movie</h4>
                    </div>
                    <div className="flex gap-5 p-5">
                      <button
                        onClick={() => nextUp.onPlay()}
                        className="relative w-72 shrink-0 aspect-video rounded-lg overflow-hidden group/np"
                      >
                        {nextUp.backdrop && (
                          <Image src={nextUp.backdrop} alt={nextUp.title} fill className="object-cover" sizes="288px" />
                        )}
                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                          <span className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center transition-transform group-hover/np:scale-110">
                            <Play className="w-8 h-8 fill-black text-black ml-0.5" />
                          </span>
                        </div>
                      </button>
                      <div className="min-w-0">
                        <p className="text-white font-bold text-xl">
                          {nextUp.title}
                          {nextUp.year ? <span className="text-white/50 font-normal"> ({nextUp.year})</span> : null}
                        </p>
                        {nextUp.overview && (
                          <p className="text-white/70 text-sm mt-2 leading-relaxed line-clamp-4">{nextUp.overview}</p>
                        )}
                      </div>
                    </div>
                   </div>
                  </div>
                )}
              </div>
            )}

            {/* Quality */}
            {levels.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => {
                    setQualityOpen((s) => !s);
                    setTrackOpen(false);
                    setSpeedOpen(false);
                    setNextOpen(false);
                  }}
                  className={`transition-transform hover:scale-110 ${qualityChoice !== -1 ? 'text-birgen-red' : 'text-white'}`}
                  aria-label="Quality"
                  title="Quality"
                >
                  <Layers className="w-12 h-12" />
                </button>
                {qualityOpen && (
                  <div className="absolute right-0 bottom-full pb-3 w-[260px]">
                   <div className="rounded-lg overflow-hidden border border-white/10 shadow-2xl bg-gradient-to-b from-neutral-800 to-neutral-900">
                    <div className="px-4 py-3 text-white font-bold text-lg border-b border-white/10">Quality</div>
                    <button
                      onClick={() => {
                        if (hlsRef.current) hlsRef.current.currentLevel = -1;
                        setQualityChoice(-1);
                        setQualityOpen(false);
                      }}
                      className="flex items-center justify-between w-full px-4 py-2.5 text-sm text-white hover:bg-white/10"
                    >
                      <span>
                        Auto
                        {currentLevel !== -1 && levels[currentLevel]
                          ? ` (${levels[currentLevel].height}p)`
                          : ''}
                      </span>
                      {qualityChoice === -1 && <Check className="w-4 h-4 text-birgen-red" />}
                    </button>
                    {levels.map((lvl, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          if (hlsRef.current) hlsRef.current.currentLevel = i;
                          setQualityChoice(i);
                          setQualityOpen(false);
                        }}
                        className="flex items-center justify-between w-full px-4 py-2.5 text-sm text-white hover:bg-white/10"
                      >
                        <span>{lvl.height}p</span>
                        {qualityChoice === i && <Check className="w-4 h-4 text-birgen-red" />}
                      </button>
                    ))}
                   </div>
                  </div>
                )}
              </div>
            )}

            {/* Audio & Subtitles */}
            <div className="relative">
              <button
                onClick={() => {
                  setTrackOpen((s) => !s);
                  setSpeedOpen(false);
                  setNextOpen(false);
                  setQualityOpen(false);
                }}
                className={`transition-transform hover:scale-110 ${activeCC !== 'off' ? 'text-birgen-red' : 'text-white'}`}
                aria-label="Audio and subtitles"
                title="Audio and Subtitles"
              >
                <Captions className="w-12 h-12" />
              </button>
              {trackOpen && (
                <div className="absolute right-0 bottom-full mb-3 w-[480px] max-w-[90vw] rounded-lg overflow-hidden border border-white/10 shadow-2xl bg-gradient-to-b from-neutral-800 to-neutral-900">
                  <div className="grid grid-cols-2 max-h-[360px] overflow-y-auto">
                    {/* Audio */}
                    <div className="border-r border-white/10">
                      <div className="px-4 py-3 text-white font-bold text-lg sticky top-0 bg-neutral-800/95 backdrop-blur">Audio</div>
                      {AUDIO_TRACKS.map((a) => (
                        <button
                          key={a.code}
                          disabled={!a.enabled}
                          className={`flex items-center gap-2 w-full px-4 py-2.5 text-sm text-left ${
                            a.enabled ? 'text-white hover:bg-white/10' : 'text-white/35 cursor-not-allowed'
                          }`}
                          title={a.enabled ? undefined : 'Coming soon'}
                        >
                          {a.enabled ? <Check className="w-4 h-4 text-white" /> : <Lock className="w-3.5 h-3.5" />}
                          <span>{a.label}</span>
                        </button>
                      ))}
                    </div>
                    {/* Subtitles */}
                    <div>
                      <div className="px-4 py-3 text-white font-bold text-lg sticky top-0 bg-neutral-800/95 backdrop-blur">Subtitles</div>
                      <button
                        onClick={() => selectCaption('off')}
                        className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-left text-white hover:bg-white/10"
                      >
                        {activeCC === 'off' ? <Check className="w-4 h-4" /> : <span className="w-4" />}
                        <span>Off</span>
                      </button>
                      {SUPPORTED_SUBTITLE_LANGS.map((s) => {
                        const ready = availableSubLangs.has(s.code);
                        return (
                          <button
                            key={s.code}
                            onClick={() => (ready ? selectCaption(s.code) : undefined)}
                            disabled={!ready}
                            className={`flex items-center gap-2 w-full px-4 py-2.5 text-sm text-left ${
                              ready ? 'text-white hover:bg-white/10' : 'text-white/45 cursor-not-allowed'
                            }`}
                            title={ready ? undefined : 'Coming soon'}
                          >
                            {activeCC === s.code ? <Check className="w-4 h-4" /> : <span className="w-4" />}
                            <span>{s.label}</span>
                            {!ready && <span className="ml-auto text-[10px] uppercase tracking-wide text-white/30">soon</span>}
                          </button>
                        );
                      })}
                      <div className="my-1 border-t border-white/10" />
                      {LOCKED_SUBTITLE_LANGS.map((label) => (
                        <button
                          key={label}
                          disabled
                          className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-left text-white/35 cursor-not-allowed"
                          title="Coming soon"
                        >
                          <span className="w-4" />
                          <span>{label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Playback speed */}
            <div className="relative">
              <button
                onClick={() => {
                  setSpeedOpen((s) => !s);
                  setTrackOpen(false);
                  setNextOpen(false);
                  setQualityOpen(false);
                }}
                className={`transition-transform hover:scale-110 ${rate !== 1 ? 'text-birgen-red' : 'text-white'}`}
                aria-label="Playback speed"
                title="Playback speed"
              >
                <Gauge className="w-12 h-12" />
              </button>
              {speedOpen && (
                <div className="absolute right-0 bottom-full mb-3 w-[320px] rounded-lg overflow-hidden border border-white/10 shadow-2xl bg-gradient-to-b from-neutral-800 to-neutral-900 p-4">
                  <h4 className="text-white font-bold text-base mb-4">Playback Speed</h4>
                  <div className="relative flex items-center justify-between">
                    <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-px bg-white/25" />
                    {PLAYBACK_SPEEDS.map((sp) => (
                      <button
                        key={sp}
                        onClick={() => setSpeed(sp)}
                        className="relative flex flex-col items-center gap-2"
                      >
                        <span
                          className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${
                            rate === sp ? 'bg-white border-white ring-4 ring-white/30 scale-110' : 'bg-neutral-600 border-neutral-500'
                          }`}
                        />
                        <span className={`text-[11px] whitespace-nowrap ${rate === sp ? 'text-white font-bold' : 'text-white/55'}`}>
                          {sp === 1 ? '1x (Normal)' : `${sp}x`}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Fullscreen */}
            <button
              onClick={toggleFullscreen}
              className="text-white transition-transform hover:scale-110"
              aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {fullscreen ? <Minimize className="w-12 h-12" /> : <Maximize className="w-12 h-12" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Circular rewind/forward button with the seconds rendered inside the ring. */
function SkipButton({
  seconds,
  dir,
  onClick,
}: {
  seconds: number;
  dir: 'back' | 'fwd';
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="relative text-white transition-transform hover:scale-110"
      aria-label={dir === 'back' ? `Rewind ${seconds} seconds` : `Forward ${seconds} seconds`}
    >
      {/* circular arrow drawn with an SVG so the number sits cleanly inside */}
      <svg viewBox="0 0 24 24" className="w-14 h-14" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        {dir === 'back' ? (
          <>
            <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
            <path d="M3 4v4h4" />
          </>
        ) : (
          <>
            <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
            <path d="M21 4v4h-4" />
          </>
        )}
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[15px] font-bold mt-[5px]">{seconds}</span>
    </button>
  );
}

function ScreenTimePaywall({
  totalSeconds,
  cap,
  onClose,
}: {
  totalSeconds: number;
  cap: number;
  onClose: () => void;
}) {
  const hours = Math.round(totalSeconds / 3600);
  const capHours = Math.round(cap / 3600);
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="max-w-md mx-4 p-8 rounded-2xl bg-birgen-dark border border-birgen-border shadow-2xl text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-birgen-red/10 border border-birgen-red/20 mb-5">
          <Film className="w-6 h-6 text-birgen-red" />
        </div>
        <h3 className="font-display text-3xl text-white tracking-wide mb-2">You&apos;ve hit your free limit</h3>
        <p className="text-birgen-silver text-sm leading-relaxed mb-6">
          You&apos;ve watched <span className="text-white font-semibold">{hours} h</span> this month on your free plan.
          Upgrade to Premium for unlimited viewing, no ads, and early access to new Kenyan releases.
        </p>
        <div className="flex flex-col gap-2">
          <a
            href="/upgrade"
            className="w-full py-3 bg-birgen-red hover:bg-birgen-red-light text-white font-semibold rounded-md transition-all hover:scale-[1.02] active:scale-95"
          >
            Go Premium — unlimited watching
          </a>
          <button onClick={onClose} className="w-full py-2.5 text-birgen-muted hover:text-white text-sm transition-colors">
            Not now
          </button>
        </div>
        <p className="text-[11px] text-birgen-muted mt-5">Free tier · {capHours} h / month · Resets on the 1st</p>
      </div>
    </div>
  );
}
