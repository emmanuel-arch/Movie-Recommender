import { NextResponse } from 'next/server';
import { PREMIUM_MONTHLY_KES_PROMO } from '@/lib/billing';
import { darajaOAuthToken, stkPushRequest } from '@/lib/mpesa/daraja';
import { loadMpesaConfig } from '@/lib/mpesa/loadConfig';
import { formatKenyaPhone254, isValidKenya254 } from '@/lib/mpesa/phone';
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/** Sanity check: opening this URL in the browser sends GET; STK only runs on POST. */
export async function GET() {
  const cfg = loadMpesaConfig();
  const hasUrl = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const hasAnon = Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const hasService = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const serverUser = getSupabaseServerClient();

  return NextResponse.json({
    ok: Boolean(cfg && serverUser && hasService),
    route: '/api/payments/stk-push',
    note: 'Use POST from the app with JSON { "phoneNumber": "07..." or "2547..." } while signed in.',
    darajaConfigured: Boolean(cfg),
    supabaseConfigured: hasUrl && hasAnon && hasService,
    premiumAmountKes: PREMIUM_MONTHLY_KES_PROMO,
    missing: [
      !cfg ? 'M-PESA env (consumer key/secret, shortcode, passkey, callback URL)' : null,
      !hasUrl ? 'NEXT_PUBLIC_SUPABASE_URL' : null,
      !hasAnon ? 'NEXT_PUBLIC_SUPABASE_ANON_KEY' : null,
      !hasService ? 'SUPABASE_SERVICE_ROLE_KEY' : null,
      !serverUser ? 'Supabase server client not available (URL + anon key)' : null,
    ].filter(Boolean),
  });
}

function isMissingPaymentsTable(code: string | undefined, msg: string | undefined): boolean {
  return (
    code === 'PGRST205' ||
    (typeof msg === 'string' &&
      /Could not find the table.*mpesa_stk_transactions|schema cache/i.test(msg))
  );
}

/** Legacy table shape (checkout PK NOT NULL only) incompatible with intent-first insert. */
function needsMpesaLegacyMigration(code: string | undefined, msg: string | undefined): boolean {
  if (typeof code === 'string' && (code === '42703' || code === '23502')) return true;
  if (typeof msg !== 'string') return false;
  const l = msg.toLowerCase();
  return (
    l.includes('checkout_request_id') &&
    (l.includes('violates not-null') || l.includes('not-null constraint') || l.includes('undefined column'))
  );
}

function paymentsMisconfiguredPayload() {
  return {
    error:
      "Payments table missing or invisible. Run infra/supabase/04_mpesa_stk_transactions.sql in Supabase SQL, then NOTIFY pgrst, 'reload schema';.",
  };
}

function paymentsLegacyMigrationPayload() {
  return {
    error:
      'Payments table shape is outdated. In Supabase SQL Editor run infra/supabase/05_mpesa_stk_table_upgrade_legacy.sql (safely adds id + nullable checkout), then NOTIFY pgrst, \'reload schema\';. Or drop public.mpesa_stk_transactions (no payments to keep), then rerun 04.',
  };
}

export async function POST(request: Request) {
  const cfg = loadMpesaConfig();
  const userClient = getSupabaseServerClient();
  const service = getSupabaseServiceClient();

  if (!cfg || !userClient || !service) {
    return NextResponse.json(
      { error: 'Payments are not configured (M-Pesa or Supabase).' },
      { status: 503 },
    );
  }

  let body: { phoneNumber?: string; amount?: number; planName?: string; planCredits?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const amount = PREMIUM_MONTHLY_KES_PROMO;

  const phone = typeof body.phoneNumber === 'string' ? formatKenyaPhone254(body.phoneNumber) : '';
  if (!isValidKenya254(phone)) {
    return NextResponse.json({ error: 'Invalid phone number.' }, { status: 400 });
  }

  const {
    data: { user },
    error: authErr,
  } = await userClient.auth.getUser();

  if (authErr || !user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await userClient
    .from('profiles')
    .select('plan')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.plan === 'premium') {
    return NextResponse.json({ error: 'Already on Premium.' }, { status: 400 });
  }

  /* Use select('*'): returning only 'id' errors with 42703 on legacy rows that lack column id */
  const { data: intentRow, error: intentErr } = await service
    .from('mpesa_stk_transactions')
    .insert({
      user_id: user.id,
      amount,
      status: 'pending',
    })
    .select('*')
    .single();

  if (intentErr) {
    console.error('[mpesa] insert intent', intentErr);

    if (isMissingPaymentsTable(intentErr.code, intentErr.message)) {
      return NextResponse.json(paymentsMisconfiguredPayload(), { status: 503 });
    }
    if (needsMpesaLegacyMigration(intentErr.code, intentErr.message)) {
      return NextResponse.json(paymentsLegacyMigrationPayload(), { status: 503 });
    }
    return NextResponse.json(
      {
        error: intentErr.message || 'Could not start payment intent.',
        code: intentErr.code,
      },
      { status: 500 },
    );
  }

  const intentId = intentRow?.id as string | undefined;
  if (!intentId || typeof intentId !== 'string') {
    console.error('[mpesa] insert intent missing uuid id column', intentRow);
    return NextResponse.json(paymentsLegacyMigrationPayload(), { status: 503 });
  }

  let token: string;
  try {
    token = await darajaOAuthToken({
      baseUrl: cfg.baseUrl,
      consumerKey: cfg.consumerKey,
      consumerSecret: cfg.consumerSecret,
    });
  } catch (e) {
    await service.from('mpesa_stk_transactions').delete().eq('id', intentId);
    console.error('[mpesa] oauth', e);
    return NextResponse.json({ error: 'Could not reach M-Pesa.' }, { status: 502 });
  }

  let stk: Awaited<ReturnType<typeof stkPushRequest>>;
  try {
    stk = await stkPushRequest({
      baseUrl: cfg.baseUrl,
      accessToken: token,
      passkey: cfg.passkey,
      payload: {
        businessShortCode: cfg.businessShortCode,
        amount,
        phoneDigits254: phone,
        callbackUrl: cfg.callbackUrl,
        accountReference: cfg.accountReference,
        transactionDesc: 'Premium month',
        transactionType: cfg.transactionType,
        partyB: cfg.partyB,
      },
    });
  } catch (e) {
    await service.from('mpesa_stk_transactions').delete().eq('id', intentId);
    console.error('[mpesa] stk push exception', e);
    return NextResponse.json({ error: 'Unexpected error calling M-Pesa.' }, { status: 502 });
  }

  if (stk.ResponseCode !== '0' || !stk.CheckoutRequestID) {
    await service.from('mpesa_stk_transactions').delete().eq('id', intentId);
    const msg =
      stk.CustomerMessage ??
      stk.errorMessage ??
      stk.ResponseDescription ??
      'STK initiation failed.';
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const merchantId = stk.MerchantRequestID ?? '';
  const checkoutId = stk.CheckoutRequestID;

  const { error: finalizeErr } = await service
    .from('mpesa_stk_transactions')
    .update({
      checkout_request_id: checkoutId,
      merchant_request_id: merchantId || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', intentId);

  if (finalizeErr) {
    console.error('[mpesa] finalize txn', finalizeErr);
    return NextResponse.json(
      {
        error:
          'M-PESA accepted the prompt but storing the transaction failed — check mpesa_stk_transactions schema/migrations.',
        checkoutRequestID: checkoutId,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    checkoutRequestID: checkoutId,
    merchantRequestID: merchantId,
    safaricomInitHint: stk.CustomerMessage ?? stk.ResponseDescription ?? null,
  });
}
