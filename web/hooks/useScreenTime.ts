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
 *   - isPremium        : profile.plan === 'premium'
 *   - notifications    : pending (unseen) notifications
 *   - dismissNotification(id) : mark seen in DB
 */

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import type { Notification } from '@/lib/supabase/types';

const DEFAULT_CAP = Number(process.env.NEXT_PUBLIC_FREE_TIER_CAP_SECONDS ?? 72_000);
const DEFAULT_WARN = Number(process.env.NEXT_PUBLIC_WARN_THRESHOLD_SECONDS ?? 57_600);

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
  const { user, profile } = useAuth();

  const [totalSeconds, setTotalSeconds] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const isPremium = profile?.plan === 'premium';
  const cap = DEFAULT_CAP;
  const warn = DEFAULT_WARN;

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
    isOverCap: !isPremium && totalSeconds >= cap,
    isWarning: !isPremium && totalSeconds >= warn && totalSeconds < cap,
    isPremium,
    notifications,
    dismissNotification,
    refresh: load,
  };
}
