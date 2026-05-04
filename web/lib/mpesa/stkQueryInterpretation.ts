/** Interpret Safaricom STK Push Query payloads (fragile wording & codes vary by portal). */

export type StkQueryLike = {
  ResponseCode?: string;
  ResponseDescription?: string;
  ResultCode?: string;
  ResultDesc?: string;
  errorCode?: string;
  errorMessage?: string;
};

export function stkQueryEnvelopeOk(q: StkQueryLike): boolean {
  const outer = q.ResponseCode;
  if (outer === undefined || outer === '') return true;
  return String(outer) === '0';
}

/** Keep polling instead of flashing FAILED — avoids false negatives right after initiation. */
export function stkQueryDescriptionAmbiguous(desc: string): boolean {
  const d = desc.toLowerCase();
  return (
    d.includes('unresolved reason') ||
    d.includes('unresolved') ||
    d.includes('try again later') ||
    d.includes('system busy') ||
    d.includes('internal') ||
    d.includes('temporary')
  );
}

export function stkQueryIndicatesDefinitePaymentFailure(rc: number | null, desc: string): boolean {
  if (rc === 0) return false;
  const d = desc.toLowerCase();
  if (/cancel|canceled|cancelled|timed out|timeout|reject/.test(d)) return true;
  if (/wrong pin|invalid pin/.test(d)) return true;
  if (/insufficient funds|below minimum|below min(?:imum)? permitted/.test(d)) return true;
  return false;
}
