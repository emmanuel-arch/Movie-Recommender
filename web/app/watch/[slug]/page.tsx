'use client';
/**
 * /watch/<slug>
 *
 * Dedicated fullscreen watch page. Loads the movie metadata from Supabase
 * (if the slug is in `kenyan_movies`), then streams the R2-hosted HLS master
 * via the shared VideoPlayer.
 *
 * Flow:
 *   1. Lookup slug → Supabase row OR hard-coded fallback (launch-5).
 *   2. If user is not signed-in AND there's a paywall, show AuthModal first.
 *   3. Otherwise open the player. Closing navigates back to the home page.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import VideoPlayer from '@/components/VideoPlayer';
import AuthModal from '@/components/AuthModal';
import { getNextPlayable } from '@/lib/playableMovies';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import { getKenyanHlsUrl, getKenyanPosterUrl, KENYAN_HLS_MAP } from '@/lib/hls';
import { getSubtitleTracksForSlug } from '@/lib/subtitles';
import type { KenyanMovie } from '@/lib/supabase/types';

const LAUNCH_FALLBACK: Record<string, Partial<KenyanMovie>> = {
  'get-out': { title: 'Get Out', year: 2017, duration_minutes: 104, maturity: 'R' },
  'sicario': { title: 'Sicario', year: 2015, duration_minutes: 121, maturity: 'R' },
  'inception': { title: 'Inception', year: 2010, duration_minutes: 148, maturity: 'PG-13' },
  'the-dark-knight': { title: 'The Dark Knight', year: 2008, duration_minutes: 152, maturity: 'PG-13' },
  'shutter-island': { title: 'Shutter Island', year: 2010, duration_minutes: 138, maturity: 'R' },
};

export default function WatchPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const supabase = getSupabaseClient();

  const [movie, setMovie] = useState<Partial<KenyanMovie> | null>(null);
  const [loading, setLoading] = useState(true);
  const [authGate, setAuthGate] = useState(false);
  const [guestAllowed, setGuestAllowed] = useState(false);

  useEffect(() => {
    let active = true;
    async function run() {
      // Remote catalogue first.
      if (supabase) {
        const { data } = await supabase
          .from('kenyan_movies')
          .select('*')
          .eq('slug', slug)
          .maybeSingle();
        if (active && data) {
          setMovie(data as KenyanMovie);
          setLoading(false);
          return;
        }
      }
      // Fallback to the launch-5 mapping.
      if (active) {
        const fb = LAUNCH_FALLBACK[slug];
        setMovie(fb ? { slug, ...fb } : { slug });
        setLoading(false);
      }
    }
    void run();
    return () => {
      active = false;
    };
  }, [slug, supabase]);

  // If auth isn't ready yet, show a splash while we decide.
  useEffect(() => {
    if (authLoading) return;
    if (!user && !guestAllowed) {
      setAuthGate(true);
    }
  }, [authLoading, user, guestAllowed]);

  // Some kenyan_movies rows still hold an unsubstituted "<R2_PUBLIC_HOST>"
  // placeholder — treat any such URL as missing and fall back to the
  // R2 path computed from NEXT_PUBLIC_R2_PUBLIC_URL + NEXT_PUBLIC_HLS_ROOT.
  const usable = (u?: string | null) => (u && !u.includes('<') ? u : null);

  const src = useMemo(() => {
    // For the launch-5 (slugs we have an HLS mapping for), the computed R2 path
    // is authoritative: several kenyan_movies rows were seeded with a stale
    // folder ("/Videos/<slug>/" instead of "/Videos/films/<slug>/"), which 404s.
    // For any other slug, trust the DB value first.
    const computed = getKenyanHlsUrl(slug);
    const isLaunchTitle = Object.values(KENYAN_HLS_MAP).includes(slug);
    if (isLaunchTitle && computed) return computed;
    return usable(movie?.hls_master_url) ?? computed ?? '';
  }, [movie, slug]);

  const poster =
    usable(movie?.backdrop_url) ||
    usable(movie?.thumbnail_url) ||
    getKenyanPosterUrl(slug) ||
    undefined;

  const subtitles = useMemo(() => getSubtitleTracksForSlug(slug), [slug]);

  if (loading || authLoading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="w-12 h-12 rounded-full border-[3px] border-white/20 border-t-birgen-red animate-spin" />
      </div>
    );
  }

  if (!src) {
    return (
      <div className="fixed inset-0 bg-black text-white flex flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="font-display text-3xl tracking-wide">This title isn&apos;t available yet</h1>
        <p className="text-birgen-silver text-sm max-w-md">
          We couldn&apos;t find a stream for <span className="text-white">{slug}</span>. It may still be uploading.
        </p>
        <button
          onClick={() => router.push('/')}
          className="px-5 py-2.5 bg-birgen-red hover:bg-birgen-red-light rounded-md font-semibold"
        >
          Back to home
        </button>
      </div>
    );
  }

  // Subtitle string for the player header.
  const subtitleBits: string[] = [];
  if (movie?.year) subtitleBits.push(String(movie.year));
  if (movie?.maturity) subtitleBits.push(movie.maturity);
  if (movie?.duration_minutes) {
    const h = Math.floor(movie.duration_minutes / 60);
    const m = movie.duration_minutes % 60;
    subtitleBits.push(h > 0 ? `${h}h ${m}m` : `${m}m`);
  }

  const canPlay = !!user || guestAllowed;
  const title = movie?.title ?? prettify(slug);
  // MovieLens ID fallback for legacy listeners that key on numeric IDs.
  const legacyId = Object.entries(KENYAN_HLS_MAP).find(([, s]) => s === slug)?.[0];

  return (
    <>
      {canPlay && (() => {
        const next = getNextPlayable(slug);
        const goNext = next ? () => router.push(`/watch/${next.slug}`) : undefined;
        return (
          <VideoPlayer
            src={src}
            poster={poster || undefined}
            title={title}
            subtitle={subtitleBits.join(' · ')}
            subtitles={subtitles}
            fullMovie
            target={{ movieSlug: slug, movieId: legacyId ? Number(legacyId) : null }}
            onClose={() => router.push('/')}
            onEnded={() => (goNext ? goNext() : router.push('/'))}
            nextUp={
              next
                ? {
                    title: next.title,
                    year: next.year,
                    overview: next.overview,
                    backdrop: next.backdrop,
                    onPlay: goNext!,
                  }
                : null
            }
          />
        );
      })()}

      {authGate && !user && (
        <AuthModal
          title={`You're 1 click away from watching ${title}`}
          subtitle="Sign up to resume across devices and unlock My List"
          onClose={() => router.push('/')}
          onContinueGuest={() => {
            setGuestAllowed(true);
            setAuthGate(false);
          }}
        />
      )}
    </>
  );
}

function prettify(slug: string): string {
  return slug
    .split('-')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}
