'use client';

/**
 * TrialBanner (Movies) — gentle dismissible "N days left in your free trial" pill
 * shown DURING an active trial, the soft nudge before the hard UpgradeWall. CTA
 * hands off to the Hub /transact?plan=basic checkout. Dismissal lasts the browser
 * session and returns as the day count drops. Hidden on anon/marketing routes.
 */

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Sparkles, X } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useEntitlement } from '@/hooks/useEntitlement';
import { moviesPremiumCheckoutUrl } from '@/lib/premiumCheckout';

const SKIP_PREFIXES = ['/welcome', '/login', '/signup', '/auth'];

export function TrialBanner() {
  const { user } = useAuth();
  const pathname = usePathname() || '/';
  const { isPremium, onTrial, trialDaysLeft, loading, error } = useEntitlement();
  const [dismissed, setDismissed] = useState(true);

  const key = `birgenai:trial-banner-dismissed:${trialDaysLeft}`;
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setDismissed(sessionStorage.getItem(key) === '1');
  }, [key]);

  const skip = SKIP_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!user || skip || isPremium || loading || error || !onTrial || dismissed) return null;

  const urgent = trialDaysLeft <= 1;
  const soon = trialDaysLeft <= 3;
  const accent = urgent
    ? 'border-red-500/40 from-red-500/20'
    : soon
      ? 'border-amber-500/40 from-amber-500/20'
      : 'border-birgen-red/30 from-birgen-red/15';
  const label =
    trialDaysLeft <= 0
      ? 'Last day of your free trial'
      : `${trialDaysLeft} day${trialDaysLeft === 1 ? '' : 's'} left in your free trial`;

  const upgrade = () => {
    const ret = typeof window !== 'undefined' ? window.location.href : undefined;
    window.location.href = moviesPremiumCheckoutUrl(ret);
  };

  return (
    <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 pointer-events-none">
      <div
        className={`pointer-events-auto flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-full border bg-gradient-to-r ${accent} to-black/80 px-4 py-2 shadow-2xl backdrop-blur-xl`}
      >
        <Sparkles className={`h-4 w-4 shrink-0 ${urgent ? 'text-red-400' : soon ? 'text-amber-400' : 'text-birgen-red'}`} />
        <span className="truncate text-[13px] font-medium text-white">{label}</span>
        <button
          onClick={upgrade}
          className="shrink-0 rounded-full bg-white px-3 py-1 text-[12px] font-bold text-black transition hover:bg-white/90"
        >
          Upgrade
        </button>
        <button
          onClick={() => {
            try {
              sessionStorage.setItem(key, '1');
            } catch {
              /* ignore */
            }
            setDismissed(true);
          }}
          aria-label="Dismiss"
          className="shrink-0 text-white/50 transition hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export default TrialBanner;
