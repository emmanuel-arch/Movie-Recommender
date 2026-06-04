import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getSupabaseServiceClient } from '@/lib/supabase/server';

// GET /api/profiles — list watching_profiles for the signed-in user.
// Uses the service-role client: NextAuth sessions have no Supabase auth.uid(),
// so the RLS SELECT policy would otherwise block the read.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  const { data, error } = await supabase
    .from('watching_profiles')
    .select('*')
    .eq('user_id', session.user.id)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ profiles: data ?? [] });
}

// POST /api/profiles — create a watching_profiles row (service-role bypasses RLS).
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { name, avatar_key, is_kids, is_default, pin } = body as {
    name?: string;
    avatar_key?: string;
    is_kids?: boolean;
    is_default?: boolean;
    pin?: string | null;
  };

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  const { data, error } = await supabase
    .from('watching_profiles')
    .insert({
      user_id: session.user.id,
      name: name.trim(),
      avatar_key: avatar_key ?? 'default',
      is_kids: is_kids ?? false,
      is_default: is_default ?? false,
      pin: pin ?? null,
    })
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ profile: data });
}
