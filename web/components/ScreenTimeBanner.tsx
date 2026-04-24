'use client';
/**
 * Top-of-page banner surfaced when:
 *   - The nightly cron queued a notification for this user, OR
 *   - The user has crossed the screen-time warn threshold in real time.
 *
 * Renders as a dismissible strip above the hero. Uses the same styling
 * language as the rest of the Netflix-style shell.
 */

import Link from 'next/link';
import { AlertCircle, Sparkles, X } from 'lucide-react';
import { useScreenTime } from '@/hooks/useScreenTime';
import type { Notification } from '@/lib/supabase/types';

export default function ScreenTimeBanner() {
  const { loading, notifications, dismissNotification, isWarning, isOverCap, isPremium, totalSeconds, cap } =
    useScreenTime();

  if (loading || isPremium) return null;

  // Prefer the freshest server notification if present.
  const server: Notification | undefined = notifications[0];

  // Otherwise synthesise a client-side banner from real-time counters.
  if (!server && !isWarning && !isOverCap) return null;

  const hours = Math.round(totalSeconds / 3600);
  const capHours = Math.round(cap / 3600);

  const banner = server
    ? {
        id: server.id,
        tone: server.type === 'screen_time_limit' ? 'danger' : 'warn',
        title: server.title,
        message: server.message,
        cta: server.cta_label || 'Upgrade',
        ctaUrl: server.cta_url || '/upgrade',
        serverId: server.id,
      }
    : {
        id: isOverCap ? 'client-cap' : 'client-warn',
        tone: isOverCap ? 'danger' : 'warn',
        title: isOverCap ? "You've hit your free-tier limit" : 'Approaching your free-tier limit',
        message: `You've watched ${hours} h / ${capHours} h this month.`,
        cta: 'Go Premium',
        ctaUrl: '/upgrade',
        serverId: undefined as string | undefined,
      };

  const toneClass =
    banner.tone === 'danger'
      ? 'from-birgen-red/30 to-birgen-red/5 border-birgen-red/40'
      : 'from-yellow-500/20 to-yellow-500/5 border-yellow-500/30';

  return (
    <div
      className={`w-full border-b bg-gradient-to-r ${toneClass} backdrop-blur-sm animate-fade-in`}
    >
      <div className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-12 py-2.5 flex items-center gap-3">
        <AlertCircle
          className={`w-4 h-4 flex-shrink-0 ${
            banner.tone === 'danger' ? 'text-birgen-red' : 'text-yellow-400'
          }`}
        />
        <div className="flex-1 min-w-0 flex items-baseline gap-2 flex-wrap">
          <p className="text-white text-sm font-semibold">{banner.title}</p>
          <p className="text-birgen-silver text-xs">{banner.message}</p>
        </div>
        <Link
          href={banner.ctaUrl}
          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-birgen-red hover:bg-birgen-red-light text-white text-xs font-semibold rounded transition-all hover:scale-[1.03] active:scale-95 flex-shrink-0"
        >
          <Sparkles className="w-3 h-3" />
          {banner.cta}
        </Link>
        {banner.serverId && (
          <button
            onClick={() => dismissNotification(banner.serverId!)}
            className="text-birgen-muted hover:text-white p-1 transition-colors flex-shrink-0"
            aria-label="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
