/**
 * Centralized premium checkout URL.
 *
 * Every BirgenAI property funnels its M-PESA payments through the ONE wallet at
 * www.birgenai.com/wallet — the same STK engine that already works for top-ups.
 * Movies never talks to Daraja itself; it just deep-links into the wallet with a
 * `ctx` (which checkout to render) and a `return` URL (where to send the user back
 * once paid). On return, Movies re-reads the shared User entitlement and unlocks.
 *
 * Set NEXT_PUBLIC_WALLET_URL to the Hub origin. Defaults to production
 * www.birgenai.com; override to a localhost Hub when developing the handoff.
 */

const WALLET_BASE = (process.env.NEXT_PUBLIC_WALLET_URL ?? 'https://www.birgenai.com')
  .trim()
  .replace(/\/+$/, '');

/**
 * URL for the BirgenAI Basic plan checkout (KSh 99/mo) — the entry subscription
 * that INCLUDES Movies Premium. There is no standalone "Movies premium" purchase;
 * subscribing to Basic on the Hub sets the shared User tier, which Movies reads as
 * Premium. `returnTo` defaults to the current page, so after paying the user lands
 * right back where they hit the wall (the watch page resumes the movie).
 */
export function moviesPremiumCheckoutUrl(returnTo?: string): string {
  const ret =
    returnTo ?? (typeof window !== 'undefined' ? window.location.href : 'https://movies.birgenai.com/');
  return `${WALLET_BASE}/transact?plan=basic&return=${encodeURIComponent(ret)}`;
}
