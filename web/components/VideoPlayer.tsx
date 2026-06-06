'use client';
/**
 * BirgenAI VideoPlayer — Netflix-grade HLS + MP4 fullscreen player.
 *
 *   ✓ Adaptive bitrate via HLS.js (ABR: auto-quality based on bandwidth)
 *   ✓ Native HLS on Safari/iOS (CanPlayType check)
 *   ✓ Falls back cleanly to MP4 source
 *   ✓ Resume from last saved position (Supabase for signed-in, LS for guests)
 *   ✓ Persists progress every ~10 s (debounced)
 *   ✓ Accumulates actual-watched-seconds for screen-time billing
 *   ✓ Screen-time paywall: stops playback once the user crosses the free cap
 *   ✓ Netflix keybindings: Space (play/pause), ←/→ (seek 15s), M (mute), F (fullscreen), Esc (close)
 *   ✓ Level selector (Auto / 1080p / 720p / 480p / 360p) when HLS is loaded
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Settings,
  Check,
  Film,
  Captions,
} from 'lucide-react';
import Hls, { type Level } from 'hls.js';
import { isHlsUrl } from '@/lib/hls';
import type { SubtitleTrack } from '@/lib/subtitles';
import { useWatchSession, type PlaybackTarget } from '@/hooks/useWatchSession';
import { useScreenTime } from '@/hooks/useScreenTime';
import { useAuth } from '@/components/AuthProvider';
import { announceMediaPlay } from '@/lib/mediaBus';

export interface VideoPlayerProps {
  /** Master HLS playlist URL (preferred) or direct MP4 URL. */
  src: string;
  /** MP4 fallback for browsers without HLS support. */
  fallbackMp4?: string | null;
  /** Poster frame (JPG/PNG). */
  poster?: string | null;
  /** Display title in the top bar. */
  title: string;
  /** Release year / maturity / runtime — optional. */
  subtitle?: string;
  /** If true, shows a "Full Movie" badge and enables progress tracking. */
  fullMovie?: boolean;
  /** Playback target for watch-session tracking (mutually exclusive: slug OR id). */
  target?: PlaybackTarget;
  /** WebVTT subtitle tracks (English / Kiswahili / French). */
  subtitles?: SubtitleTrack[];
  /** Called when the user closes the player (Esc / back button). */
  onClose: () => void;
  /** Called when playback finishes. */
  onEnded?: () => void;
  /** Prev / Next navigation — renders the standard Netflix prev/next buttons. */
  onPrev?: () => void;
  onNext?: () => void;
  /** Show the screen-time paywall on cap? Default: true for signed-in free users. */
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
  onPrev,
  onNext,
  enforceScreenTime = true,
}: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTimeRef = useRef<number>(0);

  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ccOpen, setCcOpen] = useState(false);
  const [activeCC, setActiveCC] = useState<string>('off'); // 'off' | lang code
  const [levels, setLevels] = useState<Level[]>([]);
  const [currentLevel, setCurrentLevel] = useState<number>(-1);
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

    // Clean up any prior instance.
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
          // Conservative startup so users on 3G don't buffer-stall at 1080p.
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
        hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => {
          setCurrentLevel(data.level);
        });
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
                // Try direct fallback MP4 if present.
                if (fallbackMp4 && video) video.src = fallbackMp4;
                break;
            }
          }
        });
        hlsRef.current = hls;
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Native HLS (Safari / iOS).
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
    };
  }, [resetControlsTimer]);

  // ── key bindings ─────────────────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => {});
      setPaused(false);
    } else {
      v.pause();
      setPaused(true);
    }
    resetControlsTimer();
  }, [resetControlsTimer]);

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

  const toggleFullscreen = useCallback(async () => {
    const container = containerRef.current;
    const video = videoRef.current as
      | (HTMLVideoElement & { webkitEnterFullscreen?: () => void })
      | null;
    if (!document.fullscreenElement) {
      try {
        // Fullscreen the whole player container so our custom controls stay on
        // top. requestFullscreen() escapes the hub iframe (the iframe grants
        // allow="fullscreen"), so the BirgenAI header disappears too — true
        // Netflix-style. iOS Safari can't fullscreen a div, so fall back to the
        // native video element fullscreen.
        if (container?.requestFullscreen) await container.requestFullscreen();
        else if (video?.webkitEnterFullscreen) video.webkitEnterFullscreen();
      } catch {
        /* user gesture required in some browsers */
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
      } else if (e.key === 'ArrowRight') skip(15);
      else if (e.key === 'ArrowLeft') skip(-15);
      else if (e.key === 'm' || e.key === 'M') toggleMute();
      else if (e.key === 'f' || e.key === 'F') void toggleFullscreen();
      else if ((e.key === 'n' || e.key === 'N') && onNext) onNext();
      else if ((e.key === 'p' || e.key === 'P') && onPrev) onPrev();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [capBlock, onClose, togglePlay, skip, toggleMute, toggleFullscreen, onNext, onPrev]);

  // ── progress + screen-time accounting ────────────────────────────────────
  const onTimeUpdate = useCallback(() => {
    const v = videoRef.current;
    if (!v || !isFinite(v.duration)) return;

    // Real progress (ignore scrubs): only count forward deltas <2s as watched time.
    const now = v.currentTime;
    const delta = now - lastTimeRef.current;
    const watchedDelta = delta > 0 && delta < 2 ? delta : 0;
    lastTimeRef.current = now;

    setCurrentTime(now);
    setDuration(v.duration);
    setProgress((now / v.duration) * 100);

    // Buffered progress for the translucent ahead-bar.
    if (v.buffered && v.buffered.length > 0) {
      const end = v.buffered.end(v.buffered.length - 1);
      setBufferedPercent((end / v.duration) * 100);
    }

    // Stream progress to the watch session (throttled in the hook).
    if (trackingTarget) {
      watchSession.tick(now, v.duration, watchedDelta);
    }

    // Screen-time paywall. Only enforce for signed-in free users; premium &
    // guests are unaffected here (guests get pre-roll ads handled elsewhere).
    if (
      enforceScreenTime &&
      user &&
      !screenTime.isPremium &&
      screenTime.isOverCap &&
      fullMovie
    ) {
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

  // ── subtitles (WebVTT side-loaded tracks) ─────────────────────────────────
  // Apply the chosen caption track imperatively: the browser exposes the
  // sideloaded <track>s as video.textTracks; we flip exactly one to 'showing'.
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
      setCcOpen(false);
      resetControlsTimer();
    },
    [applyCaption, resetControlsTimer],
  );

  // Re-assert the active track once the <track> elements have loaded (and when
  // the source changes), since the browser resets modes on load.
  useEffect(() => {
    applyCaption(activeCC);
  }, [applyCaption, activeCC, subtitles, src]);

  // ── render ───────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[200] bg-black"
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
          <track
            key={t.lang}
            kind="subtitles"
            srcLang={t.lang}
            label={t.label}
            src={t.src}
          />
        ))}
      </video>

      {/* Loading spinner */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-14 h-14 rounded-full border-[3px] border-white/20 border-t-birgen-red animate-spin" />
        </div>
      )}

      {/* Screen-time paywall */}
      {capBlock && (
        <ScreenTimePaywall
          totalSeconds={screenTime.totalSeconds}
          cap={screenTime.cap}
          onClose={onClose}
        />
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

        {/* Center tap area — single tap toggles play, double tap toggles
            fullscreen (the two single-tap play toggles cancel out). */}
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
              <div
                className="absolute inset-y-0 left-0 bg-white/30 rounded-full"
                style={{ width: `${bufferedPercent}%` }}
              />
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

          {/* Row */}
          <div className="flex items-center gap-2 sm:gap-4">
            <button onClick={togglePlay} className="text-white hover:text-white/80">
              {paused ? <Play className="w-7 h-7 fill-white" /> : <Pause className="w-7 h-7" />}
            </button>
            <button onClick={() => skip(-15)} className="text-white hover:text-white/80" aria-label="Back 15s">
              <RotateCcw className="w-5 h-5" />
            </button>
            <button onClick={() => skip(15)} className="text-white hover:text-white/80" aria-label="Forward 15s">
              <RotateCw className="w-5 h-5" />
            </button>
            <button onClick={toggleMute} className="text-white hover:text-white/80" aria-label={muted ? 'Unmute' : 'Mute'}>
              {muted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={handleVolumeChange}
              className="hidden sm:block w-24 accent-birgen-red"
              aria-label="Volume"
            />
            <span className="text-white/70 text-xs sm:text-sm font-mono tabular-nums">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>

            <div className="flex-1" />

            {onPrev && (
              <button onClick={onPrev} className="text-white hover:text-white/80" aria-label="Previous">
                <SkipBack className="w-5 h-5" />
              </button>
            )}
            {onNext && (
              <button onClick={onNext} className="text-white hover:text-white/80" aria-label="Next">
                <SkipForward className="w-5 h-5" />
              </button>
            )}

            {subtitles.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => { setCcOpen((s) => !s); setSettingsOpen(false); }}
                  className={`transition-colors ${activeCC !== 'off' ? 'text-birgen-red' : 'text-white hover:text-white/80'}`}
                  aria-label="Subtitles"
                  title="Subtitles"
                >
                  <Captions className="w-5 h-5" />
                </button>
                {ccOpen && (
                  <div className="absolute right-0 bottom-full mb-2 min-w-[180px] rounded-md bg-black/90 border border-white/15 backdrop-blur-sm overflow-hidden shadow-2xl">
                    <div className="px-3 py-2 text-[11px] uppercase tracking-wider text-white/40 border-b border-white/10">
                      Subtitles
                    </div>
                    <button
                      onClick={() => selectCaption('off')}
                      className="flex items-center justify-between w-full px-3 py-2 text-sm text-white hover:bg-white/10"
                    >
                      <span>Off</span>
                      {activeCC === 'off' && <Check className="w-4 h-4 text-birgen-red" />}
                    </button>
                    {subtitles.map((t) => (
                      <button
                        key={t.lang}
                        onClick={() => selectCaption(t.lang)}
                        className="flex items-center justify-between w-full px-3 py-2 text-sm text-white hover:bg-white/10"
                      >
                        <span>{t.label}</span>
                        {activeCC === t.lang && <Check className="w-4 h-4 text-birgen-red" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {levels.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => { setSettingsOpen((s) => !s); setCcOpen(false); }}
                  className="text-white hover:text-white/80"
                  aria-label="Quality"
                >
                  <Settings className="w-5 h-5" />
                </button>
                {settingsOpen && (
                  <div className="absolute right-0 bottom-full mb-2 min-w-[180px] rounded-md bg-black/90 border border-white/15 backdrop-blur-sm overflow-hidden shadow-2xl">
                    <div className="px-3 py-2 text-[11px] uppercase tracking-wider text-white/40 border-b border-white/10">
                      Quality
                    </div>
                    <button
                      onClick={() => {
                        if (hlsRef.current) hlsRef.current.currentLevel = -1;
                        setSettingsOpen(false);
                      }}
                      className="flex items-center justify-between w-full px-3 py-2 text-sm text-white hover:bg-white/10"
                    >
                      <span>Auto</span>
                      {currentLevel === -1 && <Check className="w-4 h-4 text-birgen-red" />}
                    </button>
                    {levels.map((lvl, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          if (hlsRef.current) hlsRef.current.currentLevel = i;
                          setSettingsOpen(false);
                        }}
                        className="flex items-center justify-between w-full px-3 py-2 text-sm text-white hover:bg-white/10"
                      >
                        <span>{lvl.height}p</span>
                        {currentLevel === i && <Check className="w-4 h-4 text-birgen-red" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button
              onClick={toggleFullscreen}
              className="text-white hover:text-white/80"
              aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {fullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
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
          <button
            onClick={onClose}
            className="w-full py-2.5 text-birgen-muted hover:text-white text-sm transition-colors"
          >
            Not now
          </button>
        </div>
        <p className="text-[11px] text-birgen-muted mt-5">
          Free tier · {capHours} h / month · Resets on the 1st
        </p>
      </div>
    </div>
  );
}
