'use client';
import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Play, Info, VolumeX, Volume2 } from 'lucide-react';

/* ────────────────────────────────────────────────────────
   Featured movie config — swap this when you want a new hero
   ──────────────────────────────────────────────────────── */
const FEATURED = {
  title: 'Interstellar',
  year: '2014',
  rating: '8.7',
  maturity: 'PG-13',
  duration: '2h 49m',
  overview:
    "When Earth becomes uninhabitable in the future, a farmer and ex-NASA pilot is tasked with piloting a spacecraft along with a team of researchers to find a new planet for humans.",
  genres: ['Sci-Fi', 'Drama', 'Adventure'],
  // Place your hero image at  web/public/Images/hero-interstellar.webp  (3840×2160 or 1920×1080)
  backdrop: '/Images/hero-interstellar.webp',
  // Place a 15-30s trailer clip at  web/public/Videos/hero-interstellar.mp4
  video: '/Videos/hero-interstellar.mp4',
  tmdbId: 157336,
};

export default function HeroBanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [showVideo, setShowVideo] = useState(false);
  const [videoError, setVideoError] = useState(false);

  /* Auto-play the video clip after a short delay so the image shows first */
  useEffect(() => {
    const timer = setTimeout(() => setShowVideo(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  const toggleMute = () => {
    setMuted((m) => !m);
    if (videoRef.current) videoRef.current.muted = !videoRef.current.muted;
  };

  return (
    <div className="relative w-full h-[85vh] min-h-[560px] flex items-end overflow-hidden">
      {/* ── Background video / image ────────────────────────── */}
      {/* Static hero image — always rendered so there's no flash */}
      <Image
        src={FEATURED.backdrop}
        alt={FEATURED.title}
        fill
        priority
        quality={90}
        className="object-cover object-top"
        sizes="100vw"
      />

      {/* Video layer — fades in on top of the image */}
      {showVideo && !videoError && (
        <video
          ref={videoRef}
          src={FEATURED.video}
          autoPlay
          muted={muted}
          loop
          playsInline
          onError={() => setVideoError(true)}
          className="absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 opacity-100"
        />
      )}

      {/* Gradient overlays (Netflix-style) */}
      <div className="absolute inset-0 bg-gradient-to-r from-birgen-black/90 via-birgen-black/50 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-birgen-black via-birgen-black/20 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-birgen-black to-transparent" />

      {/* ── Content ─────────────────────────────────────────── */}
      <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <div className="max-w-xl animate-slide-up">
          {/* Title */}
          <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl text-white tracking-wide leading-none drop-shadow-2xl mb-3">
            {FEATURED.title}
          </h1>

          {/* Meta line */}
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <span className="text-green-400 font-semibold text-sm">
              {FEATURED.rating} Rating
            </span>
            <span className="text-birgen-silver text-sm">{FEATURED.year}</span>
            <span className="px-1.5 py-0.5 text-[11px] font-semibold border border-birgen-silver/40 text-birgen-silver rounded">
              {FEATURED.maturity}
            </span>
            <span className="text-birgen-silver text-sm">{FEATURED.duration}</span>
            {FEATURED.genres.map((g) => (
              <span
                key={g}
                className="text-xs text-birgen-silver/80 border border-birgen-border px-2 py-0.5 rounded"
              >
                {g}
              </span>
            ))}
          </div>

          {/* Overview */}
          <p className="text-birgen-silver text-sm sm:text-base leading-relaxed line-clamp-3 mb-6 max-w-lg">
            {FEATURED.overview}
          </p>

          {/* CTA buttons */}
          <div className="flex items-center gap-3 flex-wrap">
            <Link
              href="/onboarding"
              className="flex items-center gap-2 px-7 py-3 bg-white hover:bg-white/90 text-black font-bold rounded-md transition-all duration-200 hover:scale-105 active:scale-95 text-base"
            >
              <Play className="w-6 h-6 fill-black" />
              Start Rating
            </Link>
            <Link
              href="/browse"
              className="flex items-center gap-2 px-7 py-3 bg-white/20 hover:bg-white/30 text-white font-semibold rounded-md border border-white/10 transition-all duration-200 hover:scale-105 active:scale-95 backdrop-blur-sm text-base"
            >
              <Info className="w-5 h-5" />
              Browse Movies
            </Link>
          </div>
        </div>
      </div>

      {/* ── Mute / Unmute button (bottom-right, Netflix-style) ── */}
      <button
        onClick={toggleMute}
        className="absolute bottom-24 right-6 z-20 w-10 h-10 rounded-full border border-white/40 bg-black/40 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/60 transition-colors"
        aria-label={muted ? 'Unmute' : 'Mute'}
      >
        {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
      </button>

      {/* Maturity badge (bottom-right, Netflix-style) */}
      <div className="absolute bottom-24 right-20 z-20 flex items-center gap-2">
        <span className="px-3 py-1 bg-birgen-black/60 border-l-2 border-white/40 text-white text-xs font-medium backdrop-blur-sm">
          {FEATURED.maturity}
        </span>
      </div>
    </div>
  );
}
