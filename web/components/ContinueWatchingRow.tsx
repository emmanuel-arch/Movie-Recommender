'use client';
/**
 * "Continue Watching for {profile}" — rendered first on the home page.
 *
 * Sources data from `useContinueWatching` (Supabase view for signed-in users,
 * localStorage for guests). Title + artwork are resolved through the catalog so
 * rows always show the real movie name and a backdrop (rather than a raw
 * "Movie <id>" with no art). Cards are landscape (16:9) like Netflix.
 */

import Image from 'next/image';
import Link from 'next/link';
import { Play, RotateCcw, X } from 'lucide-react';
import { useContinueWatching, type ContinueWatchingItem } from '@/hooks/useWatchSession';
import { useAuth } from '@/components/AuthProvider';
import { KENYAN_HLS_MAP } from '@/lib/hls';
import { getCatalogEntryBySlug, catalogBackdropPath, catalogPosterPath } from '@/lib/catalog';

interface Props {
  onResume?: (item: ContinueWatchingItem) => void;
}

export default function ContinueWatchingRow({ onResume }: Props) {
  const { items, loading } = useContinueWatching();
  const { activeWatchingProfile } = useAuth();

  if (loading) return null;
  if (items.length === 0) return null;

  const who = activeWatchingProfile?.name?.trim();

  return (
    <section className="pt-6 pb-4">
      <div className="flex items-center justify-between mb-3 px-4 sm:px-6 lg:px-12">
        <h2 className="font-display text-2xl sm:text-3xl text-white tracking-wide">
          {who ? `Continue Watching for ${who}` : 'Continue Watching'}
        </h2>
        <span className="text-xs text-birgen-muted">Picks up where you left off</span>
      </div>

      <div
        className="flex gap-4 overflow-x-auto px-4 sm:px-6 lg:px-12 pb-3 scroll-smooth"
        style={{ scrollbarWidth: 'none' }}
      >
        {items.slice(0, 12).map((item) => (
          <ContinueCard key={cardKey(item)} item={item} onResume={onResume} />
        ))}
      </div>
    </section>
  );
}

function cardKey(item: ContinueWatchingItem): string {
  return item.movieSlug ? `slug:${item.movieSlug}` : `id:${item.movieId}`;
}

/** Resolve slug → catalog entry → real title + landscape backdrop. */
function resolveCard(item: ContinueWatchingItem) {
  const slug =
    item.movieSlug ?? (item.movieId != null ? KENYAN_HLS_MAP[item.movieId] ?? null : null);
  const entry = slug ? getCatalogEntryBySlug(slug) : undefined;

  const title =
    entry?.displayTitle ??
    item.title ??
    (slug ? prettify(slug) : item.movieId != null ? `Movie ${item.movieId}` : 'Untitled');

  const imageUrl =
    (entry ? catalogBackdropPath(entry) : null) ||
    item.backdrop ||
    (entry ? catalogPosterPath(entry) : null) ||
    null;

  return { slug, title, imageUrl };
}

function ContinueCard({
  item,
  onResume,
}: {
  item: ContinueWatchingItem;
  onResume?: (item: ContinueWatchingItem) => void;
}) {
  const { slug, title, imageUrl } = resolveCard(item);
  const remaining = Math.max(0, Math.round((item.duration - item.position) / 60));

  const Inner = (
    <div className="relative group cursor-pointer">
      <div className="relative w-[260px] sm:w-[300px] aspect-video rounded-lg overflow-hidden bg-birgen-card border border-birgen-border shrink-0">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={title}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            sizes="300px"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-birgen-muted">
            <Play className="w-10 h-10" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent" />

        {/* Title overlaid bottom-left (Netflix style) */}
        <div className="absolute bottom-2.5 left-3 right-3">
          <p className="text-white text-sm font-semibold drop-shadow-lg line-clamp-1">{title}</p>
          <p className="text-[11px] text-white/70 flex items-center gap-1 mt-0.5">
            <RotateCcw className="w-3 h-3" />
            {remaining > 0 ? `${remaining} min left` : 'Ready to resume'}
          </p>
        </div>

        {/* Progress bar */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/15">
          <div
            className="h-full bg-birgen-red transition-[width] duration-300"
            style={{ width: `${Math.max(2, Math.min(100, item.percent))}%` }}
          />
        </div>

        {/* Play overlay */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-md bg-white text-black font-bold shadow-xl scale-90 group-hover:scale-100 transition-transform">
            <Play className="w-5 h-5 fill-black" />
            Resume
          </div>
        </div>

        {/* Close (remove from row) — placeholder; wire up when you add server delete */}
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

  if (onResume) {
    return (
      <button onClick={() => onResume(item)} className="text-left shrink-0">
        {Inner}
      </button>
    );
  }
  if (slug) {
    return (
      <Link href={`/watch/${slug}`} className="shrink-0">
        {Inner}
      </Link>
    );
  }
  return <div className="shrink-0">{Inner}</div>;
}

function prettify(slug: string): string {
  return slug
    .split('-')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}
