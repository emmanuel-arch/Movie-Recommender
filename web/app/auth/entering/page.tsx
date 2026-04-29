'use client';

/**
 * Brief branded loading beat after OTP success before landing on home (/).
 */

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function EnteringInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') && params.get('next')!.startsWith('/') ? params.get('next')! : '/';
  const [dots, setDots] = useState('');

  useEffect(() => {
    const id = window.setInterval(() => {
      setDots((d) => (d.length >= 3 ? '' : `${d}.`));
    }, 400);
    const t = window.setTimeout(() => {
      router.replace(next);
    }, 2200);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(t);
    };
  }, [next, router]);

  return (
    <div className="min-h-screen bg-birgen-black flex flex-col items-center justify-center px-6">
      <div className="relative w-20 h-20 mb-10">
        <div className="absolute inset-0 rounded-full border-2 border-birgen-red/30" />
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-birgen-red animate-spin" />
        <div
          className="absolute inset-3 rounded-full border border-white/10 animate-pulse"
          style={{ animationDuration: '1.4s' }}
        />
      </div>
      <p className="font-display text-3xl sm:text-4xl text-white tracking-[0.2em] uppercase text-center">
        Loading{dots}
      </p>
      <p className="mt-4 text-birgen-silver text-sm text-center max-w-xs">
        Preparing your home screen with trailers and Kenyan picks.
      </p>
    </div>
  );
}

export default function EnteringPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-birgen-black flex items-center justify-center">
          <div className="w-12 h-12 rounded-full border-2 border-birgen-red border-t-transparent animate-spin" />
        </div>
      }
    >
      <EnteringInner />
    </Suspense>
  );
}
