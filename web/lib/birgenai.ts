/**
 * Helpers for the BirgenAI cross-subdomain identifier.
 *
 *   BIR-XXXXXXXX   (8 numeric digits)
 *
 * Generated server-side on signup by `public.handle_new_user()`. These
 * helpers are purely format utilities — the actual ID is always read from
 * `profiles.birgenai_id`.
 */

export const BIRGENAI_ID_REGEX = /^BIR-\d{8,10}$/;

export function normalizeBirgenaiId(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '');
}

export function isValidBirgenaiId(raw: string): boolean {
  return BIRGENAI_ID_REGEX.test(normalizeBirgenaiId(raw));
}
