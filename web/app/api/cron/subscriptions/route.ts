import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PREMIUM_GRACE_MS } from '@/lib/entitlement';
import { getSupabaseServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Subscription lifecycle + anti-churn nudges. Runs daily (Vercel Cron → GET, with
 * Authorization: Bearer ${CRON_SECRET}). Idempotent and safe to re-run.
 *
 * Per run, on the SHARED User table:
 *   • ACTIVE & past its end date        → GRACE_PERIOD   (+ "renew" nudge)
 *   • GRACE_PERIOD & past end+grace      → EXPIRED        (+ win-back nudge)
 *   • ACTIVE & ending within 3 days      → "renews soon" nudge
 *
 * ACCESS is not governed here — lib/entitlement.ts gives a 48h grace buffer so a
 * lapse is seamless regardless of when this last ran. This job only relabels the
 * status (for reporting) and queues notifications (idempotent per month via the
 * notifications (user_id, type, month) unique index).
 *
 * CTAs point at /upgrade, which hands off to the centralized wallet checkout.
 */

const RENEWAL_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return (req.headers.get('authorization') ?? '') === `Bearer ${secret}`;
}

function monthStart(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

type Notif = { user_id: string; type: string; title: string; message: string; cta_url: string; cta_label: string; month: string };

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const graceCutoff = new Date(now.getTime() - PREMIUM_GRACE_MS); // GRACE older than this has fully lapsed
  const renewSoon = new Date(now.getTime() + RENEWAL_WINDOW_MS);
  const month = monthStart();
  const notifs: Notif[] = [];

  // 1. ACTIVE past its paid end → GRACE_PERIOD (access still covered by the buffer).
  const lapsing = await prisma.user.findMany({
    where: { subscriptionStatus: 'ACTIVE', subscriptionEndAt: { lt: now } },
    select: { id: true },
  });
  if (lapsing.length) {
    await prisma.user.updateMany({
      where: { subscriptionStatus: 'ACTIVE', subscriptionEndAt: { lt: now } },
      data: { subscriptionStatus: 'GRACE_PERIOD' },
    });
    for (const u of lapsing) {
      notifs.push({
        user_id: u.id,
        type: 'subscription_grace',
        title: 'Your Premium just lapsed',
        message: "We've kept your unlimited streaming on for a little longer. Renew for KSh 99 to keep it going.",
        cta_url: '/upgrade',
        cta_label: 'Renew · KSh 99',
        month,
      });
    }
  }

  // 2. GRACE_PERIOD past end + grace → EXPIRED (access ends now).
  const expiring = await prisma.user.findMany({
    where: { subscriptionStatus: 'GRACE_PERIOD', subscriptionEndAt: { lt: graceCutoff } },
    select: { id: true },
  });
  if (expiring.length) {
    await prisma.user.updateMany({
      where: { subscriptionStatus: 'GRACE_PERIOD', subscriptionEndAt: { lt: graceCutoff } },
      data: { subscriptionStatus: 'EXPIRED', autoRenew: false },
    });
    for (const u of expiring) {
      notifs.push({
        user_id: u.id,
        type: 'subscription_winback',
        title: 'Pick up where you left off',
        message: 'Your Premium has ended. Unlock unlimited, ad-free streaming again for KSh 99/month.',
        cta_url: '/upgrade',
        cta_label: 'Go Premium',
        month,
      });
    }
  }

  // 3. ACTIVE ending within the renewal window → "renews soon" nudge.
  const renewing = await prisma.user.findMany({
    where: { subscriptionStatus: 'ACTIVE', subscriptionEndAt: { gte: now, lte: renewSoon } },
    select: { id: true },
  });
  for (const u of renewing) {
    notifs.push({
      user_id: u.id,
      type: 'subscription_renewal',
      title: 'Your Premium renews soon',
      message: "Your month of unlimited streaming is almost up. Renew for KSh 99 so there's no interruption.",
      cta_url: '/upgrade',
      cta_label: 'Renew · KSh 99',
      month,
    });
  }

  // Queue notifications — idempotent per (user_id, type, month). Tolerate failures
  // (e.g. a legacy non-uuid id that isn't in auth.users) without failing the run.
  let queued = 0;
  const supabase = getSupabaseServiceClient();
  if (supabase && notifs.length) {
    const { error } = await supabase
      .from('notifications')
      .upsert(notifs, { onConflict: 'user_id,type,month', ignoreDuplicates: true });
    if (error) console.error('[cron/subscriptions] notification upsert error:', error.message);
    else queued = notifs.length;
  }

  return NextResponse.json({
    ok: true,
    toGrace: lapsing.length,
    toExpired: expiring.length,
    renewingSoon: renewing.length,
    notificationsQueued: queued,
  });
}
