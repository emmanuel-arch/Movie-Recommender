'use client';
/**
 * Marketing landing (Netflix-style) — /welcome
 *
 * Does not replace the app home at /. Use this route for first-touch visitors
 * and ads; the main home after sign-in remains /.
 */

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';

export default function WelcomePage() {
  const router = useRouter();
  const [email, setEmail] = useState('');

  const onGetStarted = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    const q = trimmed ? `?email=${encodeURIComponent(trimmed)}` : '';
    router.push(`/signup${q}`);
  };

  return (
    <div className="min-h-screen min-h-[100dvh] relative flex flex-col overflow-hidden bg-black text-white">
      {/* Full-bleed wallpaper + Netflix-like darkening and vignette */}
      <div className="absolute inset-0" aria-hidden>
        <Image
          src="/Images/movie-wallpaper.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-center scale-105"
        />
        <div className="absolute inset-0 bg-black/55" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_20%,rgba(0,0,0,0.2)_0%,rgba(0,0,0,0.5)_45%,rgba(0,0,0,0.88)_100%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/25 to-[#0A0A0A]" />
      </div>

      <header className="relative z-20 flex w-full items-center justify-between px-4 py-4 sm:px-10 sm:py-5">
        <Link href="/" className="inline-flex sm:pl-0">
          <Image
            src="/Images/birgenaihub.png"
            alt="BirgenAI"
            width={140}
            height={32}
            className="h-7 sm:h-8 w-auto object-contain"
            priority
          />
        </Link>
        <Link
          href="/login"
          className="inline-flex min-h-[32px] items-center justify-center rounded bg-birgen-red px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-birgen-red-light sm:px-4 sm:min-h-0"
        >
          Sign In
        </Link>
      </header>

      <main className="relative z-20 flex flex-1 flex-col items-center justify-center px-4 pb-20 pt-2 sm:px-6 sm:pb-28">
        <div className="mx-auto w-full max-w-[40rem] text-center sm:max-w-[50rem]">
          <h1 className="font-display text-4xl leading-[1.05] tracking-tight text-white sm:text-5xl md:text-6xl lg:text-7xl">
            Unlimited movies, TV shows, and more
          </h1>
          
          <p className="mt-3 text-sm text-birgen-silver sm:text-base md:text-lg">
            Ready to watch? Enter your email to create or restart your membership.
          </p>

          <form
            onSubmit={onGetStarted}
            className="mt-6 flex w-full max-w-3xl flex-col items-stretch gap-2.5 sm:mx-auto sm:mt-8 sm:flex-row sm:items-stretch"
          >
            <label className="sr-only" htmlFor="welcome-email">
              Email address
            </label>
            <input
              id="welcome-email"
              type="email"
              name="email"
              autoComplete="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 w-full min-w-0 flex-1 rounded border border-white/20 bg-black/50 px-4 text-base text-white placeholder-birgen-muted outline-none ring-birgen-red/40 backdrop-blur-sm focus:border-white/40 focus:ring-2 sm:h-14 sm:px-5 sm:text-base"
            />
            <button
              type="submit"
              className="inline-flex h-12 w-full items-center justify-center gap-1 rounded bg-birgen-red px-5 text-base font-medium text-white transition-colors hover:bg-birgen-red-light sm:h-14 sm:w-auto sm:shrink-0 sm:px-6 md:px-8 md:text-lg"
            >
              Get Started
              <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden />
            </button>
          </form>
        </div>
      </main>

      <div className="pointer-events-none relative z-20 flex-0 border-t border-white/5 py-3 text-center sm:py-4">
        <p className="text-[11px] text-birgen-muted sm:text-xs">© BirgenAI · Kenya</p>
      </div>
    </div>
  );
}
