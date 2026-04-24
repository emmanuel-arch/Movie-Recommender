/**
 * BirgenAI API Edge Cache Worker
 *
 * Route: birgenai.com/api/*  →  Cloud Run (birgenai-api-*.run.app)
 *
 * Responsibilities:
 *   1. Terminate traffic at Cloudflare's edge so Cloud Run never gets
 *      a cold-start stampede (this is what caused the 429s).
 *   2. Cache GET responses by URL:
 *        - /movies/popular  → 5 min
 *        - /movies/search   → 30 s
 *        - everything else  → 60 s
 *   3. Forward POST (/recommend) without caching, but still reuse the
 *      keep-alive edge socket, which is ~3–10× faster than cold TLS.
 *   4. Add proper CORS so the Next.js app can call it directly.
 */

export interface Env {
  ORIGIN_URL: string;
  ALLOWED_ORIGINS: string;
  CACHE_TTL: {
    POPULAR: string;
    SEARCH: string;
    RECOMMEND: string;
    DEFAULT: string;
  };
}

// ── helpers ────────────────────────────────────────────────────────
function ttlFor(pathname: string, env: Env): number {
  if (pathname.includes('/movies/popular')) return Number(env.CACHE_TTL.POPULAR);
  if (pathname.includes('/movies/search')) return Number(env.CACHE_TTL.SEARCH);
  if (pathname.includes('/recommend')) return Number(env.CACHE_TTL.RECOMMEND);
  if (pathname.includes('/kenyan/recommendations')) return 60;
  return Number(env.CACHE_TTL.DEFAULT);
}

function corsHeaders(request: Request, env: Env): HeadersInit {
  const origin = request.headers.get('Origin') ?? '';
  const allowed = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim());
  const allow = allowed.includes(origin) ? origin : allowed[0] ?? '*';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function mergeHeaders(base: Headers, extra: HeadersInit): Headers {
  const merged = new Headers(base);
  new Headers(extra).forEach((v, k) => merged.set(k, v));
  return merged;
}

// ── main ───────────────────────────────────────────────────────────
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // 1. Handle CORS preflight immediately.
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    const url = new URL(request.url);

    // Strip the "/api" prefix so the origin sees the real paths.
    //   birgenai.com/api/movies/popular  →  /movies/popular
    const originPath = url.pathname.replace(/^\/api/, '') || '/';
    const originUrl = new URL(originPath + url.search, env.ORIGIN_URL).toString();

    const ttl = ttlFor(url.pathname, env);
    const isCacheable = request.method === 'GET' && ttl > 0;

    // 2. Edge-cache lookup (GET only).
    const cache = caches.default;
    const cacheKey = new Request(originUrl, { method: 'GET' });

    if (isCacheable) {
      const hit = await cache.match(cacheKey);
      if (hit) {
        // Return cached response with CORS headers.
        return new Response(hit.body, {
          status: hit.status,
          headers: mergeHeaders(hit.headers, {
            ...corsHeaders(request, env),
            'X-Cache': 'HIT',
          }),
        });
      }
    }

    // 3. Forward to origin (Cloud Run). Keep headers lean — Cloud Run
    //    rejects some Cloudflare-injected hop-by-hop headers.
    const forwardHeaders = new Headers();
    for (const [k, v] of request.headers.entries()) {
      if (['host', 'cf-connecting-ip', 'cf-ray', 'cf-visitor'].includes(k.toLowerCase())) continue;
      forwardHeaders.set(k, v);
    }

    let originResponse: Response;
    try {
      originResponse = await fetch(originUrl, {
        method: request.method,
        headers: forwardHeaders,
        body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
        // Keep Cloud Run warm: tell Cloudflare to reuse the edge socket.
        cf: { cacheEverything: false, cacheTtl: 0 },
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: 'Upstream unreachable', detail: String(err) }),
        {
          status: 502,
          headers: mergeHeaders(new Headers({ 'Content-Type': 'application/json' }), {
            ...corsHeaders(request, env),
            'X-Cache': 'ERROR',
          }),
        },
      );
    }

    // 4. Build response with edge-cache directive.
    const headers = mergeHeaders(originResponse.headers, {
      ...corsHeaders(request, env),
      'X-Cache': isCacheable ? 'MISS' : 'BYPASS',
    });

    if (isCacheable && originResponse.status === 200) {
      // Tell the edge cache how long to hold onto this.
      headers.set('Cache-Control', `public, s-maxage=${ttl}, max-age=${ttl}`);

      // Tee so we can cache AND respond simultaneously.
      const bodyForCache = originResponse.clone().body;
      const toCache = new Response(bodyForCache, { status: 200, headers });

      // Put in cache without blocking the response.
      ctx.waitUntil(cache.put(cacheKey, toCache));
    }

    return new Response(originResponse.body, {
      status: originResponse.status,
      headers,
    });
  },
} satisfies ExportedHandler<Env>;
