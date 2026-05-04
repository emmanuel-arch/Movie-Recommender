export type MpesaEnv = 'sandbox' | 'production';

export function darajaBaseUrl(env: MpesaEnv): string {
  return env === 'sandbox'
    ? 'https://sandbox.safaricom.co.ke'
    : 'https://api.safaricom.co.ke';
}

/** Lipa Na M-Pesa Online password field: base64( ShortCode + Passkey + Timestamp yyyyMMddHHmmss ). */
export function stkPassword(shortCode: string, passkey: string, timestamp: string): string {
  return Buffer.from(`${shortCode}${passkey}${timestamp}`).toString('base64');
}

export function stkTimestamp(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = now.getFullYear();
  const m = pad(now.getMonth() + 1);
  const d = pad(now.getDate());
  const h = pad(now.getHours());
  const min = pad(now.getMinutes());
  const s = pad(now.getSeconds());
  return `${y}${m}${d}${h}${min}${s}`;
}

export async function darajaOAuthToken(params: {
  baseUrl: string;
  consumerKey: string;
  consumerSecret: string;
}): Promise<string> {
  const basic = Buffer.from(`${params.consumerKey}:${params.consumerSecret}`).toString('base64');
  const res = await fetch(
    `${params.baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
    {
      headers: { Authorization: `Basic ${basic}` },
      next: { revalidate: 0 },
    },
  );
  const data = (await res.json()) as { access_token?: string; error_description?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description ?? `OAuth failed (${res.status})`);
  }
  return data.access_token;
}

export interface StkPushPayload {
  businessShortCode: string;
  amount: number;
  phoneDigits254: string; // 2547XXXXXXXX without +
  callbackUrl: string;
  accountReference: string;
  transactionDesc: string;
  transactionType: 'CustomerPayBillOnline' | 'CustomerBuyGoodsOnline';
  partyB: string;
}

export async function stkPushRequest(params: {
  baseUrl: string;
  accessToken: string;
  passkey: string;
  payload: StkPushPayload;
}): Promise<{
  MerchantRequestID?: string;
  CheckoutRequestID?: string;
  ResponseCode?: string;
  ResponseDescription?: string;
  CustomerMessage?: string;
  errorMessage?: string;
  requestId?: string;
  errorCode?: string;
}> {
  const timestamp = stkTimestamp();
  const password = stkPassword(params.payload.businessShortCode, params.passkey, timestamp);
  const shortCodeNum = Number(params.payload.businessShortCode);

  const body = {
    BusinessShortCode: shortCodeNum,
    Password: password,
    Timestamp: timestamp,
    TransactionType: params.payload.transactionType,
    Amount: params.payload.amount,
    PartyA: Number(params.payload.phoneDigits254),
    PartyB: Number(params.payload.partyB),
    PhoneNumber: Number(params.payload.phoneDigits254),
    CallBackURL: params.payload.callbackUrl,
    AccountReference: params.payload.accountReference.slice(0, 12),
    TransactionDesc: params.payload.transactionDesc.slice(0, 13),
  };

  const res = await fetch(`${params.baseUrl}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    next: { revalidate: 0 },
  });

  return res.json();
}

/** Query STK result by CheckoutRequestID (poll when callback delayed). */
export async function stkPushQuery(params: {
  baseUrl: string;
  accessToken: string;
  passkey: string;
  businessShortCode: string;
  checkoutRequestID: string;
}): Promise<{
  ResponseCode?: string;
  ResponseDescription?: string;
  MerchantRequestID?: string;
  CheckoutRequestID?: string;
  ResultCode?: string;
  ResultDesc?: string;
  errorCode?: string;
  errorMessage?: string;
}> {
  const timestamp = stkTimestamp();
  const password = stkPassword(params.businessShortCode, params.passkey, timestamp);
  const body = {
    BusinessShortCode: Number(params.businessShortCode),
    Password: password,
    Timestamp: timestamp,
    CheckoutRequestID: params.checkoutRequestID,
  };
  const res = await fetch(`${params.baseUrl}/mpesa/stkpushquery/v1/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    next: { revalidate: 0 },
  });
  return res.json();
}
