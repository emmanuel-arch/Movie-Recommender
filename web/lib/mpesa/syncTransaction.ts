import type { SupabaseClient } from '@supabase/supabase-js';

export async function syncStkTransaction(
  service: SupabaseClient,
  checkoutRequestId: string,
  patch: {
    resultCode: number | null;
    resultDesc: string | null;
    outcome: 'success' | 'failed';
  },
): Promise<{ ok: boolean; reason?: string; already?: boolean }> {
  const { data: row, error: selErr } = await service
    .from('mpesa_stk_transactions')
    .select('user_id,status')
    .eq('checkout_request_id', checkoutRequestId)
    .maybeSingle();

  if (selErr || !row) {
    return { ok: false, reason: selErr?.message ?? 'not_found' };
  }

  if (row.status === 'success' && patch.outcome === 'success') {
    return { ok: true, already: true };
  }

  const now = new Date().toISOString();

  if (patch.outcome === 'success') {
    const { error: txErr } = await service
      .from('mpesa_stk_transactions')
      .update({
        status: 'success',
        result_code: patch.resultCode,
        result_desc: patch.resultDesc,
        updated_at: now,
      })
      .eq('checkout_request_id', checkoutRequestId);

    if (txErr) return { ok: false, reason: txErr.message };

    const { error: profErr } = await service
      .from('profiles')
      .update({ plan: 'premium', updated_at: now })
      .eq('id', row.user_id);

    if (profErr) return { ok: false, reason: profErr.message };
    return { ok: true };
  }

  if (row.status === 'pending') {
    await service
      .from('mpesa_stk_transactions')
      .update({
        status: 'failed',
        result_code: patch.resultCode,
        result_desc: patch.resultDesc,
        updated_at: now,
      })
      .eq('checkout_request_id', checkoutRequestId);
  }

  return { ok: true };
}
