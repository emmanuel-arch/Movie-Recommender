import { NextResponse } from 'next/server';
import { darajaOAuthToken, stkPushQuery } from '@/lib/mpesa/daraja';
import { loadMpesaConfig } from '@/lib/mpesa/loadConfig';
import {
  stkQueryDescriptionAmbiguous,
  stkQueryEnvelopeOk,
  stkQueryIndicatesDefinitePaymentFailure,
} from '@/lib/mpesa/stkQueryInterpretation';
import { syncStkTransaction } from '@/lib/mpesa/syncTransaction';
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

function parseResultCode(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function GET(request: Request) {
  const cfg = loadMpesaConfig();
  const userClient = getSupabaseServerClient();
  const service = getSupabaseServiceClient();

  if (!cfg || !userClient || !service) {
    return NextResponse.json({ error: 'Payments are not configured.' }, { status: 503 });
  }

  const url = new URL(request.url);
  const checkoutRequestID = url.searchParams.get('checkoutRequestID')?.trim();
  if (!checkoutRequestID) {
    return NextResponse.json({ error: 'checkoutRequestID required' }, { status: 400 });
  }

  const {
    data: { user },
    error: authErr,
  } = await userClient.auth.getUser();

  if (authErr || !user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: row } = await service
    .from('mpesa_stk_transactions')
    .select('status, user_id')
    .eq('checkout_request_id', checkoutRequestID)
    .maybeSingle();

  if (!row || row.user_id !== user.id) {
    return NextResponse.json({ status: 'NOT_FOUND', message: 'Transaction not found.' });
  }

  if (row.status === 'success') {
    return NextResponse.json({ status: 'SUCCESS' });
  }

  if (row.status === 'failed') {
    return NextResponse.json({ status: 'FAILED', message: 'Payment was not completed.' });
  }

  let token: string;
  try {
    token = await darajaOAuthToken({
      baseUrl: cfg.baseUrl,
      consumerKey: cfg.consumerKey,
      consumerSecret: cfg.consumerSecret,
    });
  } catch (e) {
    console.error('[mpesa] oauth (poll)', e);
    return NextResponse.json({ status: 'PENDING' });
  }

  const q = await stkPushQuery({
    baseUrl: cfg.baseUrl,
    accessToken: token,
    passkey: cfg.passkey,
    businessShortCode: cfg.businessShortCode,
    checkoutRequestID,
  });

  if (process.env.NODE_ENV === 'development') {
    console.log('[mpesa] stk query', checkoutRequestID, JSON.stringify(q));
  }

  if (q.errorCode || q.errorMessage) {
    return NextResponse.json({ status: 'PENDING' });
  }

  if (!stkQueryEnvelopeOk(q)) {
    console.warn('[mpesa] stk query outer ResponseCode', q.ResponseCode, q.ResponseDescription);
    return NextResponse.json({ status: 'PENDING' });
  }

  const rc = parseResultCode(q.ResultCode);
  const desc = q.ResultDesc ?? '';

  if (rc === 0) {
    await syncStkTransaction(service, checkoutRequestID, {
      resultCode: rc,
      resultDesc: desc || null,
      outcome: 'success',
    });
    return NextResponse.json({ status: 'SUCCESS' });
  }

  /** Safaricom often returns this right after initiate or with routing noise — not a final user failure. */
  if (stkQueryDescriptionAmbiguous(desc)) {
    return NextResponse.json({ status: 'PENDING' });
  }

  const treatAsPending =
    rc === null ||
    rc === 1032 ||
    rc === 1063 ||
    rc === 4999 ||
    rc === 2029 ||
    desc.toLowerCase().includes('still');

  if (treatAsPending) {
    return NextResponse.json({ status: 'PENDING' });
  }

  if (stkQueryIndicatesDefinitePaymentFailure(rc, desc)) {
    await syncStkTransaction(service, checkoutRequestID, {
      resultCode: rc,
      resultDesc: desc || null,
      outcome: 'failed',
    });
    return NextResponse.json({
      status: 'FAILED',
      message: desc || 'Payment was cancelled or failed.',
    });
  }

  /** Unknown non-zero result — keep polling until timeout or callback updates the row. */
  return NextResponse.json({ status: 'PENDING' });
}
