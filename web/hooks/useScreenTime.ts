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
import { getSupabaseClient } from '@/lib/supabase/client';
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

function currentMonthISO(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

export function useScreenTime(): ScreenTimeState {
  const { user, profile } = useAuth();
  const supabase = getSupabaseClient();

  const [totalSeconds, setTotalSeconds] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const isPremium = profile?.plan === 'premium';
  const cap = DEFAULT_CAP;
  const warn = DEFAULT_WARN;

  const load = useCallback(async () => {
    if (!user || !supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);

    const month = currentMonthISO();
    const [{ data: usage }, { data: notif }] = await Promise.all([
      supabase
        .from('monthly_usage')
        .select('total_seconds')
        .eq('user_id', user.id)
        .eq('month', month)
        .maybeSingle(),
      supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .is('seen_at', null)
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    setTotalSeconds((usage?.total_seconds as number | undefined) ?? 0);
    setNotifications((notif as Notification[] | null) ?? []);
    setLoading(false);
  }, [user, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const dismissNotification = useCallback(
    async (id: string) => {
      if (!supabase) return;
      await supabase
        .from('notifications')
        .update({ seen_at: new Date().toISOString() })
        .eq('id', id);
      setNotifications((xs) => xs.filter((n) => n.id !== id));
    },
    [supabase],
  );

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
