import { NextResponse, type NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { isPublicForAnonymousPath } from '@/lib/anonPublicPaths';

/** Cookie holding the chosen watching profile (set by AuthProvider). */
const ACTIVE_PROFILE_COOKIE = 'birgenai_wp';

/**
 * Content surfaces that require a chosen watching profile. Hitting any of these
 * without one sends the (already signed-in) user to the cinematic "Who's
 * watching?" picker first — never the sign-up flow.
 */
function requiresActiveProfile(pathname: string): boolean {
  if (pathname === '/') return true;
  return ['/browse', '/movie', '/watch', '/my-list', '/recommendations'].some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

/**
 * Auth gate (NextAuth / Auth.js v5).
 *
 * Movies shares the birgenai.com NextAuth session, so we read the JWT session
 * cookie directly. Anonymous users hitting a protected page are bounced to
 * /welcome; public/marketing/auth routes stay open. Signed-in users who haven't
 * picked a watching profile yet are sent to /profiles ("Continue as …") before
 * any content surface, so they go straight from the hub into choosing a profile
 * and watching — never a sign-up page.
 *
 * Auth.js names the cookie `authjs.session-token`, prefixed with `__Secure-`
 * over HTTPS. getToken() can't infer the secure flag behind a proxy, so we set
 * it explicitly — otherwise it looks for the wrong cookie, finds no token, and
 * bounces signed-in users.
 */
export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // API routes guard themselves (via `auth()`); never redirect them.
  if (pathname.startsWith('/api/')) return NextResponse.next();
  if (isPublicForAnonymousPath(pathname)) return NextResponse.next();

  const useSecureCookies =
    (process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? '').startsWith('https://') ||
    process.env.NODE_ENV === 'production';
  // Must match cookies.sessionToken.name in auth.config.ts (suite-specific name).
  const cookieName = useSecureCookies
    ? '__Secure-birgenai-suite.session-token'
    : 'birgenai-suite.session-token';

  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET,
    secureCookie: useSecureCookies,
    cookieName,
  });

  if (!token) {
    const url = request.nextUrl.clone();
    url.pathname = '/welcome';
    url.search = '';
    return NextResponse.redirect(url);
  }

  // Signed in, but no watching profile chosen yet → greet them with the
  // "Who's watching?" picker before any content surface. Picking a tile sets
  // the birgenai_wp cookie and routes home, so this only fires on fresh entry.
  if (
    requiresActiveProfile(pathname) &&
    !request.cookies.get(ACTIVE_PROFILE_COOKIE)?.value
  ) {
    const url = request.nextUrl.clone();
    url.pathname = '/profiles';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Skip Next.js internals, static assets, and image optimization.
    '/((?!_next/static|_next/image|favicon.ico|Images/|Videos/|api/enrich).*)',
  ],
};
