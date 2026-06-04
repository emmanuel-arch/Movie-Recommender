import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getSupabaseServiceClient } from '@/lib/supabase/server';

// Service-role watching_profiles mutations, scoped to the signed-in NextAuth
// user. Every query filters by both `id` and `user_id` so one user can never
// touch another's profile even though the service role bypasses RLS.

async function requireOwner(id: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) } as const;
  }
  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    return { error: NextResponse.json({ error: 'Database not configured' }, { status: 500 }) } as const;
  }
  const { data: row } = await supabase
    .from('watching_profiles')
    .select('id,user_id')
    .eq('id', id)
    .eq('user_id', session.user.id)
    .maybeSingle();
  if (!row) {
    return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) } as const;
  }
  return { userId: session.user.id, supabase } as const;
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await requireOwner(params.id);
  if ('error' in ctx) return ctx.error;
  const { userId, supabase } = ctx;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Whitelist updatable columns.
  const patch: Record<string, unknown> = {};
  for (const key of ['name', 'avatar_key', 'is_kids', 'is_default', 'pin'] as const) {
    if (key in body) patch[key] = body[key];
  }
  if ('name' in patch && !String(patch.name ?? '').trim()) {
    return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
  }

  // Only one default per user — clear the others first.
  if (patch.is_default === true) {
    await supabase
      .from('watching_profiles')
      .update({ is_default: false })
      .eq('user_id', userId)
      .neq('id', params.id);
  }

  const { data, error } = await supabase
    .from('watching_profiles')
    .update(patch)
    .eq('id', params.id)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ profile: data });
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await requireOwner(params.id);
  if ('error' in ctx) return ctx.error;
  const { userId, supabase } = ctx;

  const { error } = await supabase
    .from('watching_profiles')
    .delete()
    .eq('id', params.id)
    .eq('user_id', userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
