import { NextResponse } from 'next/server';
import { syncStkTransaction } from '@/lib/mpesa/syncTransaction';
import { getSupabaseServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

interface StkCallbackBody {
  Body?: {
    stkCallback?: {
      MerchantRequestID?: string;
      CheckoutRequestID?: string;
      ResultCode?: number;
      ResultDesc?: string;
    };
  };
}

export async function POST(request: Request) {
  const service = getSupabaseServiceClient();

  let body: StkCallbackBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ResultCode: 0, ResultDesc: 'Accepted' },
      { headers: { 'Content-Type': 'application/json' } },
    );
  }

  const stk = body.Body?.stkCallback;
  const checkoutRequestID = stk?.CheckoutRequestID;
  const merchantRequestID = stk?.MerchantRequestID;
  const resultCode = stk?.ResultCode;
  const resultDesc = stk?.ResultDesc ?? null;

  if (!checkoutRequestID) {
    return NextResponse.json(
      { ResultCode: 0, ResultDesc: 'Accepted' },
      { headers: { 'Content-Type': 'application/json' } },
    );
  }

  if (!service) {
    return NextResponse.json(
      { ResultCode: 0, ResultDesc: 'Accepted' },
      { headers: { 'Content-Type': 'application/json' } },
    );
  }

  if (service && merchantRequestID) {
    await service
      .from('mpesa_stk_transactions')
      .update({ merchant_request_id: merchantRequestID, updated_at: new Date().toISOString() })
      .eq('checkout_request_id', checkoutRequestID);
  }

  if (service && typeof resultCode === 'number') {
    if (resultCode === 0) {
      await syncStkTransaction(service, checkoutRequestID, {
        resultCode,
        resultDesc,
        outcome: 'success',
      });
    } else {
      await syncStkTransaction(service, checkoutRequestID, {
        resultCode,
        resultDesc,
        outcome: 'failed',
      });
    }
  }

  return NextResponse.json(
    { ResultCode: 0, ResultDesc: 'Success' },
    { headers: { 'Content-Type': 'application/json' } },
  );
}
