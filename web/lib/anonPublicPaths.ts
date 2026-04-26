/**
 * URL paths that anonymous users can access without being redirected to /welcome.
 * Keep in sync with any auth gate or sign-out logic that references these routes.
 */
const EXACT = new Set(['/welcome', '/login', '/signup', '/favicon.ico']);

const PREFIX = ['/auth/', '/api/', '/_next/', '/Images/', '/Videos/'] as const;

export function isPublicForAnonymousPath(pathname: string): boolean {
  if (EXACT.has(pathname)) return true;
  for (const p of PREFIX) {
    if (pathname.startsWith(p)) return true;
  }
  return false;
}
