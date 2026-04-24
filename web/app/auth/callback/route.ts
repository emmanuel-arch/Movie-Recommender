/**
 * Supabase OAuth callback.
 *
 * Supabase redirects here with a `?code=...` after Google/Apple auth. We
 * exchange it for a session (sets the auth cookies) and then route the user
 * to the profile picker so they can pick / create their watching profile.
 *
 * If the exchange fails, we send them back to /login with an error flag.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? '/profiles';

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=oauth_missing_code', request.url));
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.redirect(new URL('/login?error=auth_not_configured', request.url));
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message)}`, request.url));
  }

  return NextResponse.redirect(new URL(next, request.url));
}
