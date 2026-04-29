import { NextResponse } from 'next/server';
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server';
import { generateSixDigitOtp, hashOtp } from '@/lib/otp';
import { sendOtpEmail } from '@/lib/mail/sendOtpEmail';

export const runtime = 'nodejs';

const OTP_TTL_MS = 10 * 60 * 1000;

/** POST — send or resend OTP to the authenticated user's email (Zoho SMTP). */
export async function POST() {
  const userClient = getSupabaseServerClient();
  const service = getSupabaseServiceClient();

  if (!userClient || !service) {
    return NextResponse.json({ error: 'Server auth is not configured.' }, { status: 503 });
  }

  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser();

  if (userErr || !user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await userClient
    .from('profiles')
    .select('otp_verified_at, display_name')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.otp_verified_at) {
    return NextResponse.json({ error: 'Already verified' }, { status: 400 });
  }

  const code = generateSixDigitOtp();
  const codeHash = hashOtp(code);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();

  await service.from('email_otp_challenges').delete().eq('user_id', user.id);

  const { error: insErr } = await service.from('email_otp_challenges').insert({
    user_id: user.id,
    code_hash: codeHash,
    expires_at: expiresAt,
  });

  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  try {
    await sendOtpEmail({
      to: user.email,
      code,
      displayName: profile?.display_name ?? user.user_metadata?.display_name ?? null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to send email';
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ ok: true, expiresInSeconds: OTP_TTL_MS / 1000 });
}
