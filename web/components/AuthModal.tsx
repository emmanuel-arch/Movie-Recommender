'use client';
/**
 * AuthModal — the "1 click away from watching" sign-up gate.
 *
 * Presents three actions: Sign up (default), Sign in, Continue as guest.
 * Netflix-styled. OAuth buttons render only when the provider is enabled in
 * the Supabase project.
 *
 * Props:
 *   onClose           — dismiss without picking a path (treated as a cancel).
 *   onContinueGuest   — optional callback when the user picks guest. If
 *                       omitted, the "Continue as guest" button is hidden
 *                       (use this when guest is not allowed, e.g. premium page).
 *   title / subtitle  — optional custom hero copy.
 */

import { useEffect, useState } from 'react';
import { X, Check, Loader2, ChevronRight } from 'lucide-react';
import Image from 'next/image';
import { useAuth } from '@/components/AuthProvider';

type Mode = 'signup' | 'signin';

interface AuthModalProps {
  onClose: () => void;
  onContinueGuest?: () => void;
  title?: string;
  subtitle?: string;
  defaultMode?: Mode;
}

const BENEFITS = [
  'Continue watching from where you left off — on any device',
  'Save your personalized picks and My List',
  'Rate more films to sharpen your recommendations',
  'Get early access to new Kenyan releases',
];

export default function AuthModal({
  onClose,
  onContinueGuest,
  title = "You're 1 click away from watching",
  subtitle = 'Create a free BirgenAI account',
  defaultMode = 'signup',
}: AuthModalProps) {
  const { signUp, signInWithPassword, signInWithOAuth, configured } = useAuth();
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    if (mode === 'signup') {
      const { error: err, needsConfirmation } = await signUp(
        email,
        password,
        displayName || undefined,
      );
      setLoading(false);
      if (err) {
        setError(err);
        return;
      }
      if (needsConfirmation) {
        setSuccess('Check your inbox to confirm your email, then sign in.');
      } else {
        // Auto-confirm is on — send them through the profile picker flow.
        window.location.href = '/profiles';
      }
      return;
    }

    const { error: err } = await signInWithPassword(email, password);
    setLoading(false);
    if (err) {
      setError(err);
      return;
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/85 backdrop-blur-sm animate-fade-in p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-2xl overflow-hidden bg-birgen-dark border border-birgen-border shadow-2xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Hero */}
        <div className="relative px-7 pt-8 pb-6 bg-gradient-to-br from-birgen-red/20 via-birgen-dark to-birgen-dark border-b border-birgen-border">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-black/40 border border-white/10 flex items-center justify-center text-white hover:bg-black/70 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>

          <Image
            src="/Images/birgenaihub.png"
            alt="BirgenAI"
            width={120}
            height={32}
            className="h-6 w-auto object-contain mb-5 opacity-90"
          />

          <h2 className="font-display text-3xl text-white tracking-wide leading-tight mb-1">
            {title}
          </h2>
          <p className="text-birgen-silver text-sm">{subtitle}</p>

          <ul className="mt-5 space-y-2">
            {BENEFITS.map((b) => (
              <li key={b} className="flex items-start gap-2 text-sm text-white/85">
                <Check className="w-4 h-4 text-birgen-red flex-shrink-0 mt-0.5" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Form */}
        <div className="p-7">
          {!configured && (
            <div className="mb-4 p-3 rounded-md bg-yellow-500/10 border border-yellow-500/30 text-yellow-200 text-xs">
              Auth is not configured yet. Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
              <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to <code>.env.local</code>.
            </div>
          )}

          {/* OAuth */}
          <div className="space-y-2 mb-5">
            <OAuthButton provider="google" label="Continue with Google" onClick={() => signInWithOAuth('google')} />
            <OAuthButton provider="apple" label="Continue with Apple" onClick={() => signInWithOAuth('apple')} />
          </div>

          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px bg-birgen-border" />
            <span className="text-birgen-muted text-[11px] uppercase tracking-widest">or</span>
            <div className="flex-1 h-px bg-birgen-border" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === 'signup' && (
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Display name (optional)"
                autoComplete="name"
                className="w-full px-4 py-2.5 bg-birgen-card border border-birgen-border rounded-md text-white text-sm placeholder-birgen-muted focus:outline-none focus:border-birgen-red transition-colors"
              />
            )}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              autoComplete="email"
              required
              className="w-full px-4 py-2.5 bg-birgen-card border border-birgen-border rounded-md text-white text-sm placeholder-birgen-muted focus:outline-none focus:border-birgen-red transition-colors"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              required
              minLength={6}
              className="w-full px-4 py-2.5 bg-birgen-card border border-birgen-border rounded-md text-white text-sm placeholder-birgen-muted focus:outline-none focus:border-birgen-red transition-colors"
            />

            {error && (
              <p className="text-red-400 text-xs">{error}</p>
            )}
            {success && (
              <p className="text-green-400 text-xs">{success}</p>
            )}

            <button
              type="submit"
              disabled={loading || !configured}
              className="w-full py-3 bg-birgen-red hover:bg-birgen-red-light disabled:bg-birgen-red/40 disabled:cursor-not-allowed text-white font-semibold text-sm rounded-md transition-all hover:scale-[1.01] active:scale-95 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {mode === 'signup' ? 'Create free account' : 'Sign in'}
            </button>
          </form>

          {/* Switch mode */}
          <p className="text-center text-birgen-muted text-xs mt-4">
            {mode === 'signup' ? 'Already have an account?' : 'New to BirgenAI?'}{' '}
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'signup' ? 'signin' : 'signup');
                setError(null);
                setSuccess(null);
              }}
              className="text-white hover:text-birgen-red font-medium transition-colors"
            >
              {mode === 'signup' ? 'Sign in' : 'Sign up'}
            </button>
          </p>

          {onContinueGuest && (
            <>
              <div className="flex items-center gap-3 my-5">
                <div className="flex-1 h-px bg-birgen-border" />
              </div>
              <button
                type="button"
                onClick={onContinueGuest}
                className="flex items-center justify-center gap-2 w-full py-2.5 text-birgen-silver hover:text-white text-sm font-medium transition-colors group"
              >
                Continue as guest
                <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
              </button>
              <p className="text-center text-[11px] text-birgen-muted mt-2">
                Guest mode includes pre-roll ads and no continue-watching across devices.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function OAuthButton({
  provider,
  label,
  onClick,
}: {
  provider: 'google' | 'apple' | 'github';
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-sm font-medium rounded-md transition-all flex items-center justify-center gap-3"
    >
      <ProviderIcon provider={provider} />
      {label}
    </button>
  );
}

function ProviderIcon({ provider }: { provider: 'google' | 'apple' | 'github' }) {
  if (provider === 'google') {
    return (
      <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden>
        <path fill="#EA4335" d="M12 10.2v3.98h5.51c-.24 1.45-1.69 4.27-5.51 4.27-3.31 0-6.01-2.74-6.01-6.12 0-3.37 2.7-6.12 6.01-6.12 1.88 0 3.14.8 3.86 1.49l2.63-2.53C16.8 3.87 14.6 3 12 3 6.98 3 2.9 7.03 2.9 12s4.08 9 9.1 9c5.26 0 8.74-3.69 8.74-8.9 0-.6-.07-1.06-.15-1.5H12z" />
      </svg>
    );
  }
  if (provider === 'apple') {
    return (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M16.365 1.43c0 1.14-.47 2.24-1.24 3.03-.84.86-2.24 1.53-3.37 1.44-.13-1.11.42-2.27 1.17-3.01.83-.81 2.26-1.41 3.44-1.46zM20.5 17.04c-.45 1.04-.66 1.5-1.24 2.42-.81 1.28-1.95 2.87-3.36 2.88-1.26.01-1.58-.82-3.29-.81-1.72.01-2.07.82-3.33.81-1.41-.01-2.49-1.45-3.3-2.73C3.85 17.48 3.1 13.97 4.46 11.49c.93-1.7 2.46-2.78 4.14-2.78 1.66 0 2.7.91 4.08.91 1.33 0 2.14-.91 4.07-.91 1.5 0 3.09.82 4.16 2.24-3.66 2.01-3.07 7.27-.41 6.09z" />
      </svg>
    );
  }
  return null;
}
