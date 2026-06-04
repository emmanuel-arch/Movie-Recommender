import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getSupabaseServiceClient } from '@/lib/supabase/server';

// Per-user playback sync. NextAuth sessions have no Supabase auth.uid(), so we
// read/write through the service role and scope every query to session.user.id.

// GET /api/watch-session
//   • no params           → continue_watching list (most recent 12)
//   • ?movieSlug=… | ?movieId=… → single watch_sessions row (for resume)
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const supabase = getSupabaseServiceClient();
  if (!supabase) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });

  const userId = session.user.id;
  const movieSlug = request.nextUrl.searchParams.get('movieSlug');
  const movieId = request.nextUrl.searchParams.get('movieId');

  if (movieSlug || movieId) {
    let q = supabase
      .from('watch_sessions')
      .select('position_seconds,duration_seconds,updated_at')
      .eq('user_id', userId)
      .limit(1);
    q = movieSlug ? q.eq('movie_slug', movieSlug) : q.eq('movie_id', Number(movieId));
    const { data } = await q.maybeSingle();
    return NextResponse.json({ row: data ?? null });
  }

  const { data, error } = await supabase
    .from('continue_watching')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(12);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

// POST /api/watch-session — upsert the user's progress for one title.
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const supabase = getSupabaseServiceClient();
  if (!supabase) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });

  let body: {
    movieId?: number | null;
    movieSlug?: string | null;
    positionSeconds?: number;
    durationSeconds?: number | null;
    watchedSeconds?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const userId = session.user.id;
  const row = {
    user_id: userId,
    movie_id: body.movieId ?? null,
    movie_slug: body.movieSlug ?? null,
    position_seconds: Math.floor(body.positionSeconds ?? 0),
    duration_seconds: body.durationSeconds ? Math.floor(body.durationSeconds) : null,
    watched_seconds: Math.floor(body.watchedSeconds ?? 0),
    updated_at: new Date().toISOString(),
  };

  // Manual upsert — watch_sessions has no (user_id, movie_*) unique index, so
  // we can't rely on ON CONFLICT. Find the existing row for this title first.
  const matchCol = body.movieSlug ? 'movie_slug' : 'movie_id';
  const matchVal = body.movieSlug ?? body.movieId ?? null;
  const { data: existing } = await supabase
    .from('watch_sessions')
    .select('id')
    .eq('user_id', userId)
    .eq(matchCol, matchVal)
    .limit(1)
    .maybeSingle();

  const { error } = existing?.id
    ? await supabase.from('watch_sessions').update(row).eq('id', existing.id)
    : await supabase.from('watch_sessions').insert(row);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
