/**
 * Supabase OAuth callback.
 *
 * Exchanges `?code=` for a session and MUST attach Set-Cookie headers to the
 * redirect response (otherwise the browser never stores the session — users
 * appear logged-out and middleware sends them to /welcome).
 */
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const nextParam = url.searchParams.get('next') ?? '/auth/otp';

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=oauth_missing_code', request.url));
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anon) {
    return NextResponse.redirect(new URL('/login?error=auth_not_configured', request.url));
  }

  const redirectTarget = new URL(nextParam, request.url);
  let response = NextResponse.redirect(redirectTarget);

  const supabase = createServerClient(supabaseUrl, anon, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        response.cookies.set({ name, value, ...options });
      },
      remove(name: string, options: CookieOptions) {
        response.cookies.set({ name, value: '', ...options });
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, request.url),
    );
  }

  return response;
}
