import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isPublicForAnonymousPath } from '@/lib/anonPublicPaths';

/**
 * Keeps Supabase auth cookies fresh on every request.
 * Called from `web/middleware.ts`.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return response;

  const supabase = createServerClient(url, anon, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        request.cookies.set({ name, value, ...options });
        response = NextResponse.next({ request: { headers: request.headers } });
        response.cookies.set({ name, value, ...options });
      },
      remove(name: string, options: CookieOptions) {
        request.cookies.set({ name, value: '', ...options });
        response = NextResponse.next({ request: { headers: request.headers } });
        response.cookies.set({ name, value: '', ...options });
      },
    },
  });

  // Triggers auto-refresh when the access token has expired; also yields current user.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const pathname = request.nextUrl.pathname;
    if (!isPublicForAnonymousPath(pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = '/welcome';
      url.search = '';
      return NextResponse.redirect(url);
    }
  }

  return response;
}
