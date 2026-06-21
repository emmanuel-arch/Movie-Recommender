'use client';
/**
 * useEntitlement — the client-side authoritative Premium check.
 *
 * Reads /api/entitlement (fresh from the shared User row) rather than the NextAuth
 * session `tier`, which is stale until re-login.
 *
 * DEDUPED: the result is held in a tiny module-level store with in-flight
 * de-duplication and a refetch throttle, so the several components that use this
 * (Navbar, VideoPlayer, ScreenTimeBanner via useScreenTime, /upgrade, …) share ONE
 * request instead of each hitting the DB. That matters because the Movies
 * DATABASE_URL runs with connection_limit=1, so uncoordinated per-component fetches
 * (× window-focus refetches) serialize on a single connection and stall the app.
 */

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';

type Snapshot = { isPremium: boolean; premiumUntil: string | null; error: boolean };

const EMPTY: Snapshot = { isPremium: false, premiumUntil: null, error: false };
const MIN_REFETCH_MS = 15_000; // don't re-hit the DB more than ~once per 15s per tab

let snapshot: Snapshot = EMPTY;
let loaded = false;
let lastFetch = 0;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function fetchEntitlement(): Promise<void> {
  if (inflight) return inflight; // collapse concurrent callers onto one request
  inflight = (async () => {
    try {
      const res = await fetch('/api/entitlement', { cache: 'no-store' });
      const json = await res.json();
      snapshot = {
        isPremium: Boolean(json?.isPremium),
        premiumUntil: (json?.premiumUntil as string | null) ?? null,
        error: Boolean(json?.error),
      };
    } catch {
      snapshot = { isPremium: false, premiumUntil: null, error: true };
    } finally {
      loaded = true;
      lastFetch = Date.now();
      inflight = null;
      emit();
    }
  })();
  return inflight;
}

function maybeFetch() {
  if (!loaded || Date.now() - lastFetch > MIN_REFETCH_MS) void fetchEntitlement();
}

export interface EntitlementState {
  loading: boolean;
  isPremium: boolean;
  premiumUntil: string | null;
  error: boolean;
  refresh: () => Promise<void>;
}

export function useEntitlement(): EntitlementState {
  const { user } = useAuth();
  const [, force] = useState(0);

  // Subscribe this component to the shared store.
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  // Load on mount / when the signed-in user changes.
  useEffect(() => {
    if (!user) {
      snapshot = EMPTY;
      loaded = true;
      emit();
      return;
    }
    maybeFetch();
  }, [user]);

  // Re-check when the tab regains focus (e.g. returning from the wallet after paying)
  // — throttled so rapid focus churn can't storm the DB.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onFocus = () => {
      if (user) maybeFetch();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [user]);

  const refresh = useCallback(async () => {
    lastFetch = 0; // force a fresh read (used right after a payment returns)
    await fetchEntitlement();
  }, []);

  return {
    loading: !loaded,
    isPremium: snapshot.isPremium,
    premiumUntil: snapshot.premiumUntil,
    error: snapshot.error,
    refresh,
  };
}
