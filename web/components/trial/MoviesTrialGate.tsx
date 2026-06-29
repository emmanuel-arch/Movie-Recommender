'use client';

/**
 * MoviesTrialGate — mounts globally and shows the full-screen UpgradeWall when a
 * non-paying user hits EITHER freemium gate: the 14-day trial lapsed
 * (entitlement.trialExpired) or the 3-hour free watch-time cap (screen-time
 * isOverCap). Paying users never see it. Anonymous/marketing routes are skipped.
 */

import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { useEntitlement } from '@/hooks/useEntitlement';
import { useScreenTime } from '@/hooks/useScreenTime';
import UpgradeWall from './UpgradeWall';

// Routes that must never be walled (anon/marketing/auth).
const SKIP_PREFIXES = ['/welcome', '/login', '/signup', '/auth'];

export function MoviesTrialGate() {
  const { user } = useAuth();
  const pathname = usePathname() || '/';
  const { isPremium, trialExpired, error: entError, loading: entLoading } = useEntitlement();
  const { isOverCap } = useScreenTime();

  const skip = SKIP_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  // Fail closed only when we KNOW the user is gated; never wall while loading or on
  // an entitlement read error (mirrors the screen-time hook's "don't paywall payers").
  if (!user || skip || isPremium || entLoading || entError) return null;
  if (!trialExpired && !isOverCap) return null;

  return <UpgradeWall reason={isOverCap ? 'watchtime' : 'trial-ended'} />;
}

export default MoviesTrialGate;
