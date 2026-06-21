import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getEntitlement } from '@/lib/entitlement';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/entitlement — the authoritative, always-fresh Premium check for the
 * signed-in user. Read from the shared User row (see lib/entitlement.ts), never
 * cached, so it reflects a KSh 99 upgrade the instant the wallet callback settles.
 *
 * Fails OPEN: if the DB read errors we return { isPremium:false, error:true } and
 * the client gate declines to enforce the cap on `error`, so an infra hiccup can
 * never wrongly paywall a paying user (a free user briefly slipping past the cap
 * during an outage is the acceptable side of that trade).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { authenticated: false, isPremium: false, premiumUntil: null, subscriptionStatus: null, tier: null },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const ent = await getEntitlement(session.user.id);
    return NextResponse.json(
      { authenticated: true, error: false, ...ent },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    console.error('[entitlement] read failed:', e);
    return NextResponse.json(
      { authenticated: true, error: true, isPremium: false, premiumUntil: null, subscriptionStatus: null, tier: null },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
