'use client';
/**
 * Root-level auth provider.
 *
 * Responsibilities:
 *   1. Subscribe to Supabase auth state changes (sign-in / sign-out / token refresh).
 *   2. Expose `{ user, profile, loading, signInWithPassword, signUp, signInWithOAuth,
 *       signOut, refresh }` to the whole tree.
 *   3. Lazily load the user's `profiles` row so the UI can read `plan` without a
 *      round-trip.
 *
 * If Supabase isn't configured (no env vars), the provider still renders — it
 * just returns a guest context so every page works as "guest mode".
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { getSupabaseClient, supabaseConfigured } from '@/lib/supabase/client';
import type { Profile } from '@/lib/supabase/types';

interface AuthContextValue {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  configured: boolean;
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, displayName?: string) => Promise<{ error: string | null }>;
  signInWithOAuth: (provider: 'google' | 'github' | 'apple') => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = getSupabaseClient();
  const configured = supabaseConfigured();

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(configured);

  const refreshProfile = useCallback(async () => {
    if (!supabase || !user) {
      setProfile(null);
      return;
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();
    if (error) {
      // A brand-new user may not yet have a profile row — the DB trigger creates
      // it on insert, but the network race can miss us by a few ms.
      setProfile(null);
    } else {
      setProfile(data as Profile | null);
    }
  }, [supabase, user]);

  // Subscribe to auth changes.
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

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUser(session?.user ?? null);
    });

    return () => {
      active = false;
      sub?.subscription.unsubscribe();
    };
  }, [supabase]);

  // Load profile whenever user changes.
  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  const signInWithPassword = useCallback<AuthContextValue['signInWithPassword']>(
    async (email, password) => {
      if (!supabase) return { error: 'Auth is not configured.' };
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: error?.message ?? null };
    },
    [supabase],
  );

  const signUp = useCallback<AuthContextValue['signUp']>(
    async (email, password, displayName) => {
      if (!supabase) return { error: 'Auth is not configured.' };
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName },
          emailRedirectTo: typeof window !== 'undefined' ? `${window.location.origin}/` : undefined,
        },
      });
      return { error: error?.message ?? null };
    },
    [supabase],
  );

  const signInWithOAuth = useCallback<AuthContextValue['signInWithOAuth']>(
    async (provider) => {
      if (!supabase) return;
      await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/` : undefined,
        },
      });
    },
    [supabase],
  );

  const signOut = useCallback<AuthContextValue['signOut']>(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  }, [supabase]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      loading,
      configured,
      signInWithPassword,
      signUp,
      signInWithOAuth,
      signOut,
      refreshProfile,
    }),
    [user, profile, loading, configured, signInWithPassword, signUp, signInWithOAuth, signOut, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    // Fallback: if provider isn't in the tree yet (SSR edge cases), return a
    // safe guest stub instead of throwing.
    return {
      user: null,
      profile: null,
      loading: false,
      configured: false,
      signInWithPassword: async () => ({ error: 'Not configured' }),
      signUp: async () => ({ error: 'Not configured' }),
      signInWithOAuth: async () => {},
      signOut: async () => {},
      refreshProfile: async () => {},
    };
  }
  return ctx;
}
