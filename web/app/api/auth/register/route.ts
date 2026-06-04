import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { UserRole, UserTier, SubscriptionStatus } from '@prisma/client';
import { getSupabaseServiceClient } from '@/lib/supabase/server';

/**
 * POST /api/auth/register — Movies account creation.
 *
 * Dual-writes to keep IDs aligned with the rest of BirgenAI:
 *   1. Create the Supabase `auth.users` row (admin, email pre-confirmed) →
 *      yields the canonical user UUID and fires `handle_new_user()`, which
 *      mints the BirgenAI ID into `public.profiles.birgenai_id`.
 *   2. Create the Prisma `User` row with `id = <that same UUID>` so NextAuth
 *      sessions, watching_profiles, watch_sessions, … all share one id space.
 *
 * Lean by design (no phone / free-trial / enterprise / promo plumbing) to match
 * the Netflix-style email+password signup. Heavier flows live on birgenai.com.
 */
export async function POST(request: NextRequest) {
  try {
    const { name, email: emailInput, password } = await request.json();

    if (!emailInput || !password) {
      return NextResponse.json({ message: 'Email and password are required.' }, { status: 400 });
    }
    if (String(password).length < 6) {
      return NextResponse.json(
        { message: 'Password must be at least 6 characters long.' },
        { status: 400 },
      );
    }

    const email = String(emailInput).trim().toLowerCase();
    const displayName = (name && String(name).trim()) || email.split('@')[0];

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { message: 'An account with this email already exists. Sign in instead.' },
        { status: 409 },
      );
    }

    const supabase = getSupabaseServiceClient();
    if (!supabase) {
      return NextResponse.json(
        { message: 'Account provisioning is not configured (missing Supabase service role).' },
        { status: 503 },
      );
    }

    // 1) Supabase auth user (canonical UUID + BirgenAI-ID trigger).
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: displayName },
    });

    if (authError || !authData?.user?.id) {
      const msg = authError?.message?.toLowerCase() ?? '';
      if (msg.includes('already') || msg.includes('registered') || msg.includes('exists') || authError?.status === 422) {
        return NextResponse.json(
          { message: 'This email is already registered with BirgenAI. Sign in instead.' },
          { status: 409 },
        );
      }
      console.error('Supabase admin.createUser error:', authError);
      return NextResponse.json(
        { message: authError?.message || 'Could not create account.' },
        { status: 502 },
      );
    }

    const userId = authData.user.id;

    // Wait for the trigger to mint the BirgenAI ID.
    let birgenAiId: string | null = null;
    for (let i = 0; i < 12; i++) {
      const { data: row } = await supabase
        .from('profiles')
        .select('birgenai_id')
        .eq('id', userId)
        .maybeSingle();
      const bid = (row as { birgenai_id?: string } | null)?.birgenai_id;
      if (bid) {
        birgenAiId = bid;
        break;
      }
      await new Promise((r) => setTimeout(r, 120));
    }

    // 2) Prisma user with the SAME id.
    const hashedPassword = await bcrypt.hash(password, 12);
    try {
      await prisma.user.create({
        data: {
          id: userId,
          name: displayName,
          email,
          hashedPassword,
          birgenAiId,
          role: UserRole.INDIVIDUAL,
          tier: UserTier.FREE,
          subscriptionStatus: SubscriptionStatus.INACTIVE,
        },
      });
    } catch (err) {
      // Roll back the Supabase auth user so the two stores never drift.
      await supabase.auth.admin.deleteUser(userId).catch(() => {});
      if ((err as { code?: string })?.code === 'P2002') {
        return NextResponse.json(
          { message: 'An account with this email already exists. Sign in instead.' },
          { status: 409 },
        );
      }
      console.error('Prisma create user error:', err);
      return NextResponse.json({ message: 'Could not create account.' }, { status: 500 });
    }

    return NextResponse.json({ message: 'Account created', birgenAiId }, { status: 201 });
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
