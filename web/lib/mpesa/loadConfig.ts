import type { MpesaEnv } from './daraja';
import { darajaBaseUrl } from './daraja';

export interface MpesaRuntimeConfig {
  mpesaEnv: MpesaEnv;
  baseUrl: string;
  consumerKey: string;
  consumerSecret: string;
  businessShortCode: string;
  passkey: string;
  callbackUrl: string;
  accountReference: string;
  /** Paybill: PartyB = shortcode. Till: PartyB = till number. */
  transactionType: 'CustomerPayBillOnline' | 'CustomerBuyGoodsOnline';
  partyB: string;
}

export function loadMpesaConfig(): MpesaRuntimeConfig | null {
  const consumerKey = process.env.MPESA_CONSUMER_KEY;
  const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
  const businessShortCode = process.env.MPESA_BUSINESS_SHORTCODE;
  const passkey = process.env.MPESA_PASSKEY;
  const callbackUrl = process.env.MPESA_CALLBACK_URL;
  const till = process.env.MPESA_TILL_NUMBER?.trim();
  const mode = (process.env.MPESA_STK_PARTY_MODE ?? 'paybill').toLowerCase();

  if (!consumerKey || !consumerSecret || !businessShortCode || !passkey || !callbackUrl) {
    return null;
  }

  const envRaw = (process.env.MPESA_ENVIRONMENT ?? 'sandbox').toLowerCase();
  const mpesaEnv: MpesaEnv = envRaw === 'production' ? 'production' : 'sandbox';

  const accountRefRaw = (
    process.env.MPESA_ACCOUNT_REFERENCE ?? 'BIRGENPREM'
  ).replace(/\s+/g, '');
  const accountReference = accountRefRaw.slice(0, 12);

  let transactionType: MpesaRuntimeConfig['transactionType'] = 'CustomerPayBillOnline';
  let partyB = businessShortCode;

  if (mode === 'till' && till && /^\d+$/.test(till)) {
    transactionType = 'CustomerBuyGoodsOnline';
    partyB = till;
  }

  return {
    mpesaEnv,
    baseUrl: darajaBaseUrl(mpesaEnv),
    consumerKey,
    consumerSecret,
    businessShortCode,
    passkey,
    callbackUrl,
    accountReference,
    transactionType,
    partyB,
  };
}
