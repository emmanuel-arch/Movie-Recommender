// app/api/enrich/route.ts
// Server-side TMDB enrichment – keeps API keys out of the browser
import { NextRequest, NextResponse } from 'next/server';
import { batchEnrichMovies } from '@/lib/tmdb';

export const runtime = 'nodejs'; // ensure server-only

/**
 * Warm-up ping. The client hits this on every load (and on an interval) so the
 * serverless function — and the TMDB connection + fetch cache — stay hot. That
 * kills the cold-start lag where the first enrichment after an idle period (or
 * the first "rate movies" recommendation) takes forever. The fixed title is
 * served from TMDB's 24h fetch cache on repeat pings, so it costs ~nothing.
 */
export async function GET() {
  try {
    await batchEnrichMovies([{ movieId: 0, title: 'Inception (2010)', year: '2010' }]);
    return NextResponse.json({ ok: true, warm: true });
  } catch {
    return NextResponse.json({ ok: true, warm: false });
  }
}

export async function POST(req: NextRequest) {
  try {
    const movies = await req.json();

    if (!Array.isArray(movies)) {
      return NextResponse.json(
        { error: 'Expected an array of movies' },
        { status: 400 },
      );
    }

    const enriched = await batchEnrichMovies(movies);
    return NextResponse.json(enriched);
  } catch (err: unknown) {
    console.error('[/api/enrich] Error:', err);
    return NextResponse.json(
      { error: 'Failed to enrich movies' },
      { status: 500 },
    );
  }
}