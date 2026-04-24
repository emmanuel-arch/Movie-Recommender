/**
 * Supabase server client — use in Server Components, Route Handlers,
 * and Server Actions.
 *
 * Reads session cookies set by the browser client so Row Level Security
 * works end-to-end without any manual token passing.
 */
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';

export function getSupabaseServerClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;

  const cookieStore = cookies();

  return createServerClient(url, anon, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch {
          // Called from a Server Component — ignore, the middleware will refresh later.
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value: '', ...options });
        } catch {
          // Same as above.
        }
      },
    },
  });
}

/**
 * Service-role client for privileged server work (RPCs, admin writes).
 * Never expose the service key to the browser — this file is server-only.
 */
export function getSupabaseServiceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) return null;

  // Service-role client should not read/write user cookies.
  return createServerClient(url, service, {
    cookies: {
      get() {
        return undefined;
      },
      set() {},
      remove() {},
    },
  });
}
