import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Skip Next.js internals, static assets, and image optimization.
    '/((?!_next/static|_next/image|favicon.ico|Images/|Videos/|api/enrich).*)',
  ],
};
