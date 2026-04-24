/**
 * BirgenAI Monthly Usage Cron
 *
 * Triggered daily at 01:00 UTC:
 *   1. Calls the `update_monthly_usage()` Postgres RPC which aggregates
 *      `watch_sessions` into `monthly_usage` for the current month.
 *   2. Finds users who have crossed the free-tier cap (20 h by default).
 *   3. Inserts a pending row into `notifications` so the next time the
 *      user opens the app / tries to play something, the modal fires.
 *
 * Designed to run on Cloudflare's free cron tier — stays <10 ms CPU.
 */

interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  FREE_TIER_CAP_SECONDS: string;
  WARN_THRESHOLD_SECONDS: string;
}

function sbHeaders(env: Env): HeadersInit {
  return {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
}

async function callRpc(env: Env, fn: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: sbHeaders(env),
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`RPC ${fn} failed: ${res.status} ${await res.text()}`);
  return res.json().catch(() => null);
}

interface UsageRow {
  user_id: string;
  total_seconds: number;
  month: string;
}

async function fetchHeavyUsers(env: Env, threshold: number, month: string): Promise<UsageRow[]> {
  const url = `${env.SUPABASE_URL}/rest/v1/monthly_usage?month=eq.${month}&total_seconds=gte.${threshold}&select=user_id,total_seconds,month`;
  const res = await fetch(url, { headers: sbHeaders(env) });
  if (!res.ok) throw new Error(`fetchHeavyUsers failed: ${res.status}`);
  return res.json();
}

interface NotificationRow {
  user_id: string;
  type: string;
  title: string;
  message: string;
  cta_url: string;
  cta_label: string;
}

async function queueNotifications(env: Env, rows: NotificationRow[]): Promise<void> {
  if (rows.length === 0) return;
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/notifications`, {
    method: 'POST',
    headers: {
      ...sbHeaders(env),
      Prefer: 'return=minimal,resolution=merge-duplicates',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`queueNotifications failed: ${res.status} ${await res.text()}`);
}

function currentMonthDate(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function hours(seconds: number): number {
  return Math.round(seconds / 3600);
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(run(env));
  },

  // Also expose an HTTP trigger for manual runs / testing.
  //   curl -H "Authorization: Bearer <SERVICE_KEY>" https://...workers.dev/run
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== '/run') return new Response('OK', { status: 200 });
    const auth = request.headers.get('Authorization') ?? '';
    if (auth !== `Bearer ${env.SUPABASE_SERVICE_KEY}`) {
      return new Response('Unauthorized', { status: 401 });
    }
    ctx.waitUntil(run(env));
    return new Response('triggered', { status: 202 });
  },
} satisfies ExportedHandler<Env>;

async function run(env: Env): Promise<void> {
  const month = currentMonthDate();
  const cap = Number(env.FREE_TIER_CAP_SECONDS);
  const warn = Number(env.WARN_THRESHOLD_SECONDS);

  console.log(`[monthly-usage-cron] Running for month=${month}`);

  // 1. Aggregate watch_sessions → monthly_usage via Postgres RPC.
  await callRpc(env, 'update_monthly_usage');

  // 2. Find users who crossed the cap.
  const overCap = await fetchHeavyUsers(env, cap, month);

  // 3. Find users who crossed the warn threshold but not the cap.
  const warnRows = await fetchHeavyUsers(env, warn, month);
  const warnOnly = warnRows.filter((r) => r.total_seconds < cap);

  // 4. Queue notifications. Idempotent thanks to a unique index on
  //    (user_id, type, month) in the schema.
  const toInsert: NotificationRow[] = [
    ...overCap.map((r) => ({
      user_id: r.user_id,
      type: 'screen_time_limit',
      title: 'You\'ve hit your free-tier limit',
      message: `You've watched ${hours(r.total_seconds)} hours this month on your free plan. Upgrade to Premium for unlimited viewing.`,
      cta_url: '/upgrade',
      cta_label: 'Go Premium',
    })),
    ...warnOnly.map((r) => ({
      user_id: r.user_id,
      type: 'screen_time_warn',
      title: 'Approaching your free-tier limit',
      message: `You're at ${hours(r.total_seconds)} h / ${hours(cap)} h this month. A few hours left before you'll need Premium.`,
      cta_url: '/upgrade',
      cta_label: 'See Premium',
    })),
  ];

  await queueNotifications(env, toInsert);

  console.log(
    `[monthly-usage-cron] Done — over_cap=${overCap.length} warn=${warnOnly.length}`,
  );
}
