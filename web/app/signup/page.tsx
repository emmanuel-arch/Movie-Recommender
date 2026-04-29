'use client';
/**
 * /signup — Netflix-style "Create account" page.
 *
 * Collects email + password (+ optional display name). The backend
 * trigger `public.handle_new_user()` generates the user's BirgenAI ID
 * (BIR-XXXXXXXX) automatically, so we don't need to surface that in the
 * form. We show the freshly-minted ID on the confirmation screen so the
 * user knows what to use for SSO into other birgenai.com properties.
 *
 * Google / Apple OAuth is offered alongside — those skip the email/
 * password leg entirely and land on /auth/callback.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Loader2, Eye, EyeOff, Mail, User as UserIcon, ArrowRight, Copy, Check } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import NairobiClock from '@/components/NairobiClock';

export default function SignupPage() {
  const { signUp, signInWithOAuth, profile, loading, configured, refreshProfile } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneState, setDoneState] = useState<
    | null
    | { kind: 'check-email'; email: string }
    | { kind: 'created'; birgenaiId: string | null }
  >(null);

  // ?email= from the /welcome CTA
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('email');
    if (fromUrl) setEmail((prev) => prev || decodeURIComponent(fromUrl).replace(/\+/g, ' '));
  }, []);

  // When the "created" state fires we want the live BirgenAI ID from the
  // freshly-inserted profile row. Poll once after refreshProfile.
  useEffect(() => {
    if (doneState?.kind === 'created' && !doneState.birgenaiId && profile?.birgenai_id) {
      setDoneState({ kind: 'created', birgenaiId: profile.birgenai_id });
    }
  }, [doneState, profile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setSubmitting(true);
    const { error: err, needsConfirmation } = await signUp(
      email.trim(),
      password,
      displayName.trim() || undefined,
    );
    setSubmitting(false);

    if (err) {
      setError(err);
      return;
    }

    if (needsConfirmation) {
      setDoneState({ kind: 'check-email', email: email.trim() });
      return;
    }

    // Session is live → trigger has run → refresh profile to surface BIR-ID.
    setDoneState({ kind: 'created', birgenaiId: null });
    await refreshProfile();
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-birgen-black">
      {/* Cinematic backdrop — full-bleed Nairobi skyline cover (matches the
          /login treatment) so the page never shows bare black edges. */}
      <div className="absolute inset-0">
        <Image
          src="/Images/Nairobi.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover opacity-55"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-birgen-black/95 via-birgen-black/70 to-birgen-black" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(229,9,20,0.18),transparent_55%)]" />
      </div>

      {/* Top bar — logo scales: ~h-11 mobile → h-14 tablet → h-16 desktop */}
      <header className="relative z-10 px-5 sm:px-8 lg:px-12 py-4 sm:py-5 lg:py-6 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <Image
            src="/Images/logo.png"
            alt="BirgenAI"
            width={240}
            height={240}
            className="h-11 sm:h-14 lg:h-16 w-auto object-contain transition-transform group-hover:scale-105"
            priority
          />
        </Link>
        <Link
          href="/login"
          className="text-sm sm:text-[15px] font-medium text-white/85 hover:text-white transition-colors"
        >
          Sign in
        </Link>
      </header>

      <main className="relative z-10 px-4 sm:px-6 lg:px-8 pb-16 sm:pb-20 pt-10 sm:pt-14 lg:pt-20">
        {/* Invisible container — both columns share the SAME top edge AND the
            SAME bottom edge via lg:items-stretch. The right form vertically
            centers itself when the left content is taller. */}
        <div className="max-w-6xl mx-auto grid lg:grid-cols-[1.1fr_1fr] gap-8 sm:gap-10 lg:gap-14 lg:items-stretch">
          {/* Left — pitch + live Nairobi clock */}
          <section className="flex flex-col">
            <h1 className="font-display text-[36px] sm:text-[52px] lg:text-[60px] leading-[0.95] text-white tracking-wide mb-4 sm:mb-5">
              Create your BirgenAI account.
              <span className="block text-birgen-silver text-[18px] sm:text-[22px] lg:text-[24px] mt-3 font-body font-light leading-snug">
                One Identity. Every birgenai.com property.
              </span>
            </h1>

            <div className="mt-5 sm:mt-7 flex-1">
              <NairobiClock />
            </div>
          </section>

          {/* Right — form / confirmation. lg:my-auto centers the card in the
              stretched column so its visual bottom aligns with the clock card. */}
          <section className="w-full max-w-[460px] justify-self-center lg:justify-self-end lg:flex lg:flex-col">
            <div className="rounded-[14px] bg-black/75 backdrop-blur-md border border-white/5 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)] px-8 sm:px-10 py-9 lg:my-auto">
              {doneState?.kind === 'check-email' ? (
                <CheckEmailPanel email={doneState.email} />
              ) : doneState?.kind === 'created' ? (
                <CreatedPanel birgenaiId={doneState.birgenaiId} />
              ) : (
                <>
                  <h2 className="font-display text-[32px] leading-none text-white tracking-wide mb-1.5">
                    Get started
                  </h2>
                  <p className="text-birgen-silver text-sm mb-6">
                    We hate paperwork, too. It'll only take a minute.
                  </p>

                  {!configured && (
                    <div className="mb-5 p-3 rounded-md bg-yellow-500/10 border border-yellow-500/30 text-yellow-200 text-xs">
                      Auth is not configured — missing Supabase env vars.
                    </div>
                  )}

                  <form onSubmit={handleSubmit} className="space-y-3" noValidate>
                    <Field
                      label="Email"
                      type="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={setEmail}
                      icon={<Mail className="w-4 h-4" />}
                      required
                    />
                    <div className="relative">
                      <Field
                        label="Password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        placeholder="At least 6 characters"
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
                        <ArrowRight className="w-4 h-4" />
                      )}
                      Create free account
                    </button>

                    <p className="text-[11px] text-birgen-muted text-center pt-1 leading-relaxed">
                      By signing up you agree to the BirgenAI Terms & Privacy Policy. Your BirgenAI
                      ID will be created automatically.
                    </p>
                  </form>

                  {/* Divider */}
                  <div className="flex items-center gap-3 my-6">
                    <div className="flex-1 h-px bg-white/10" />
                    <span className="text-birgen-muted text-[11px] uppercase tracking-[0.18em]">
                      or
                    </span>
                    <div className="flex-1 h-px bg-white/10" />
                  </div>

                  <div className="space-y-2.5">
                    <OAuthButton
                      label="Sign up with Google"
                      provider="google"
                      onClick={() => signInWithOAuth('google')}
                      disabled={!configured}
                    />
                    <OAuthButton
                      label="Sign up with Apple"
                      provider="apple"
                      onClick={() => signInWithOAuth('apple')}
                      disabled={!configured}
                    />
                  </div>

                  <p className="text-center text-birgen-silver text-sm mt-6">
                    Already on BirgenAI?{' '}
                    <Link href="/login" className="text-white hover:text-birgen-red font-medium transition-colors">
                      Sign in
                    </Link>
                  </p>
                </>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

// ─── Confirmation panels ───────────────────────────────────────────────────

function CheckEmailPanel({ email }: { email: string }) {
  return (
    <div className="text-center py-4">
      <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-birgen-red/15 border border-birgen-red/30 flex items-center justify-center">
        <Mail className="w-7 h-7 text-birgen-red" />
      </div>
      <h2 className="font-display text-[30px] text-white tracking-wide mb-2">Check your inbox</h2>
      <p className="text-birgen-silver text-sm mb-6">
        We sent a confirmation link to <span className="text-white font-medium">{email}</span>. Tap
        the link, then come back and sign in — your BirgenAI ID is waiting.
      </p>
      <Link
        href="/login"
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-sm font-medium rounded-md transition-all"
      >
        Back to sign in <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  );
}

function CreatedPanel({ birgenaiId }: { birgenaiId: string | null }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    if (!birgenaiId) return;
    navigator.clipboard.writeText(birgenaiId);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="text-center py-4">
      <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center">
        <Check className="w-7 h-7 text-green-400" />
      </div>
      <h2 className="font-display text-[30px] text-white tracking-wide mb-2">You're in.</h2>
      <p className="text-birgen-silver text-sm mb-6">Welcome to BirgenAI. Your account is ready.</p>

      <div className="rounded-lg bg-birgen-red/10 border border-birgen-red/30 px-5 py-4 mb-6 text-left">
        <p className="text-[11px] uppercase tracking-[0.15em] text-birgen-red font-semibold mb-1">
          Your BirgenAI ID
        </p>
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-white text-lg tracking-wide">
            {birgenaiId ?? 'Generating…'}
          </span>
          <button
            onClick={handleCopy}
            disabled={!birgenaiId}
            className="text-birgen-silver hover:text-white disabled:opacity-50 transition-colors"
            aria-label="Copy BirgenAI ID"
          >
            {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-[11px] text-birgen-silver mt-2 leading-relaxed">
          Use this ID to sign into every birgenai.com property without re-entering your email.
        </p>
      </div>

      <Link
        href="/auth/otp"
        className="inline-flex items-center justify-center gap-2 w-full py-3 bg-birgen-red hover:bg-birgen-red-light text-white font-semibold text-[15px] rounded-md transition-all"
      >
        Verify email &amp; continue <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  );
}

// ─── Field / OAuth sub-components (mirror /login to keep the visual DNA) ──

function Field({
  label,
  type,
  value,
  onChange,
  placeholder,
  required,
  autoComplete,
  minLength,
  icon,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  autoComplete?: string;
  minLength?: number;
  icon?: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium uppercase tracking-[0.12em] text-birgen-silver mb-1.5">
        {label}
      </span>
      <div className="relative">
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-birgen-muted pointer-events-none">
            {icon}
          </span>
        )}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          autoComplete={autoComplete}
          minLength={minLength}
          className={`w-full h-11 ${icon ? 'pl-10' : 'pl-3.5'} pr-3.5 bg-white/[0.04] border border-white/10 focus:border-birgen-red/70 focus:bg-white/[0.06] rounded-md text-white text-sm placeholder-birgen-muted outline-none transition-all`}
        />
      </div>
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
      className="w-full h-11 bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed border border-white/10 hover:border-white/20 text-white text-sm font-medium rounded-md transition-all flex items-center justify-center gap-3"
    >
      <ProviderGlyph provider={provider} />
      <span>{label}</span>
    </button>
  );
}

function ProviderGlyph({ provider }: { provider: 'google' | 'apple' }) {
  if (provider === 'google') {
    return (
      <svg className="w-[18px] h-[18px]" viewBox="0 0 48 48" aria-hidden>
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
      </svg>
    );
  }
  return (
    <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M16.365 1.43c0 1.14-.47 2.24-1.24 3.03-.84.86-2.24 1.53-3.37 1.44-.13-1.11.42-2.27 1.17-3.01.83-.81 2.26-1.41 3.44-1.46zM20.5 17.04c-.45 1.04-.66 1.5-1.24 2.42-.81 1.28-1.95 2.87-3.36 2.88-1.26.01-1.58-.82-3.29-.81-1.72.01-2.07.82-3.33.81-1.41-.01-2.49-1.45-3.3-2.73C3.85 17.48 3.1 13.97 4.46 11.49c.93-1.7 2.46-2.78 4.14-2.78 1.66 0 2.7.91 4.08.91 1.33 0 2.14-.91 4.07-.91 1.5 0 3.09.82 4.16 2.24-3.66 2.01-3.07 7.27-.41 6.09z" />
    </svg>
  );
}
