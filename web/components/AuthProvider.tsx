'use client';
/**
 * Root-level auth provider — NextAuth (Auth.js v5) edition.
 *
 * Movies authenticates through the SAME NextAuth / Prisma `User` store as
 * birgenai.com (1.0). That gives us:
 *   • one shared account across every BirgenAI property, and
 *   • Google OAuth on a birgenai.com callback (so the Google consent screen
 *     reads "continue to birgenai.com", not the raw *.supabase.co host).
 *
 * Identity comes from NextAuth (`useSession`). Per-user *data* still lives in
 * Supabase (watching_profiles, watch_sessions, …) and is read through
 * service-role server routes (e.g. /api/profiles) — the browser anon client
 * has no Supabase `auth.uid()` anymore, so RLS would block direct reads.
 *
 * The hook surface (`signInWithPassword`, `profile`, `activeWatchingProfile`,
 * …) is kept identical to the previous Supabase-Auth provider so existing
 * consumers keep working unchanged.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  SessionProvider,
  useSession,
  signIn as nextAuthSignIn,
  signOut as nextAuthSignOut,
} from 'next-auth/react';
import { supabaseConfigured } from '@/lib/supabase/client';
import { MoviesTrialGate } from '@/components/trial/MoviesTrialGate';
import { TrialBanner } from '@/components/trial/TrialBanner';
import type { WatchingProfile } from '@/lib/supabase/types';
import { isValidBirgenaiId, normalizeBirgenaiId } from '@/lib/birgenai';

const ACTIVE_PROFILE_STORAGE_KEY = 'birgenai.activeWatchingProfileId';

/** Minimal user shape, kept loosely compatible with the old Supabase user. */
export interface AuthUser {
  id: string;
  email: string | null;
  name: string | null;
  image?: string | null;
  tier?: string;
  role?: string;
  birgenAiId?: string | null;
  /** Back-compat shim for code that read the old Supabase `user_metadata`. */
  user_metadata: { display_name?: string | null; avatar_url?: string | null };
}

/** Synthesised from the NextAuth session — mirrors the old `profiles` row. */
export interface SyntheticProfile {
  id: string;
  birgenai_id: string | null;
  display_name: string | null;
  plan: string | null;
  /** Always non-null: NextAuth accounts are email-verified at registration. */
  otp_verified_at: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  profile: SyntheticProfile | null;
  watchingProfiles: WatchingProfile[];
  activeWatchingProfile: WatchingProfile | null;
  activeWatchingProfileId: string | null;
  loading: boolean;
  accountReady: boolean;
  configured: boolean;
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>;
  signInWithBirgenaiId: (birgenaiId: string, password: string) => Promise<{ error: string | null }>;
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

function AuthInner({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const isAuthed = status === 'authenticated';
  const isLoading = status === 'loading';
  const configured = supabaseConfigured();

  const [watchingProfiles, setWatchingProfiles] = useState<WatchingProfile[]>([]);
  const [activeWatchingProfileId, _setActiveWatchingProfileId] = useState<string | null>(null);
  const [profilesFetched, setProfilesFetched] = useState(false);
  const [profilesLoading, setProfilesLoading] = useState(false);

  // ── Mapped user + synthetic profile (no Supabase round-trip) ─────────────
  const user = useMemo<AuthUser | null>(() => {
    if (!isAuthed || !session?.user) return null;
    const s = session.user as {
      id: string;
      email?: string | null;
      name?: string | null;
      image?: string | null;
      tier?: string;
      role?: string;
      birgenAiId?: string | null;
    };
    return {
      id: s.id,
      email: s.email ?? null,
      name: s.name ?? null,
      image: s.image ?? null,
      tier: s.tier,
      role: s.role,
      birgenAiId: s.birgenAiId ?? null,
      user_metadata: { display_name: s.name ?? null, avatar_url: s.image ?? null },
    };
  }, [isAuthed, session]);

  const profile = useMemo<SyntheticProfile | null>(() => {
    if (!user) return null;
    return {
      id: user.id,
      birgenai_id: user.birgenAiId ?? null,
      display_name: user.name,
      plan: user.tier ?? 'FREE',
      // Treat every NextAuth account as OTP-verified (email_confirm at signup).
      otp_verified_at: '1970-01-01T00:00:00.000Z',
    };
  }, [user]);

  // ── Persisted active-profile state ───────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    _setActiveWatchingProfileId(window.localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY));
  }, []);

  const setActiveWatchingProfile = useCallback((id: string | null) => {
    _setActiveWatchingProfileId(id);
    if (typeof window === 'undefined') return;
    if (id) {
      window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, id);
      document.cookie = `birgenai_wp=${encodeURIComponent(id)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    } else {
      window.localStorage.removeItem(ACTIVE_PROFILE_STORAGE_KEY);
      document.cookie = 'birgenai_wp=; path=/; max-age=0; samesite=lax';
    }
  }, []);

  // ── Watching-profile loader (service-role server route) ──────────────────
  const refreshWatchingProfiles = useCallback(async () => {
    if (!user?.id) {
      setWatchingProfiles([]);
      return;
    }
    setProfilesLoading(true);
    try {
      const res = await fetch('/api/profiles');
      if (res.ok) {
        const json = await res.json();
        setWatchingProfiles((json.profiles as WatchingProfile[]) ?? []);
      }
    } catch {
      // leave existing list; network hiccup
    } finally {
      setProfilesLoading(false);
      setProfilesFetched(true);
    }
  }, [user?.id]);

  // `profile` is synthesised from the session, so refreshProfile just re-pulls
  // the watching-profile list (kept for API compatibility).
  const refreshProfile = useCallback(async () => {
    await refreshWatchingProfiles();
  }, [refreshWatchingProfiles]);

  useEffect(() => {
    if (isAuthed && user?.id && !profilesFetched) {
      void refreshWatchingProfiles();
    }
    if (!isAuthed && !isLoading) {
      setWatchingProfiles([]);
      setProfilesFetched(false);
    }
  }, [isAuthed, isLoading, user?.id, profilesFetched, refreshWatchingProfiles]);

  // ── Auth actions ─────────────────────────────────────────────────────────
  const signInWithPassword = useCallback<AuthContextValue['signInWithPassword']>(
    async (email, password) => {
      const res = await nextAuthSignIn('credentials', {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
      });
      return { error: res?.error ? 'Incorrect email or password.' : null };
    },
    [],
  );

  const signInWithBirgenaiId = useCallback<AuthContextValue['signInWithBirgenaiId']>(
    async (rawId, password) => {
      const birgenaiId = normalizeBirgenaiId(rawId);
      if (!isValidBirgenaiId(birgenaiId)) {
        return { error: 'BirgenAI ID must look like BIR-12345678.' };
      }
      const res = await nextAuthSignIn('credentials', {
        birgenAiId: birgenaiId,
        password,
        redirect: false,
      });
      return { error: res?.error ? 'Incorrect BirgenAI ID or password.' : null };
    },
    [],
  );

  const signUp = useCallback<AuthContextValue['signUp']>(
    async (email, password, displayName) => {
      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, name: displayName }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          return { error: body?.message ?? 'Could not create account.', needsConfirmation: false };
        }
        // Account is created + email pre-confirmed → sign in immediately so the
        // session (and BirgenAI ID) is live for the confirmation screen.
        await nextAuthSignIn('credentials', {
          email: email.trim().toLowerCase(),
          password,
          redirect: false,
        });
        return { error: null, needsConfirmation: false };
      } catch {
        return { error: 'Network error. Please try again.', needsConfirmation: false };
      }
    },
    [],
  );

  const signInWithOAuth = useCallback<AuthContextValue['signInWithOAuth']>(
    async (provider, redirectTo) => {
      // OAuth can't complete inside the hub's iframe: Google/Apple send
      // `X-Frame-Options: DENY` (their consent screen refuses to render framed),
      // and the SameSite=Lax CSRF/PKCE/state cookies Auth.js sets don't round-trip
      // on the embedded cross-site callback → "MissingCSRF". So when we're embedded,
      // break the whole tab out to our own first-party /login and run OAuth there.
      // (If suite SSO is configured, an authenticated hub user never reaches this —
      // their shared session cookie already signs them in here.)
      if (typeof window !== 'undefined' && window.top && window.top !== window.self) {
        const target = new URL('/login', window.location.origin);
        if (redirectTo) target.searchParams.set('callbackUrl', redirectTo);
        // Allowed cross-origin because it runs on a user gesture (button click).
        window.top.location.href = target.toString();
        return;
      }
      await nextAuthSignIn(provider, { callbackUrl: redirectTo ?? '/' });
    },
    [],
  );

  const signOut = useCallback<AuthContextValue['signOut']>(async () => {
    setActiveWatchingProfile(null);
    await nextAuthSignOut({ callbackUrl: '/welcome' });
  }, [setActiveWatchingProfile]);

  // ── Derived values ───────────────────────────────────────────────────────
  const activeWatchingProfile = useMemo<WatchingProfile | null>(() => {
    if (!watchingProfiles.length) return null;
    if (activeWatchingProfileId) {
      const hit = watchingProfiles.find((p) => p.id === activeWatchingProfileId);
      if (hit) return hit;
    }
    return watchingProfiles.find((p) => p.is_default) ?? watchingProfiles[0] ?? null;
  }, [watchingProfiles, activeWatchingProfileId]);

  const loading = isLoading || (isAuthed && profilesLoading && !profilesFetched);
  const accountReady = !loading && (!isAuthed || profilesFetched);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      watchingProfiles,
      activeWatchingProfile,
      activeWatchingProfileId,
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
      activeWatchingProfileId,
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

  return (
    <AuthContext.Provider value={value}>
      {children}
      {/* Freemium gateway: a gentle "N days left" nudge during the trial, then the
          full-screen wall once it lapses or the 3-hour cap is hit. */}
      <TrialBanner />
      <MoviesTrialGate />
    </AuthContext.Provider>
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <AuthInner>{children}</AuthInner>
    </SessionProvider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    return {
      user: null,
      profile: null,
      watchingProfiles: [],
      activeWatchingProfile: null,
      activeWatchingProfileId: null,
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
