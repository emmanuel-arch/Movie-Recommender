'use client';
/**
 * "Continue Watching for {profile}" — rendered first on the home page.
 *
 * Sources data from `useContinueWatching` (Supabase view for signed-in users,
 * localStorage for guests). Artwork is resolved through the catalog so rows always
 * show real art (cinematic card art for playable titles, backdrop otherwise). Netflix-
 * style: the tile shows only the red progress bar — no title or remaining-time label —
 * and the row scrolls with the same hover arrows + 2-up/3-up/5-up sizing as every other row.
 */

import { useRef, useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Play, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useContinueWatching, type ContinueWatchingItem } from '@/hooks/useWatchSession';
import { useAuth } from '@/components/AuthProvider';
import { useCardArt } from '@/hooks/useCardArt';
import { KENYAN_HLS_MAP } from '@/lib/hls';
import {
  getCatalogEntryBySlug,
  catalogBackdropPath,
  catalogPosterPath,
  catalogCardPath,
} from '@/lib/catalog';

interface Props {
  onResume?: (item: ContinueWatchingItem) => void;
}

export default function ContinueWatchingRow({ onResume }: Props) {
  const { items, loading } = useContinueWatching();
  const { activeWatchingProfile } = useAuth();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkScroll();
    el.addEventListener('scroll', checkScroll, { passive: true });
    window.addEventListener('resize', checkScroll);
    return () => {
      el.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
    };
  }, [checkScroll, items]);

  const scroll = (dir: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const amount = scrollRef.current.clientWidth;
    scrollRef.current.scrollBy({ left: dir === 'right' ? amount : -amount, behavior: 'smooth' });
  };

  if (loading) return null;
  if (items.length === 0) return null;

  const who = activeWatchingProfile?.name?.trim();

  return (
    <section className="relative py-4 group/carousel">
      <div className="flex items-end justify-between mb-3 px-4 sm:px-6 lg:px-8">
        <h2 className="text-lg sm:text-xl font-bold text-white">
          {who ? `Continue Watching for ${who}` : 'Continue Watching'}
        </h2>
        <span className="text-xs text-birgen-muted">Picks up where you left off</span>
      </div>

      {/* Red accent line — matches every other row */}
      <div className="h-px bg-gradient-to-r from-birgen-red via-birgen-red/30 to-transparent mx-4 sm:mx-6 lg:mx-8 mb-4" />

      <div className="relative">
        {/* Left edge-hover arrow */}
        {canScrollLeft && (
          <button
            onClick={() => scroll('left')}
            className="absolute left-0 top-0 bottom-0 w-12 z-30 flex items-center justify-center bg-gradient-to-r from-black/80 to-transparent opacity-0 group-hover/carousel:opacity-100 transition-opacity duration-300 cursor-pointer"
            aria-label="Scroll left"
          >
            <ChevronLeft className="w-8 h-8 text-white drop-shadow-lg" />
          </button>
        )}

        {/* Right edge-hover arrow */}
        {canScrollRight && (
          <button
            onClick={() => scroll('right')}
            className="absolute right-0 top-0 bottom-0 w-12 z-30 flex items-center justify-center bg-gradient-to-l from-black/80 to-transparent opacity-0 group-hover/carousel:opacity-100 transition-opacity duration-300 cursor-pointer"
            aria-label="Scroll right"
          >
            <ChevronRight className="w-8 h-8 text-white drop-shadow-lg" />
          </button>
        )}

        <div
          ref={scrollRef}
          className="flex gap-3 overflow-x-auto scrollbar-hide px-4 sm:px-6 lg:px-8 scroll-smooth"
          style={{ scrollbarWidth: 'none' }}
        >
          {items.slice(0, 12).map((item) => (
            <ContinueCard key={cardKey(item)} item={item} onResume={onResume} />
          ))}
        </div>
      </div>
    </section>
  );
}

function cardKey(item: ContinueWatchingItem): string {
  return item.movieSlug ? `slug:${item.movieSlug}` : `id:${item.movieId}`;
}

/** Resolve slug → catalog entry → title + (card art | backdrop). */
function resolveCard(item: ContinueWatchingItem) {
  const slug =
    item.movieSlug ?? (item.movieId != null ? KENYAN_HLS_MAP[item.movieId] ?? null : null);
  const entry = slug ? getCatalogEntryBySlug(slug) : undefined;

  const title =
    entry?.displayTitle ??
    item.title ??
    (slug ? prettify(slug) : item.movieId != null ? `Movie ${item.movieId}` : 'Untitled');

  // Playable titles get cinematic card art; others use the backdrop.
  const cardUrl = entry?.playable ? catalogCardPath(entry) : null;
  const backdropUrl =
    (entry ? catalogBackdropPath(entry) : null) ||
    item.backdrop ||
    (entry ? catalogPosterPath(entry) : null) ||
    null;

  return { slug, title, cardUrl, backdropUrl };
}

function ContinueCard({
  item,
  onResume,
}: {
  item: ContinueWatchingItem;
  onResume?: (item: ContinueWatchingItem) => void;
}) {
  const { slug, title, cardUrl, backdropUrl } = resolveCard(item);
  const { src, onError } = useCardArt(cardUrl, backdropUrl);

  const Inner = (
    <div className="relative group cursor-pointer">
      <div className="relative aspect-video rounded-lg overflow-hidden bg-birgen-card border border-birgen-border">
        {src ? (
          <Image
            src={src}
            alt={title}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 20vw"
            onError={onError}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-birgen-muted">
            <Play className="w-10 h-10" />
          </div>
        )}

        {/* Progress bar — the only persistent overlay (Netflix style) */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/15">
          <div
            className="h-full bg-birgen-red transition-[width] duration-300"
            style={{ width: `${Math.max(2, Math.min(100, item.percent))}%` }}
          />
        </div>

        {/* Play overlay on hover */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-md bg-white text-black font-bold shadow-xl scale-90 group-hover:scale-100 transition-transform">
            <Play className="w-5 h-5 fill-black" />
            Resume
          </div>
        </div>

        {/* Remove from row (hover) — placeholder; wire up when server delete lands */}
        <button
          className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 border border-white/10 flex items-center justify-center text-white/70 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          aria-label="Remove"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );

  const widthClass =
    'shrink-0 w-[calc((100%-0.75rem)/2)] sm:w-[calc((100%-1.5rem)/3)] md:w-[calc((100%-3rem)/5)]';

  if (onResume) {
    return (
      <button onClick={() => onResume(item)} className={`text-left ${widthClass}`}>
        {Inner}
      </button>
    );
  }
  if (slug) {
    return (
      <Link href={`/watch/${slug}`} className={widthClass}>
        {Inner}
      </Link>
    );
  }
  return <div className={widthClass}>{Inner}</div>;
}

function prettify(slug: string): string {
  return slug
    .split('-')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}
