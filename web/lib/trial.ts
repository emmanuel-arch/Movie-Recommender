/**
 * lib/trial.ts — the freemium 14-day free-trial rule (Movies copy of the Hub's
 * lib/trial.ts; keep them in sync). Pure functions over the shared User row.
 *
 * In Movies the trial converges with the 3-hour free watch-time cap: the upgrade
 * wall shows when the trial window lapses OR the cap is hit. Both route to the
 * Hub /transact?plan=basic checkout.
 */

const ACTIVE_SUB = new Set(['ACTIVE', 'GRACE_PERIOD']);

export type TrialLike = {
  tier?: string | null;
  isOnFreeTrial?: boolean | null;
  freeTrialEndAt?: Date | string | null;
  subscriptionStatus?: string | null;
};

export interface TrialState {
  onTrial: boolean;
  isPaid: boolean;
  trialActive: boolean;
  mustUpgrade: boolean;
  endAt: string | null;
  daysLeft: number;
}

export function isPaid(u: TrialLike | null | undefined): boolean {
  if (!u) return false;
  return ACTIVE_SUB.has((u.subscriptionStatus ?? '').toUpperCase());
}

export function computeTrialState(u: TrialLike | null | undefined, now: Date = new Date()): TrialState {
  const paid = isPaid(u);
  const onTrial = Boolean(u?.isOnFreeTrial);
  const end = u?.freeTrialEndAt ? new Date(u.freeTrialEndAt) : null;
  const endValid = end && !Number.isNaN(end.getTime());

  const withinWindow = Boolean(endValid && now.getTime() < end!.getTime());
  const trialActive = !paid && onTrial && withinWindow;
  const mustUpgrade = !paid && onTrial && (!endValid || now.getTime() >= end!.getTime());
  const daysLeft = endValid
    ? Math.max(0, Math.ceil((end!.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)))
    : 0;

  return {
    onTrial,
    isPaid: paid,
    trialActive,
    mustUpgrade,
    endAt: endValid ? end!.toISOString() : null,
    daysLeft,
  };
}
