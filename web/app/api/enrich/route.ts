// app/api/enrich/route.ts
// Server-side TMDB enrichment – keeps API keys out of the browser
import { NextRequest, NextResponse } from 'next/server';
import { batchEnrichMovies } from '@/lib/tmdb';

export const runtime = 'nodejs'; // ensure server-only

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