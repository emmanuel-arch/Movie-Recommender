import { NextResponse, type NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { isPublicForAnonymousPath } from '@/lib/anonPublicPaths';

/**
 * Auth gate (NextAuth / Auth.js v5).
 *
 * Movies shares the birgenai.com NextAuth session, so we read the JWT session
 * cookie directly. Anonymous users hitting a protected page are bounced to
 * /welcome; public/marketing/auth routes stay open.
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
  const cookieName = useSecureCookies
    ? '__Secure-authjs.session-token'
    : 'authjs.session-token';

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

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Skip Next.js internals, static assets, and image optimization.
    '/((?!_next/static|_next/image|favicon.ico|Images/|Videos/|api/enrich).*)',
  ],
};
