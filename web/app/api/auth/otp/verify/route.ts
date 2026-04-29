import { NextResponse } from 'next/server';
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server';
import { hashOtp } from '@/lib/otp';

export const runtime = 'nodejs';

/** POST — verify OTP and mark profile as verified (sets otp_verified_at). */
export async function POST(request: Request) {
  const userClient = getSupabaseServerClient();
  const service = getSupabaseServiceClient();

  if (!userClient || !service) {
    return NextResponse.json({ error: 'Server auth is not configured.' }, { status: 503 });
  }

  let body: { code?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const raw = typeof body.code === 'string' ? body.code.trim().replace(/\s+/g, '') : '';
  if (!/^\d{6}$/.test(raw)) {
    return NextResponse.json({ error: 'Enter the 6-digit code from your email.' }, { status: 400 });
  }

  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser();

  if (userErr || !user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const hash = hashOtp(raw);

  const { data: rows, error: selErr } = await service
    .from('email_otp_challenges')
    .select('id, expires_at')
    .eq('user_id', user.id)
    .eq('code_hash', hash)
    .order('created_at', { ascending: false })
    .limit(1);

  if (selErr || !rows?.length) {
    return NextResponse.json({ error: 'Invalid or expired code.' }, { status: 400 });
  }

  const row = rows[0]!;
  const exp = new Date(row.expires_at).getTime();
  if (Date.now() > exp) {
    await service.from('email_otp_challenges').delete().eq('id', row.id);
    return NextResponse.json({ error: 'Code expired. Request a new one.' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { error: upErr } = await service
    .from('profiles')
    .update({ otp_verified_at: now, updated_at: now })
    .eq('id', user.id);

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  await service.from('email_otp_challenges').delete().eq('user_id', user.id);

  return NextResponse.json({ ok: true });
}
