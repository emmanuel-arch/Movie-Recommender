/**
 * lib/entitlement.ts — the single source of truth for "is this user Premium?"
 * across BirgenAI Movies.
 *
 * SERVER-ONLY. It reads the SHARED `User` table (the same Postgres row the Hub
 * wallet writes on a successful KSh 99 payment), so a purchase made anywhere in
 * the suite entitles the user here with no syncing. Do not import this from a
 * client component — the `prisma` import would fail the client build (that is the
 * intended guard). Client code uses `useEntitlement()` -> /api/entitlement.
 *
 * Why NOT the NextAuth session `tier`: the JWT is minted at sign-in (see
 * auth.config.ts) and never refreshed mid-session, so right after a user upgrades
 * their session still says FREE until they log in again. And the historical check
 * `profile.plan === 'premium'` compared the UPPERCASE `UserTier` enum ('PREMIUM')
 * against lowercase 'premium', so it was effectively always false. Entitlement
 * must therefore be read fresh from the DB, and keyed on the subscription WINDOW.
 */

import { prisma } from '@/lib/prisma';
import { computeTrialState } from '@/lib/trial';

export interface Entitlement {
  isPremium: boolean;
  /** ISO timestamp the current premium window ends, or null if none/non-expiring. */
  premiumUntil: string | null;
  subscriptionStatus: string | null;
  tier: string | null;
  /** Freemium trial: true once the 14-day window lapses unpaid (the 14-day gate). */
  trialExpired: boolean;
  /** On an active (unlapsed) free trial. */
  onTrial: boolean;
  /** Whole days left in the trial (0 once expired). */
  trialDaysLeft: number;
}

/** Just the fields the rule needs — accepts a Prisma row or any equivalent shape. */
export type SubscriptionLike = {
  tier?: string | null;
  subscriptionStatus?: string | null;
  subscriptionEndAt?: Date | string | null;
};

/**
 * Statuses that grant access. GRACE_PERIOD is included on purpose: a just-lapsed
 * payer keeps watching during the short dunning window (anti-churn) — the
 * Phase 3 lifecycle job flips them to EXPIRED when the grace ends.
 */
const ACTIVE_STATUSES = new Set(['ACTIVE', 'GRACE_PERIOD']);

/**
 * Access lingers this long past the paid end date — a quiet anti-churn grace so a
 * lapse never abruptly cuts a viewer off mid-renewal. The lifecycle cron
 * (/api/cron/subscriptions) relabels the status (ACTIVE → GRACE_PERIOD → EXPIRED)
 * and sends the renewal/win-back nudges, but ACCESS itself is governed here so it
 * stays correct no matter when the cron last ran (daily granularity can't create a
 * gap where a just-lapsed payer briefly loses access then regains it).
 */
export const PREMIUM_GRACE_MS = 48 * 60 * 60 * 1000;

/**
 * Pure entitlement rule: Premium iff the user has an ACTIVE/GRACE subscription
 * whose window (plus the grace buffer) has not lapsed. We deliberately do NOT
 * trust `tier` alone — it is shared across suite products and could leave someone
 * "premium forever" if a tier were left set after expiry. Keying on the window
 * means entitlement self-expires by date even if the lifecycle cron hasn't run.
 */
export function computeIsPremium(u: SubscriptionLike | null | undefined, now: Date = new Date()): boolean {
  if (!u) return false;
  const status = (u.subscriptionStatus ?? '').toUpperCase();
  if (!ACTIVE_STATUSES.has(status)) return false; // INACTIVE / CANCELLED / EXPIRED / PAST_DUE
  if (!u.subscriptionEndAt) return true; // active with no end date => non-expiring
  const end = u.subscriptionEndAt instanceof Date ? u.subscriptionEndAt : new Date(u.subscriptionEndAt);
  if (Number.isNaN(end.getTime())) return true; // unparseable but active => don't lock out a payer
  return now.getTime() <= end.getTime() + PREMIUM_GRACE_MS;
}

/** Authoritative read of a user's Movies entitlement from the shared User row. */
export async function getEntitlement(userId: string): Promise<Entitlement> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      tier: true,
      subscriptionStatus: true,
      subscriptionEndAt: true,
      isOnFreeTrial: true,
      freeTrialEndAt: true,
    },
  });
  const trial = computeTrialState(u);
  return {
    isPremium: computeIsPremium(u),
    premiumUntil: u?.subscriptionEndAt ? new Date(u.subscriptionEndAt).toISOString() : null,
    subscriptionStatus: u?.subscriptionStatus ?? null,
    tier: u?.tier ?? null,
    trialExpired: trial.mustUpgrade,
    onTrial: trial.trialActive,
    trialDaysLeft: trial.daysLeft,
  };
}
