'use client';
/**
 * Reads the signed-in user's monthly screen-time rollup + any pending
 * notifications the cron Worker queued. Returns:
 *
 *   - totalSeconds     : how much they've watched this calendar month
 *   - cap              : hard free-tier cap (seconds) — from NEXT_PUBLIC_*
 *   - warn             : warn threshold
 *   - percent          : totalSeconds / cap
 *   - isOverCap        : boolean
 *   - isPremium        : authoritative entitlement (shared User row), via useEntitlement
 *   - notifications    : pending (unseen) notifications
 *   - dismissNotification(id) : mark seen in DB
 *
 * The cap is only enforced once entitlement has resolved to "not premium" — while
 * it is still loading, or if the read errored, we treat the user as un-gated so an
 * infra hiccup (or the first render) never flashes a paywall at a paying customer.
 */

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { useEntitlement } from '@/hooks/useEntitlement';
import type { Notification } from '@/lib/supabase/types';

// Free tier: 3 hours of watch time per calendar month (~2 feature films), warn at
// ~80% (2h24m). Override per-env with NEXT_PUBLIC_FREE_TIER_CAP_SECONDS /
// NEXT_PUBLIC_WARN_THRESHOLD_SECONDS so the funnel can be A/B-tuned without a deploy.
const DEFAULT_CAP = Number(process.env.NEXT_PUBLIC_FREE_TIER_CAP_SECONDS ?? 10_800);
const DEFAULT_WARN = Number(process.env.NEXT_PUBLIC_WARN_THRESHOLD_SECONDS ?? 8_640);

export interface ScreenTimeState {
  loading: boolean;
  totalSeconds: number;
  cap: number;
  warn: number;
  percent: number;
  isOverCap: boolean;
  isWarning: boolean;
  isPremium: boolean;
  notifications: Notification[];
  dismissNotification: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useScreenTime(): ScreenTimeState {
  const { user } = useAuth();
  const { isPremium, loading: entLoading, error: entError } = useEntitlement();

  const [totalSeconds, setTotalSeconds] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const cap = DEFAULT_CAP;
  const warn = DEFAULT_WARN;
  // Only gate once we KNOW the user is not premium. Unknown (loading) or a failed
  // entitlement read => don't enforce, so we never wrongly paywall a payer.
  const enforce = !isPremium && !entLoading && !entError;

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/screen-time');
      if (res.ok) {
        const json = await res.json();
        setTotalSeconds((json.totalSeconds as number) ?? 0);
        setNotifications((json.notifications as Notification[]) ?? []);
      }
    } catch {
      // leave defaults
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const dismissNotification = useCallback(async (id: string) => {
    await fetch('/api/screen-time', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dismissId: id }),
    }).catch(() => {});
    setNotifications((xs) => xs.filter((n) => n.id !== id));
  }, []);

  const percent = cap > 0 ? Math.min(100, (totalSeconds / cap) * 100) : 0;

  return {
    loading,
    totalSeconds,
    cap,
    warn,
    percent,
    isOverCap: enforce && totalSeconds >= cap,
    isWarning: enforce && totalSeconds >= warn && totalSeconds < cap,
    isPremium,
    notifications,
    dismissNotification,
    refresh: load,
  };
}
