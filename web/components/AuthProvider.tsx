'use client';
/**
 * Root-level auth provider.
 *
 * Responsibilities:
 *   1. Subscribe to Supabase auth state changes (sign-in / sign-out / token refresh).
 *   2. Expose auth + `accountReady` (session resolved and profile/watch list
 *      fetched) so routing can avoid races (e.g. /profiles vs /profiles/new).
 *   3. Lazily load the user's `profiles` row AND their watching-profile list
 *      so the UI can decide between the picker and an auto-route.
 *
 * If Supabase isn't configured (no env vars), the provider still renders —
 * it just returns a guest context so every page works as "guest mode".
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { getSupabaseClient, supabaseConfigured } from '@/lib/supabase/client';
import type { Profile, WatchingProfile } from '@/lib/supabase/types';
import { isValidBirgenaiId, normalizeBirgenaiId } from '@/lib/birgenai';
import { isPublicForAnonymousPath } from '@/lib/anonPublicPaths';

const ACTIVE_PROFILE_STORAGE_KEY = 'birgenai.activeWatchingProfileId';

interface AuthContextValue {
  user: User | null;
  profile: Profile | null;
  watchingProfiles: WatchingProfile[];
  activeWatchingProfile: WatchingProfile | null;
  loading: boolean;
  /** True once initial session + profile/watch fetch finished for this user (or guest). */
  accountReady: boolean;
  configured: boolean;
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>;
  signInWithBirgenaiId: (
    birgenaiId: string,
    password: string,
  ) => Promise<{ error: string | null }>;
  signUp: (
    email: string,
    password: string,
    displayName?: string,
  ) => Promise<{ error: string | null; needsConfirmation: boolean }>;
  signInWithOAuth: (provider: 'google' | 'github' | 'apple', redirectTo?: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshWatchingProfiles: () => Promise<void>;
  setActiveWatchingProfile: (id: string | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = getSupabaseClient();
  const configured = supabaseConfigured();

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [watchingProfiles, setWatchingProfiles] = useState<WatchingProfile[]>([]);
  const [activeWatchingProfileId, _setActiveWatchingProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(configured);
  const [accountReady, setAccountReady] = useState(!configured);

  // ── Persisted active-profile state ───────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY);
    _setActiveWatchingProfileId(saved ?? null);
  }, []);

  const setActiveWatchingProfile = useCallback((id: string | null) => {
    _setActiveWatchingProfileId(id);
    if (typeof window === 'undefined') return;
    if (id) {
      window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, id);
      // Cookie mirror so server components / middleware can read it too.
      document.cookie = `birgenai_wp=${encodeURIComponent(id)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    } else {
      window.localStorage.removeItem(ACTIVE_PROFILE_STORAGE_KEY);
      document.cookie = 'birgenai_wp=; path=/; max-age=0; samesite=lax';
    }
  }, []);

  // ── Profile row loader ───────────────────────────────────────────────────
  const refreshProfile = useCallback(async () => {
    if (!supabase || !user) {
      setProfile(null);
      return;
    }
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();
    setProfile((data as Profile | null) ?? null);
  }, [supabase, user]);

  const refreshWatchingProfiles = useCallback(async () => {
    if (!supabase || !user) {
      setWatchingProfiles([]);
      return;
    }
    const { data } = await supabase
      .from('watching_profiles')
      .select('*')
      .eq('user_id', user.id)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true });
    setWatchingProfiles((data as WatchingProfile[] | null) ?? []);
  }, [supabase, user]);

  // ── Auth subscription ────────────────────────────────────────────────────
  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      setUser(session?.user ?? null);
      if (event === 'SIGNED_OUT' && typeof window !== 'undefined') {
        const path = window.location.pathname;
        if (!isPublicForAnonymousPath(path)) {
          setTimeout(() => {
            window.location.replace('/welcome');
          }, 0);
        }
      }
    });

    return () => {
      active = false;
      sub?.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!configured || !supabase) {
      setAccountReady(true);
      return;
    }
    if (loading) return;

    let cancelled = false;
    setAccountReady(false);

    void (async () => {
      if (!user) {
        setProfile(null);
        setWatchingProfiles([]);
        if (!cancelled) setAccountReady(true);
        return;
      }
      await Promise.all([refreshProfile(), refreshWatchingProfiles()]);
      if (!cancelled) setAccountReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [configured, supabase, loading, user?.id, refreshProfile, refreshWatchingProfiles]);

  // ── Auth actions ─────────────────────────────────────────────────────────
  const signInWithPassword = useCallback<AuthContextValue['signInWithPassword']>(
    async (email, password) => {
      if (!supabase) return { error: 'Auth is not configured.' };
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: error?.message ?? null };
    },
    [supabase],
  );

  // BirgenAI-ID sign-in → resolve email via public RPC, then delegate to
  // the normal password flow. Fails closed if the ID doesn't exist.
  const signInWithBirgenaiId = useCallback<AuthContextValue['signInWithBirgenaiId']>(
    async (rawId, password) => {
      if (!supabase) return { error: 'Auth is not configured.' };
      const birgenaiId = normalizeBirgenaiId(rawId);
      if (!isValidBirgenaiId(birgenaiId)) {
        return { error: 'BirgenAI ID must look like BIR-12345678.' };
      }
      const { data, error: rpcErr } = await supabase.rpc('email_for_birgenai_id', {
        p_birgenai_id: birgenaiId,
      });
      if (rpcErr) return { error: rpcErr.message };
      const email = typeof data === 'string' ? data : null;
      if (!email) return { error: 'No BirgenAI account found for that ID.' };
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: error?.message ?? null };
    },
    [supabase],
  );

  const signUp = useCallback<AuthContextValue['signUp']>(
    async (email, password, displayName) => {
      if (!supabase) return { error: 'Auth is not configured.', needsConfirmation: false };
      const redirect =
        typeof window !== 'undefined'
          ? `${window.location.origin}/auth/callback?next=${encodeURIComponent('/auth/otp')}`
          : undefined;
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName },
          emailRedirectTo: redirect,
        },
      });
      if (error) return { error: error.message, needsConfirmation: false };
      // If the project has email confirmation ON, `session` is null.
      const needsConfirmation = !data.session;
      return { error: null, needsConfirmation };
    },
    [supabase],
  );

  const signInWithOAuth = useCallback<AuthContextValue['signInWithOAuth']>(
    async (provider, redirectTo) => {
      if (!supabase) return;
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const target =
        redirectTo ??
        `${origin}/auth/callback?next=${encodeURIComponent('/auth/otp')}`;
      await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: target,
          // Supabase injects the correct scopes per-provider; we just ask for
          // a refresh token so sessions survive a browser close.
          queryParams: provider === 'google' ? { access_type: 'offline', prompt: 'consent' } : undefined,
        },
      });
    },
    [supabase],
  );

  const signOut = useCallback<AuthContextValue['signOut']>(async () => {
    if (!supabase) return;
    setActiveWatchingProfile(null);
    await supabase.auth.signOut();
  }, [supabase, setActiveWatchingProfile]);

  // ── Derived values ───────────────────────────────────────────────────────
  const activeWatchingProfile = useMemo<WatchingProfile | null>(() => {
    if (!watchingProfiles.length) return null;
    if (activeWatchingProfileId) {
      const hit = watchingProfiles.find((p) => p.id === activeWatchingProfileId);
      if (hit) return hit;
    }
    return watchingProfiles.find((p) => p.is_default) ?? null;
  }, [watchingProfiles, activeWatchingProfileId]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      watchingProfiles,
      activeWatchingProfile,
      loading,
      accountReady,
      configured,
      signInWithPassword,
      signInWithBirgenaiId,
      signUp,
      signInWithOAuth,
      signOut,
      refreshProfile,
      refreshWatchingProfiles,
      setActiveWatchingProfile,
    }),
    [
      user,
      profile,
      watchingProfiles,
      activeWatchingProfile,
      loading,
      accountReady,
      configured,
      signInWithPassword,
      signInWithBirgenaiId,
      signUp,
      signInWithOAuth,
      signOut,
      refreshProfile,
      refreshWatchingProfiles,
      setActiveWatchingProfile,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    // Safe guest stub for SSR edges where the provider isn't mounted yet.
    return {
      user: null,
      profile: null,
      watchingProfiles: [],
      activeWatchingProfile: null,
      loading: false,
      accountReady: true,
      configured: false,
      signInWithPassword: async () => ({ error: 'Not configured' }),
      signInWithBirgenaiId: async () => ({ error: 'Not configured' }),
      signUp: async () => ({ error: 'Not configured', needsConfirmation: false }),
      signInWithOAuth: async () => {},
      signOut: async () => {},
      refreshProfile: async () => {},
      refreshWatchingProfiles: async () => {},
      setActiveWatchingProfile: () => {},
    };
  }
  return ctx;
}
