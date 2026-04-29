/**
 * Paths where we do not force redirect to /auth/otp for users who have not
 * verified their email OTP yet.
 */
export function isOtpExemptPath(pathname: string): boolean {
  const exact = new Set([
    '/welcome',
    '/login',
    '/signup',
    '/favicon.ico',
    '/auth/otp',
    '/auth/entering',
  ]);
  if (exact.has(pathname)) return true;
  const prefixes = ['/auth/callback', '/api/', '/_next/', '/Images/', '/Videos/'] as const;
  for (const p of prefixes) {
    if (pathname.startsWith(p)) return true;
  }
  return false;
}
