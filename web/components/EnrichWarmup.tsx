'use client';
import { useEffect } from 'react';
import { warmRecommender } from '@/lib/api';

/**
 * Fire-and-forget warm-up for the two cold-start bottlenecks behind the
 * "rate movies → wait an eternity" lag:
 *   1. /api/enrich — the serverless TMDB poster/backdrop enricher.
 *   2. the recommender (Cloud Run) container that serves /recommend & /movies.
 *
 * Both go cold after idle. Pinging them on load — and on an interval that
 * outlasts typical idle eviction — keeps the function, the TMDB connection, and
 * the recommender container hot, so the first real enrichment/recommendation
 * returns quickly and cards fill in without the long wait.
 */
export default function EnrichWarmup() {
  useEffect(() => {
    const ping = () => {
      fetch('/api/enrich', { method: 'GET', cache: 'no-store' }).catch(() => {});
      warmRecommender();
    };

    ping(); // warm immediately on every load
    const id = setInterval(ping, 4 * 60 * 1000); // keep warm during the session

    // Re-warm when the tab is refocused after being backgrounded.
    const onVisible = () => {
      if (document.visibilityState === 'visible') ping();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return null;
}
