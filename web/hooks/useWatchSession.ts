'use client';
/**
 * Unified playback-progress sink.
 *
 * - When signed in: upserts to Supabase `watch_sessions` every ~10 s.
 * - When guest:     writes to localStorage (same key the old
 *                   `usePlaybackProgress` hook used, so we don't lose
 *                   existing users' resume points).
 *
 * Resuming works in both modes — the hook exposes `getResumePosition(id)`
 * which returns the most recent of (Supabase row, LS record).
 *
 * Screen time accounting: the hook also accumulates a `watched_seconds`
 * counter that increments ~1s per real playback second (ignores scrubs),
 * which feeds the monthly rollup.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';

const LS_KEY = 'birgenai_playback';
const SAVE_DEBOUNCE_MS = 10_000;

interface LocalRecord {
  position: number;
  duration: number;
  watchedSeconds: number;
  updatedAt: number;
}

type LocalMap = Record<string, LocalRecord>;

function readLocal(): LocalMap {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function writeLocal(map: LocalMap) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(map));
  } catch {
    /* quota */
  }
}

export interface PlaybackTarget {
  movieId?: number | null;
  movieSlug?: string | null;
}

function targetKey(t: PlaybackTarget): string {
  if (t.movieSlug) return `slug:${t.movieSlug}`;
  if (t.movieId != null) return `id:${t.movieId}`;
  return '';
}

export interface WatchSessionController {
  /** Call on every `timeupdate` — throttled internally. */
  tick: (position: number, duration: number, deltaWatched: number) => void;
  /** Manually force a save right now (e.g. on pause / beforeunload). */
  flush: () => Promise<void>;
  /** Preload the last known position so you can seek on loadedmetadata. */
  getResumePosition: () => Promise<number>;
}

export function useWatchSession(target: PlaybackTarget): WatchSessionController {
  const { user } = useAuth();
  const key = targetKey(target);

  const pending = useRef<LocalRecord | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<number>(0);

  const persist = useCallback(async () => {
    const rec = pending.current;
    if (!rec || !key) return;
    pending.current = null;

    // Always keep LS in sync for fast resume + guest fallback.
    const map = readLocal();
    map[key] = rec;
    writeLocal(map);

    if (user) {
      await fetch('/api/watch-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          movieId: target.movieId ?? null,
          movieSlug: target.movieSlug ?? null,
          positionSeconds: rec.position,
          durationSeconds: rec.duration || null,
          watchedSeconds: rec.watchedSeconds,
        }),
      }).catch(() => {});
    }

    lastSavedRef.current = Date.now();
  }, [user, target.movieId, target.movieSlug, key]);

  const tick = useCallback<WatchSessionController['tick']>(
    (position, duration, deltaWatched) => {
      if (!key) return;
      const prev = pending.current ?? {
        position: 0,
        duration: 0,
        watchedSeconds: 0,
        updatedAt: 0,
      };
      pending.current = {
        position,
        duration: duration || prev.duration,
        watchedSeconds: prev.watchedSeconds + Math.max(0, deltaWatched),
        updatedAt: Date.now(),
      };
      if (saveTimer.current) return; // already scheduled
      saveTimer.current = setTimeout(() => {
        saveTimer.current = null;
        void persist();
      }, SAVE_DEBOUNCE_MS);
    },
    [persist, key],
  );

  const flush = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    await persist();
  }, [persist]);

  const getResumePosition = useCallback(async () => {
    if (!key) return 0;

    // Start with LS (always available, fast).
    const localRec = readLocal()[key];
    let local = localRec?.position ?? 0;
    // If user was in the last 30s, restart from 0.
    if (localRec && localRec.duration > 0 && localRec.duration - localRec.position < 30) {
      local = 0;
    }

    if (!user) return local;

    try {
      const params = target.movieSlug
        ? `movieSlug=${encodeURIComponent(target.movieSlug)}`
        : `movieId=${target.movieId ?? -1}`;
      const res = await fetch(`/api/watch-session?${params}`);
      if (!res.ok) return local;
      const { row } = await res.json();
      if (!row) return local;

      const remote = row.position_seconds ?? 0;
      const remoteDur = row.duration_seconds ?? 0;
      const remoteAdj = remoteDur > 0 && remoteDur - remote < 30 ? 0 : remote;

      // Prefer whichever record is newer.
      const remoteUpdated = new Date(row.updated_at).getTime();
      const localUpdated = localRec?.updatedAt ?? 0;
      return remoteUpdated >= localUpdated ? remoteAdj : local;
    } catch {
      return local;
    }
  }, [user, target.movieId, target.movieSlug, key]);

  // Flush on unmount + page unload.
  useEffect(() => {
    const onUnload = () => {
      void persist();
    };
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      void persist();
    };
  }, [persist]);

  return { tick, flush, getResumePosition };
}

// ── read-only helpers for "Continue Watching" ────────────────────────────────
export interface ContinueWatchingItem {
  movieId: number | null;
  movieSlug: string | null;
  position: number;
  duration: number;
  percent: number;
  updatedAt: number;
  // Optional Kenyan catalogue fields (present when row joined server-side).
  title?: string;
  backdrop?: string | null;
  hlsMasterUrl?: string | null;
}

export function readLocalContinueWatching(): ContinueWatchingItem[] {
  const map = readLocal();
  return Object.entries(map)
    .map(([key, rec]) => {
      const isSlug = key.startsWith('slug:');
      const ident = key.slice(isSlug ? 5 : 3);
      const percent = rec.duration > 0 ? (rec.position / rec.duration) * 100 : 0;
      return {
        movieId: isSlug ? null : Number(ident),
        movieSlug: isSlug ? ident : null,
        position: rec.position,
        duration: rec.duration,
        percent,
        updatedAt: rec.updatedAt,
      } as ContinueWatchingItem;
    })
    .filter((r) => r.percent > 1.5 && r.percent < 95 && r.position > 30)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function useContinueWatching(): {
  items: ContinueWatchingItem[];
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const { user } = useAuth();
  const [items, setItems] = useState<ContinueWatchingItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);

    // Always start with LS (works offline / guest).
    const local = readLocalContinueWatching();
    let merged: ContinueWatchingItem[] = local;

    if (user) {
      const res = await fetch('/api/watch-session');
      const data = res.ok ? ((await res.json()).items as Array<Record<string, unknown>>) : null;

      if (data) {
        const remote = data.map(
          (row): ContinueWatchingItem => ({
            movieId: (row.movie_id as number | null) ?? null,
            movieSlug: (row.movie_slug as string | null) ?? null,
            position: Number(row.position_seconds ?? 0),
            duration: Number(row.duration_seconds ?? 0),
            percent: Number(row.percent_watched ?? 0),
            updatedAt: new Date(String(row.updated_at)).getTime(),
            title: (row.kenyan_title as string | null) ?? undefined,
            backdrop: (row.kenyan_backdrop as string | null) ?? null,
            hlsMasterUrl: (row.kenyan_hls as string | null) ?? null,
          }),
        );

        // Dedupe: prefer remote when they overlap.
        const keyOf = (i: ContinueWatchingItem) =>
          i.movieSlug ? `slug:${i.movieSlug}` : `id:${i.movieId}`;
        const map = new Map<string, ContinueWatchingItem>();
        for (const r of remote) map.set(keyOf(r), r);
        for (const l of local) if (!map.has(keyOf(l))) map.set(keyOf(l), l);
        merged = Array.from(map.values()).sort((a, b) => b.updatedAt - a.updatedAt);
      }
    }

    setItems(merged);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  return { items, loading, refresh: load };
}
