'use client';
/**
 * /signup — deprecated on Movies.
 *
 * Account creation is centralized at the BirgenAI Hub (birgenai.com). This route
 * now just forwards any visitor (e.g. an old bookmark or an in-app link) to the
 * Hub's /create-account, preserving the email if one was passed. Once they
 * finish there and sign in, SSO carries them straight back into Movies.
 */

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Loader2, ArrowRight } from 'lucide-react';
import { createAccountUrl } from '@/lib/hubUrl';

export default function SignupRedirectPage() {
  const [target, setTarget] = useState<string>(createAccountUrl());

  useEffect(() => {
    const email = new URLSearchParams(window.location.search).get('email') ?? undefined;
    const url = createAccountUrl(email ? decodeURIComponent(email).replace(/\+/g, ' ') : undefined);
    setTarget(url);
    // Brief beat so the splash is visible, then hand off to the Hub.
    const t = setTimeout(() => {
      window.location.href = url;
    }, 900);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="min-h-screen min-h-[100dvh] relative flex flex-col items-center justify-center overflow-hidden bg-birgen-black text-white px-6">
      <div className="absolute inset-0" aria-hidden>
        <Image src="/Images/Nairobi.jpg" alt="" fill priority sizes="100vw" className="object-cover opacity-40" />
        <div className="absolute inset-0 bg-gradient-to-b from-birgen-black/95 via-birgen-black/80 to-birgen-black" />
      </div>

      <div className="relative z-10 text-center max-w-md">
        <Image
          src="/Images/logo.png"
          alt="BirgenAI"
          width={200}
          height={200}
          className="h-14 w-auto object-contain mx-auto mb-6"
          priority
        />
        <h1 className="font-display text-2xl sm:text-3xl tracking-wide mb-2">Taking you to birgenai.com</h1>
        <p className="text-birgen-silver text-sm mb-6">
          BirgenAI accounts are created once on the Hub, then work across Movies and every other
          BirgenAI app. Redirecting you to create yours…
        </p>
        <div className="flex items-center justify-center gap-2 text-birgen-silver text-sm mb-6">
          <Loader2 className="w-4 h-4 animate-spin" />
          One moment
        </div>
        <a
          href={target}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-birgen-red hover:bg-birgen-red-light text-white text-sm font-medium rounded-md transition-all"
        >
          Continue now <ArrowRight className="w-4 h-4" />
        </a>
        <p className="mt-6 text-birgen-silver text-sm">
          Already have an account?{' '}
          <Link href="/login" className="text-white hover:text-birgen-red font-medium transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
