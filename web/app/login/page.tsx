'use client';
/**
 * /login — Netflix-style sign-in page.
 *
 * Four paths into an account:
 *   1. Email + password
 *   2. BirgenAI ID + password (BIR-XXXXXXXX) — the SSO handle shared across
 *      every birgenai.com subdomain.
 *   3. Continue with Google (OAuth via Supabase)
 *   4. Continue with Apple (OAuth via Supabase)
 *
 * After a successful sign-in we route to /profiles so the user can pick a
 * watching profile. The /profiles page itself decides whether to show the
 * "Who's watching?" picker or bounce straight to /profiles/new for first-
 * time users.
 */

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Eye, EyeOff, Mail, KeyRound, Fingerprint, ArrowRight } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { isValidBirgenaiId, normalizeBirgenaiId } from '@/lib/birgenai';

type Method = 'email' | 'birgenai';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { signInWithPassword, signInWithBirgenaiId, signInWithOAuth, user, loading, configured } =
    useAuth();

  const [method, setMethod] = useState<Method>('email');
  const [identifier, setIdentifier] = useState(''); // email OR BIR-ID
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If we're already authenticated, skip the login form entirely.
  useEffect(() => {
    if (!loading && user) router.replace('/');
  }, [loading, user, router]);

  // Pre-fill error from OAuth callback redirects.
  useEffect(() => {
    const err = params.get('error');
    if (err) setError(decodeURIComponent(err));
  }, [params]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!identifier || !password) {
      setError('Please fill in both fields.');
      return;
    }

    if (method === 'birgenai') {
      const id = normalizeBirgenaiId(identifier);
      if (!isValidBirgenaiId(id)) {
        setError('BirgenAI ID must look like BIR-12345678.');
        return;
      }
    }

    setSubmitting(true);
    const { error: err } =
      method === 'email'
        ? await signInWithPassword(identifier.trim(), password)
        : await signInWithBirgenaiId(identifier, password);
    setSubmitting(false);

    if (err) {
      setError(err);
      return;
    }
    router.replace('/');
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-birgen-black">
      {/* Cinematic backdrop — uses an existing hero frame so every install has
          a rich fallback even without custom art. */}
      <div className="absolute inset-0">
        <Image
          src="/Images/movies.jpg"
          alt=""
          fill
          priority
          className="object-cover opacity-55"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-birgen-black/95 via-birgen-black/70 to-birgen-black" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(229,9,20,0.18),transparent_55%)]" />
      </div>

      {/* Top bar */}
      <header className="relative z-10 px-6 sm:px-10 py-5 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/Images/birgenaihub.png"
            alt="BirgenAI"
            width={140}
            height={32}
            className="h-8 w-auto object-contain"
            priority
          />
        </Link>
        <Link
          href="/signup"
          className="text-sm font-medium text-white/85 hover:text-white transition-colors"
        >
          Create account
        </Link>
      </header>

      {/* Card */}
      <main className="relative z-10 flex items-center justify-center px-4 pt-6 pb-20">
        <div className="w-full max-w-[440px] rounded-[14px] bg-black/75 backdrop-blur-md border border-white/5 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)] px-8 sm:px-12 py-10">
          <h1 className="font-display text-[40px] leading-none text-white tracking-wide mb-2">
            Sign in
          </h1>

          {!configured && (
            <div className="mb-5 p-3 rounded-md bg-yellow-500/10 border border-yellow-500/30 text-yellow-200 text-xs">
              Auth is not configured. Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
              <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to <code>.env.local</code>.
            </div>
          )}

          {/* Method toggle — Email vs BirgenAI ID */}
          <div className="grid grid-cols-2 gap-0.5 rounded-md bg-white/5 p-0.5 mb-5">
            <MethodTab
              active={method === 'email'}
              onClick={() => setMethod('email')}
              icon={<Mail className="w-4 h-4" />}
              label="Email"
            />
            <MethodTab
              active={method === 'birgenai'}
              onClick={() => setMethod('birgenai')}
              icon={<Fingerprint className="w-4 h-4" />}
              label="BirgenAI ID"
            />
          </div>

          <form onSubmit={handleSubmit} className="space-y-3" noValidate>
            <Field
              label={method === 'email' ? 'Email' : 'BirgenAI ID'}
              type={method === 'email' ? 'email' : 'text'}
              autoComplete={method === 'email' ? 'email' : 'username'}
              placeholder={method === 'email' ? 'you@example.com' : 'BIR-12345678'}
              value={identifier}
              onChange={setIdentifier}
              required
            />

            <div className="relative">
              <Field
                label="Password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Enter password"
                value={password}
                onChange={setPassword}
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-3 top-[38px] text-birgen-muted hover:text-white transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {error && (
              <p className="text-red-400 text-xs" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting || !configured}
              className="w-full py-3 mt-2 bg-birgen-red hover:bg-birgen-red-light disabled:bg-birgen-red/40 disabled:cursor-not-allowed text-white font-semibold text-[15px] rounded-md transition-all hover:scale-[1.01] active:scale-95 flex items-center justify-center gap-2"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <KeyRound className="w-4 h-4" />
              )}
              Sign in
            </button>

            <div className="flex items-center justify-between text-xs text-birgen-silver pt-2">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="w-3.5 h-3.5 rounded-[3px] bg-birgen-card border-birgen-border accent-birgen-red"
                />
                Remember me
              </label>
              <Link href="/login?help=reset" className="hover:text-white transition-colors">
                Need help?
              </Link>
            </div>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-birgen-muted text-[11px] uppercase tracking-[0.18em]">
              or continue with
            </span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          <div className="space-y-2.5">
            <OAuthButton
              label="Google"
              provider="google"
              onClick={() => signInWithOAuth('google')}
              disabled={!configured}
            />
            <OAuthButton
              label="Apple"
              provider="apple"
              onClick={() => signInWithOAuth('apple')}
              disabled={!configured}
            />
          </div>

          <p className="text-center text-birgen-silver text-sm mt-7">
            New to BirgenAI?{' '}
            <Link href="/signup" className="text-white hover:text-birgen-red font-medium transition-colors">
              Create an account
            </Link>
          </p>
        </div>
      </main>

      {/* Footer fine print */}
      <footer className="relative z-10 px-6 sm:px-10 pb-8 text-center">
        <p className="text-birgen-muted text-[11px]">
          This page is protected by industry-standard encryption. Your BirgenAI ID signs you into
          movies.birgenai.com, birgenai.com and every other BirgenAI property.
        </p>
      </footer>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-birgen-black" />}>
      <LoginForm />
    </Suspense>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function MethodTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-2 h-9 rounded-[5px] text-[13px] font-medium transition-all ${
        active ? 'bg-birgen-red text-white shadow-sm' : 'text-birgen-silver hover:text-white'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function Field({
  label,
  type,
  value,
  onChange,
  placeholder,
  required,
  autoComplete,
  minLength,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  autoComplete?: string;
  minLength?: number;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium uppercase tracking-[0.12em] text-birgen-silver mb-1.5">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        autoComplete={autoComplete}
        minLength={minLength}
        className="w-full h-11 px-3.5 bg-white/[0.04] border border-white/10 focus:border-birgen-red/70 focus:bg-white/[0.06] rounded-md text-white text-sm placeholder-birgen-muted outline-none transition-all"
      />
    </label>
  );
}

function OAuthButton({
  provider,
  label,
  onClick,
  disabled,
}: {
  provider: 'google' | 'apple';
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full h-11 bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed border border-white/10 hover:border-white/20 text-white text-sm font-medium rounded-md transition-all flex items-center justify-center gap-3 group"
    >
      <ProviderGlyph provider={provider} />
      <span>Continue with {label}</span>
      <ArrowRight className="w-4 h-4 -mr-1 text-white/40 group-hover:text-white/80 transition-colors" />
    </button>
  );
}

function ProviderGlyph({ provider }: { provider: 'google' | 'apple' }) {
  if (provider === 'google') {
    return (
      <svg className="w-[18px] h-[18px]" viewBox="0 0 48 48" aria-hidden>
        <path
          fill="#EA4335"
          d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
        />
        <path
          fill="#4285F4"
          d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
        />
        <path
          fill="#FBBC05"
          d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
        />
        <path
          fill="#34A853"
          d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
        />
      </svg>
    );
  }
  return (
    <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M16.365 1.43c0 1.14-.47 2.24-1.24 3.03-.84.86-2.24 1.53-3.37 1.44-.13-1.11.42-2.27 1.17-3.01.83-.81 2.26-1.41 3.44-1.46zM20.5 17.04c-.45 1.04-.66 1.5-1.24 2.42-.81 1.28-1.95 2.87-3.36 2.88-1.26.01-1.58-.82-3.29-.81-1.72.01-2.07.82-3.33.81-1.41-.01-2.49-1.45-3.3-2.73C3.85 17.48 3.1 13.97 4.46 11.49c.93-1.7 2.46-2.78 4.14-2.78 1.66 0 2.7.91 4.08.91 1.33 0 2.14-.91 4.07-.91 1.5 0 3.09.82 4.16 2.24-3.66 2.01-3.07 7.27-.41 6.09z" />
    </svg>
  );
}
