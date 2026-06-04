import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getSupabaseServiceClient } from '@/lib/supabase/server';

function currentMonthISO(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

// GET /api/screen-time — monthly rollup + unseen notifications for the user.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const supabase = getSupabaseServiceClient();
  if (!supabase) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });

  const userId = session.user.id;
  const [{ data: usage }, { data: notif }] = await Promise.all([
    supabase
      .from('monthly_usage')
      .select('total_seconds')
      .eq('user_id', userId)
      .eq('month', currentMonthISO())
      .maybeSingle(),
    supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .is('seen_at', null)
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  return NextResponse.json({
    totalSeconds: (usage?.total_seconds as number | undefined) ?? 0,
    notifications: notif ?? [],
  });
}

// POST /api/screen-time — mark a notification seen ({ dismissId }).
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const supabase = getSupabaseServiceClient();
  if (!supabase) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });

  let body: { dismissId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.dismissId) return NextResponse.json({ error: 'dismissId required' }, { status: 400 });

  // Scope to the user so one user can't dismiss another's notifications.
  const { error } = await supabase
    .from('notifications')
    .update({ seen_at: new Date().toISOString() })
    .eq('id', body.dismissId)
    .eq('user_id', session.user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
