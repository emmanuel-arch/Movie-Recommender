'use client';

/**
 * UpgradeWall (Movies) — full-screen, non-dismissible gateway shown when the
 * 14-day free trial lapses OR the 3-hour free watch-time cap is hit. Mobile-first.
 * The CTA hands off to the Hub's centralized /transact?plan=basic checkout via
 * moviesPremiumCheckoutUrl, returning here once paid (entitlement then clears it).
 */

import { Sparkles, Check, Lock } from 'lucide-react';
import { moviesPremiumCheckoutUrl } from '@/lib/premiumCheckout';

const BASIC_FEATURES = [
  'Unlimited, ad-free streaming — full HD',
  'Your AI assistant + market & database tools',
  'Access to the entire BirgenAI Suite',
  'Continue watching across devices',
] as const;

export default function UpgradeWall({ reason }: { reason: 'trial-ended' | 'watchtime' }) {
  const title = reason === 'watchtime' ? 'You’ve used your free 3 hours' : 'Your free trial has ended';
  const sub =
    reason === 'watchtime'
      ? 'That’s the free monthly watch-time on BirgenAI Movies. Upgrade to Basic for unlimited, ad-free streaming and the full Suite.'
      : 'Your 14-day free trial is over. Upgrade to Basic to keep streaming and unlock the full BirgenAI Suite.';

  const upgrade = () => {
    const ret = typeof window !== 'undefined' ? window.location.href : undefined;
    window.location.href = moviesPremiumCheckoutUrl(ret);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/85 p-4 backdrop-blur-md">
      <div className="my-auto w-full max-w-md rounded-2xl border border-white/10 bg-gradient-to-b from-[#1a1a1a] to-black p-6 shadow-2xl sm:p-8">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-birgen-red/15 ring-1 ring-birgen-red/40">
          <Lock className="h-6 w-6 text-birgen-red" />
        </div>

        <h2 className="text-center text-2xl font-bold text-white">{title}</h2>
        <p className="mx-auto mt-2 max-w-sm text-center text-sm leading-relaxed text-white/65">{sub}</p>

        <div className="mt-6 rounded-xl border border-birgen-red/30 bg-gradient-to-b from-birgen-red/10 to-white/[0.02] p-5">
          <div className="flex items-baseline justify-between">
            <span className="text-lg font-bold text-white">Basic</span>
            <span>
              <span className="text-sm text-white/40 line-through">KSh 149</span>{' '}
              <span className="text-2xl font-bold text-white">KSh 99</span>
              <span className="text-sm text-white/60">/mo</span>
            </span>
          </div>
          <ul className="mt-4 space-y-2.5">
            {BASIC_FEATURES.map((f, i) => (
              <li key={f} className="flex items-start gap-2 text-[13px] text-white/85">
                <Check className={`mt-0.5 h-4 w-4 shrink-0 ${i === 0 ? 'text-birgen-red' : 'text-green-400'}`} />
                <span className={i === 0 ? 'font-medium text-white' : ''}>{f}</span>
              </li>
            ))}
          </ul>
        </div>

        <button
          onClick={upgrade}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-birgen-red py-3.5 text-[15px] font-bold text-white shadow-lg transition hover:bg-birgen-red-light active:scale-[0.99]"
        >
          <Sparkles className="h-4 w-4" />
          Upgrade to Basic — pay with M-PESA
        </button>

        <p className="mt-4 text-center text-[11px] text-white/40">
          One subscription unlocks every BirgenAI app · cancel anytime
        </p>
      </div>
    </div>
  );
}
