'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Loader2, Mail } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';

export default function OtpPage() {
  const router = useRouter();
  const { user, profile, loading, configured, refreshProfile, signOut } = useAuth();
  const autoSendOnce = useRef(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentOnce, setSentOnce] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/welcome');
  }, [loading, user, router]);

  useEffect(() => {
    if (!profile?.otp_verified_at || loading) return;
    router.replace('/profiles');
  }, [profile?.otp_verified_at, loading, router]);

  const sendCode = async () => {
    setError(null);
    setSending(true);
    try {
      const res = await fetch('/api/auth/otp/send', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Could not send email.');
        return;
      }
      setSentOnce(true);
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    if (!user || !configured || loading) return;
    if (profile?.otp_verified_at) return;
    if (autoSendOnce.current) return;
    autoSendOnce.current = true;
    void sendCode();
  }, [user?.id, configured, loading, profile?.otp_verified_at]);

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = code.trim().replace(/\s+/g, '');
    if (!/^\d{6}$/.test(trimmed)) {
      setError('Enter the 6-digit code from your email.');
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Verification failed.');
        return;
      }
      await refreshProfile();
      // Watching-profile picker sends first-timers to /profiles/new?initial=1
      router.replace('/auth/entering?next=/profiles');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-birgen-black flex flex-col">
      <header className="px-6 sm:px-10 py-6 flex items-center justify-between">
        <Link href="/">
          <Image
            src="/Images/birgenaihub.png"
            alt="BirgenAI"
            width={140}
            height={32}
            className="h-8 w-auto object-contain"
            priority
          />
        </Link>
        <button
          type="button"
          onClick={() => void signOut()}
          className="text-sm text-birgen-silver hover:text-white transition-colors"
        >
          Sign out
        </button>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md rounded-[14px] bg-black/75 backdrop-blur-md border border-white/5 px-8 py-10">
          <div className="w-14 h-14 mx-auto mb-6 rounded-full bg-birgen-red/15 border border-birgen-red/30 flex items-center justify-center">
            <Mail className="w-7 h-7 text-birgen-red" />
          </div>
          <h1 className="font-display text-3xl sm:text-4xl text-white text-center tracking-wide mb-2">
            Check your email
          </h1>
          <p className="text-birgen-silver text-sm text-center mb-8">
            We sent a verification code from{' '}
            <span className="text-white font-medium">auth@birgenai.com</span> to{' '}
            <span className="text-white">{user?.email ?? 'your inbox'}</span>.
          </p>

          <form onSubmit={verify} className="space-y-4">
            <label className="block">
              <span className="block text-[11px] font-medium uppercase tracking-[0.12em] text-birgen-silver mb-1.5">
                6-digit code
              </span>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="● ● ● ● ● ●"
                className="w-full h-12 text-center tracking-[0.5em] font-mono text-lg bg-white/[0.04] border border-white/10 focus:border-birgen-red/70 rounded-md text-white placeholder-birgen-muted outline-none transition-all"
              />
            </label>

            {error && (
              <p className="text-red-400 text-xs text-center" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy || !configured}
              className="w-full py-3 bg-birgen-red hover:bg-birgen-red-light disabled:opacity-50 text-white font-semibold rounded-md transition-all flex items-center justify-center gap-2"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Verify &amp; continue
            </button>

            <button
              type="button"
              onClick={() => void sendCode()}
              disabled={sending || !configured}
              className="w-full py-2.5 text-sm text-birgen-silver hover:text-white border border-white/10 rounded-md transition-colors disabled:opacity-50"
            >
              {sending ? (
                <>
                  <Loader2 className="inline w-4 h-4 animate-spin mr-2 align-middle" />
                  Sending…
                </>
              ) : sentOnce ? (
                'Resend code'
              ) : (
                'Send code'
              )}
            </button>
          </form>

          {!configured && (
            <p className="mt-6 text-yellow-200/90 text-xs text-center">
              Missing Supabase or SMTP env vars — OTP email cannot send until SMTP_USER and SMTP_PASS are set.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
