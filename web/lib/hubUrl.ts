/**
 * Hub URL helper — account creation is centralized at the BirgenAI Hub
 * (birgenai.com). Subdomains like Movies never mint accounts locally; they
 * funnel signups to the Hub's /create-account, and SSO (shared session cookie
 * across *.birgenai.com) carries the user back here once they're in.
 *
 * Override the host with NEXT_PUBLIC_HUB_URL (e.g. http://localhost:3000 in
 * local dev where the Hub runs on a different port).
 */
const HUB_BASE = (process.env.NEXT_PUBLIC_HUB_URL || 'https://www.birgenai.com').replace(/\/+$/, '');

export function hubUrl(path = '/'): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${HUB_BASE}${p}`;
}

/** Centralized account-creation entry, optionally prefilled with an email. */
export function createAccountUrl(email?: string): string {
  const q = email && email.trim() ? `?email=${encodeURIComponent(email.trim())}` : '';
  return hubUrl(`/create-account${q}`);
}
