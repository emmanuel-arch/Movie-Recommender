'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  Play,
  Plus,
  Check,
  Star,
  X,
  ArrowLeft,
  Volume2,
} from 'lucide-react';
import Navbar from '@/components/Navbar';
import AuthModal from '@/components/AuthModal';
import MovieCarousel from '@/components/MovieCarousel';
import {
  getCatalogEntryBySlug,
  catalogBackdropPath,
  catalogLogoPath,
  catalogTrailerPath,
  similarCatalogEntries,
  toMovie,
} from '@/lib/catalog';
import { useAuth } from '@/components/AuthProvider';
import { useRatings } from '@/hooks/useRatings';
import { useMyList } from '@/hooks/useMyList';
import toast from 'react-hot-toast';

export default function MovieDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { ratings, rateMovie, count } = useRatings();
  const { myList, addToList, removeFromList } = useMyList();
  const myListIds = new Set(myList.map((m) => m.movieId));

  const entry = useMemo(() => (typeof slug === 'string' ? getCatalogEntryBySlug(slug) : undefined), [slug]);
  const movie = entry ? toMovie(entry) : null;
  const similar = useMemo(() => (entry ? similarCatalogEntries(entry, 6).map(toMovie) : []), [entry]);

  const [trailerOpen, setTrailerOpen] = useState(false);
  const [authGate, setAuthGate] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!trailerOpen || !videoRef.current) return;
    const v = videoRef.current;
    v.muted = false;
    void v.play().catch(() => {});
  }, [trailerOpen]);

  if (!entry || !movie) {
    return (
      <div className="min-h-screen bg-birgen-black text-white flex flex-col items-center justify-center gap-4 p-8">
        <p className="text-birgen-muted text-center">This title is not in the BirgenAI catalogue yet.</p>
        <Link href="/" className="text-birgen-red font-semibold hover:underline">
          Back home
        </Link>
      </div>
    );
  }

  const backdrop = catalogBackdropPath(entry);
  const logo = catalogLogoPath(entry);
  const rated = ratings.get(movie.movieId);
  const inList = myListIds.has(movie.movieId);
  const runtime = `${Math.floor(entry.runtimeMinutes / 60)}h ${entry.runtimeMinutes % 60}m`;

  const handleRate = (r: number) => {
    rateMovie(movie, r);
    toast.success(`Rated "${entry.displayTitle}" ${r}/5`);
  };

  const onPlay = () => {
    if (!entry.playable) {
      toast.success('Full HD stream is staging for this title.');
      return;
    }
    if (!user) {
      setAuthGate(true);
      return;
    }
    router.push(`/watch/${entry.slug}`);
  };

  return (
    <div className="min-h-screen bg-birgen-black">
      <Navbar ratingCount={count} />

      <section className="relative min-h-[85vh] w-full">
        <div className="absolute inset-0">
          <Image
            src={backdrop}
            alt=""
            fill
            priority
            className="object-cover"
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black via-black/85 to-black/40" />
          <div className="absolute inset-0 bg-gradient-to-t from-birgen-black via-black/50 to-transparent" />
        </div>

        <div className="relative z-10 pt-28 pb-16 px-4 sm:px-8 lg:px-14 max-w-[1400px] mx-auto flex flex-col justify-end min-h-[85vh]">
          <button
            type="button"
            onClick={() => router.back()}
            className="absolute top-24 left-4 sm:left-8 flex items-center gap-2 text-white/80 hover:text-white text-sm"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>

          <div className="mt-auto max-w-3xl">
            <div className="relative mb-6 min-h-[4rem] sm:min-h-[6rem]">
              {entry.playable || entry.media?.poster ? (
                <div className="relative h-16 sm:h-24 md:h-28 w-[min(100%,420px)]">
                  <Image
                    src={logo}
                    alt={entry.displayTitle}
                    fill
                    className="object-contain object-left-bottom drop-shadow-2xl"
                    sizes="420px"
                  />
                </div>
              ) : (
                <h1 className="font-display text-3xl sm:text-5xl text-white tracking-wide drop-shadow-lg">
                  {entry.displayTitle}
                </h1>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 text-sm mb-5">
              {entry.tmdbVoteAverage > 0 ? (
                <span className="text-green-400 font-bold">{entry.tmdbVoteAverage.toFixed(1)}</span>
              ) : (
                <span className="text-white/40 text-xs font-semibold uppercase tracking-wider">TMDB TBA</span>
              )}
              <span className="text-white/70">{entry.year}</span>
              <span className="px-2 py-0.5 border border-white/30 rounded text-xs text-white/80">{entry.maturity}</span>
              <span className="text-white/70">{runtime}</span>
              <div className="flex flex-wrap gap-2">
                {entry.genres.slice(0, 4).map((g) => (
                  <span key={g} className="text-[11px] uppercase tracking-wide text-white/50">
                    {g}
                  </span>
                ))}
              </div>
            </div>

            <p className="text-white/85 text-base leading-relaxed max-w-2xl line-clamp-4 mb-8">{entry.overview}</p>

            <div className="flex flex-wrap gap-3 mb-8">
              <button
                type="button"
                onClick={onPlay}
                className="inline-flex items-center gap-2 px-8 py-3 rounded-md bg-white text-black font-bold hover:bg-white/90 transition-transform hover:scale-[1.02]"
              >
                <Play className="w-5 h-5 fill-black" />
                {entry.playable ? 'Play' : 'Coming soon'}
              </button>
              <button
                type="button"
                onClick={() => setTrailerOpen(true)}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-md bg-white/10 text-white font-semibold border border-white/20 hover:bg-white/15"
              >
                <Volume2 className="w-4 h-4" />
                Watch trailer
              </button>
              <button
                type="button"
                onClick={() => (inList ? removeFromList(movie.movieId) : addToList(movie))}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-md bg-white/10 text-white font-semibold border border-white/20 hover:bg-white/15"
              >
                {inList ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                {inList ? 'In my list' : 'My list'}
              </button>
              {entry.comingSoon && (
                <button
                  type="button"
                  onClick={() => toast.success('Added to launch announcements — wire this to your email capture.')}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-md bg-birgen-red text-white font-semibold hover:bg-birgen-red-light"
                >
                  Notify me
                </button>
              )}
            </div>

            <div className="rounded-xl border border-white/10 bg-black/35 backdrop-blur-md p-5 max-w-lg">
              <p className="text-white/90 text-sm font-medium mb-3">Rate this film</p>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleRate(s)}
                    className="transition-transform hover:scale-110"
                    aria-label={`${s} stars`}
                  >
                    <Star
                      className="w-9 h-9"
                      fill={rated != null && s <= rated ? '#E50914' : 'none'}
                      color={rated != null && s <= rated ? '#E50914' : '#666'}
                      strokeWidth={1.5}
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 sm:px-8 lg:px-14 max-w-[1600px] mx-auto pb-6 border-t border-white/5 pt-10">
        <h2 className="text-lg font-bold text-white mb-4">About the film</h2>
        <p className="text-birgen-muted max-w-3xl leading-relaxed mb-6">{entry.overview}</p>
        <div className="grid sm:grid-cols-2 gap-6 max-w-3xl text-sm">
          <div>
            <p className="text-birgen-muted uppercase text-xs tracking-wider mb-2">Director</p>
            <p className="text-white">{entry.director}</p>
          </div>
          <div>
            <p className="text-birgen-muted uppercase text-xs tracking-wider mb-2">Cast</p>
            <p className="text-white">{entry.cast.join(', ')}</p>
          </div>
        </div>

        {entry.kenyanOriginal && entry.filmmakerProfileSlug && (
          <div className="mt-10 p-6 rounded-xl bg-birgen-card border border-birgen-border max-w-3xl">
            <h3 className="text-white font-semibold mb-2">Meet the filmmaker</h3>
            <p className="text-birgen-muted text-sm mb-4">
              BirgenAI is building creator profiles for Kenyan originals — codifying the voices behind the catalogue.
            </p>
            <span className="text-birgen-red text-sm font-medium cursor-not-allowed opacity-80">
              Profile: {entry.filmmakerProfileSlug.replace(/-/g, ' ')} (launching)
            </span>
          </div>
        )}
      </section>

      {similar.length > 0 && (
        <MovieCarousel
          title="You might also like"
          subtitle="Picks that share DNA with what you are exploring"
          movies={similar}
          userRatings={ratings}
          onRate={(m, r) => rateMovie(m, r)}
          showRating
          myListIds={myListIds}
          onAddToList={addToList}
          onRemoveFromList={removeFromList}
        />
      )}

      {authGate && (
        <AuthModal
          title="Watch across devices"
          subtitle={`Sign in to play ${entry.displayTitle} on your phone, tablet, and TV.`}
          onClose={() => setAuthGate(false)}
          onContinueGuest={() => {
            setAuthGate(false);
            router.push(`/watch/${entry.slug}`);
          }}
        />
      )}

      {trailerOpen && (
        <div
          className="fixed inset-0 z-[400] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setTrailerOpen(false)}
          role="presentation"
        >
          <div
            className="relative w-full max-w-5xl aspect-video bg-black rounded-lg overflow-hidden border border-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="absolute top-3 right-3 z-10 w-10 h-10 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-black"
              onClick={() => setTrailerOpen(false)}
              aria-label="Close trailer"
            >
              <X className="w-5 h-5" />
            </button>
            <video ref={videoRef} className="w-full h-full" controls playsInline src={catalogTrailerPath(entry)} poster={backdrop}>
              <track kind="captions" />
            </video>
          </div>
        </div>
      )}
    </div>
  );
}
