# BirgenAI Infrastructure

End-to-end setup guide for a Netflix-grade Kenyan streaming platform.

```
┌──────────────┐      ┌───────────────────────────┐      ┌─────────────────┐
│   Browser    │─────▶│ Cloudflare Worker (cache) │─────▶│ Cloud Run (API) │
│  Next.js UI  │      │  birgenai.com/api/*       │      │  FastAPI + SVD  │
└──────┬───────┘      └───────────────────────────┘      └────────┬────────┘
       │                                                          │
       │                                                          ▼
       │                                               ┌─────────────────────┐
       │                                               │ Supabase (Postgres) │
       │◀──── Auth · RLS · Watch sessions ────────────│ profiles · ratings  │
       │                                               │ kenyan_movies · ... │
       │                                               └─────────────────────┘
       │
       │     HLS master playlist + segments
       ▼
┌──────────────────────────┐
│ Cloudflare R2 (public)   │
│ Videos/<slug>/master.m3u8│
└──────────────────────────┘
         ▲
         │ transcoded once locally (free)
         │
┌──────────────────────────┐
│ FFmpeg (your laptop)     │
│ MP4 → 4-bitrate HLS      │
└──────────────────────────┘
```

---

## 1. Cloudflare — kill the 429s + serve HLS

### 1.1 API edge cache worker

```bash
cd infra/cloudflare/api-cache-worker
npm install
npx wrangler login
npx wrangler deploy
```

Then in the Cloudflare dashboard:

- **Workers & Pages → birgenai-api-cache → Triggers → Add route**
  - Zone: `birgenai.com`
  - Route: `birgenai.com/api/*`

The Worker strips `/api` and forwards to the Cloud Run origin, caching hot paths (`/movies/popular` 5 min, `/movies/search` 30 s, `/kenyan/*` 2 min) and never caching `/recommend` (user-specific). The first burst of requests from a cold start is absorbed at the edge — 429s go away.

Configure in `wrangler.toml`:

- `ORIGIN_URL` — your Cloud Run URL
- `ALLOWED_ORIGINS` — comma-separated list of allowed frontend origins

### 1.2 Nightly screen-time cron

```bash
cd infra/cloudflare/monthly-usage-cron
npm install

# Secrets — NEVER put these in wrangler.toml
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_KEY

npx wrangler deploy
```

Runs daily at 01:00 UTC:

1. Calls `update_monthly_usage()` RPC → aggregates yesterday's `watch_sessions`.
2. Finds users ≥ 20 h and queues a `screen_time_limit` notification.
3. Finds users ≥ 16 h and queues a `screen_time_warn` notification.

### 1.3 R2 bucket for HLS + static assets

```bash
npx wrangler r2 bucket create birgenai-assets
```

Enable public access (dashboard → R2 → bucket → Settings → Public Access → Allow) or connect a custom domain (`assets.birgenai.com`).

---

## 2. FFmpeg HLS pipeline (run locally, once per movie)

```bash
# macOS / Linux
bash infra/ffmpeg/transcode-hls.sh "movie.mp4" "nairobi-half-life"
```

```powershell
# Windows
pwsh infra/ffmpeg/transcode-hls.ps1 -Input "movie.mp4" -Slug "nairobi-half-life"
```

Produces:

```
hls/<slug>/
  master.m3u8         ← adaptive manifest
  1080p/stream.m3u8, seg000.ts, seg001.ts ...
  720p/...
  480p/...
  360p/...
  poster.jpg
```

Upload to R2 (the scripts do this when `-Upload` / `--upload` is passed).

After upload, the files are reachable at:

```
https://<R2_PUBLIC_HOST>/Videos/<slug>/master.m3u8
https://<R2_PUBLIC_HOST>/Videos/<slug>/poster.jpg
```

See `infra/ffmpeg/README.md` for batch mode and the full encoding ladder.

---

## 3. Supabase — auth, data, RLS

1. Create a project at <https://supabase.com>.
2. **SQL editor → New query → paste** `infra/supabase/schema.sql` → run.
3. **SQL editor → New query → paste** `infra/supabase/seed_kenyan_movies.sql` → run.
4. **Authentication → Providers** — enable Google, Apple, email/password.
5. **Authentication → URL Configuration** — add your site URLs:
   - `https://birgenai.com`
   - `https://movies.birgenai.com`
   - `http://localhost:3000`
6. **Settings → API** — copy the three values into env files below.

The schema ships with:

- `profiles` (auto-created on signup via trigger)
- `watch_sessions` (one row per (user, movie)) with RLS
- `monthly_usage` rollup table
- `ratings` (mirrors MovieLens + Kenyan catalogue)
- `kenyan_movies` catalogue with `hls_master_url`, `birgen_rating`, `mood_tags`
- `notifications` (populated by cron)
- `continue_watching` view (joined, RLS-aware)
- `update_monthly_usage()` RPC

---

## 4. FastAPI — the Kenyan bridge

```bash
cd src/api
pip install -r requirements.txt  # adds httpx for Supabase fetches

# These two env vars let FastAPI read kenyan_movies for recommendations.
export SUPABASE_URL=https://YOUR-REF.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=your_service_key

uvicorn main:app --host 0.0.0.0 --port 8080
```

New endpoints:

| Method | Path                                | Purpose                                    |
| ------ | ----------------------------------- | ------------------------------------------ |
| GET    | `/kenyan/catalogue`                 | Published Kenyan movies (for browse pages) |
| GET    | `/kenyan/recommendations/{user_id}` | Personalised Kenyan picks for a user       |
| POST   | `/kenyan/recommendations`          | Guest-mode recommendations (ratings body)  |

The bridge (`src/api/kenyan_bridge.py`):

1. Reads the user's Hollywood ratings (Supabase or request body).
2. Computes genre weights from liked movies.
3. Scores each Kenyan movie = `genre_match·0.6 + mood_match·0.4`, multiplied by `birgen_rating / 5` for editorial quality.
4. Returns the top N.

Deploy to Cloud Run:

```bash
gcloud run deploy birgenai-api \
  --source src/api \
  --region us-central1 \
  --allow-unauthenticated \
  --min-instances 1 \
  --set-env-vars SUPABASE_URL=...,SUPABASE_SERVICE_ROLE_KEY=...
```

> Bumping `--min-instances` to 1 also removes the cold-start 429 surge, but the Worker cache makes this optional.

---

## 5. Next.js frontend

```bash
cd web
cp .env.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY
# Fill in NEXT_PUBLIC_R2_PUBLIC_URL (e.g. https://assets.birgenai.com)
# Keep NEXT_PUBLIC_API_PROXY_URL=https://birgenai.com/api (routes through Worker)

npm install
npm run dev
```

What's been wired up:

- `components/AuthProvider.tsx` — wraps the app in `layout.tsx`; exposes `useAuth()`.
- `components/AuthModal.tsx` — Netflix-style guest/sign-in/sign-up sheet.
- `components/VideoPlayer.tsx` — HLS.js ABR player with resume, progress upload, paywall.
- `components/ContinueWatchingRow.tsx` — top of home, merges Supabase + localStorage.
- `components/ScreenTimeBanner.tsx` — shown when free-tier usage crosses warn threshold.
- `hooks/useWatchSession.ts` — tick/flush debounced Supabase upsert + LS fallback.
- `hooks/useContinueWatching.ts` — reads the `continue_watching` view.
- `hooks/useScreenTime.ts` — monthly usage + unread notifications.
- `app/watch/[slug]/page.tsx` — dedicated watch page behind the auth gate.
- `app/upgrade/page.tsx` — pricing + Premium CTA.
- `lib/api.ts` — goes through the Worker proxy with exponential back-off + jitter on 429/5xx.
- `lib/hls.ts` — MovieLens ID ↔ Kenyan slug ↔ R2 HLS URL helpers.
- `middleware.ts` — keeps Supabase auth cookies fresh across SSR requests.

---

## 6. Environment variables reference

### `web/.env.local`

```ini
NEXT_PUBLIC_API_PROXY_URL=https://birgenai.com/api
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1...
NEXT_PUBLIC_R2_PUBLIC_URL=https://assets.birgenai.com
NEXT_PUBLIC_FREE_TIER_CAP_SECONDS=72000
NEXT_PUBLIC_WARN_THRESHOLD_SECONDS=57600
TMDB_READ_ACCESS_TOKEN=...
```

### Cloud Run (FastAPI)

```ini
SUPABASE_URL=https://YOUR-REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...           # server-only
```

### Cloudflare Worker secrets

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_KEY
```

---

## 7. End-to-end checklist

1. ✅ Worker deployed at `birgenai.com/api/*` — front-end no longer hits Cloud Run directly.
2. ✅ R2 bucket has at least one `Videos/<slug>/master.m3u8` uploaded.
3. ✅ Supabase schema + seed applied; auth providers enabled.
4. ✅ Cloud Run has `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.
5. ✅ Cron worker deployed with its two secrets.
6. ✅ `web/.env.local` filled in; `npm run dev` works locally.
7. ✅ Guest can browse and rate movies without creating an account.
8. ✅ Clicking Play on a Kenyan title opens the AuthModal.
9. ✅ Signing in shows Continue Watching across devices.
10. ✅ Crossing the 16 h / month threshold shows the banner; 20 h pauses playback with the upgrade CTA.

---

## 8. Adding more Kenyan films

1. Transcode locally with `infra/ffmpeg/transcode-hls.*`.
2. Upload to R2 under `Videos/<slug>/`.
3. `INSERT` a row into `kenyan_movies` (copy `seed_kenyan_movies.sql` as a template). Set `is_published = true` and fill in `hls_master_url`, `backdrop_url`, `birgen_rating`, `genres`, `mood_tags`.
4. Optionally extend `KENYAN_HLS_MAP` in `web/lib/hls.ts` so legacy MovieLens IDs map to the new slug — or just rely on the Supabase row.

---

## 9. Troubleshooting

| Symptom                                    | Likely cause                                                      | Fix                                                                 |
| ------------------------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------- |
| 429s return                                | Worker route not configured; requests hitting Cloud Run directly. | Verify `birgenai.com/api/*` route in Workers dashboard.             |
| Video plays but no resume                  | Supabase env vars missing.                                        | Check `NEXT_PUBLIC_SUPABASE_URL` + anon key in `.env.local`.        |
| `CORS blocked`                             | Anon key / browser origin mismatch.                               | Add origin to Supabase → Auth → URL Configuration, and Worker env.  |
| Master playlist 404                        | R2 public access disabled.                                        | Enable public-access or attach a custom domain.                     |
| "Auth is not configured" banner in modal   | Missing Supabase env vars at build-time.                          | Restart `npm run dev` after editing `.env.local`.                   |
| Screen-time paywall never triggers         | Watch sessions not being upserted.                                | Inspect network tab: each playback should hit `watch_sessions` every ~10 s when signed in. |

---

Built by the BirgenAI team · Nairobi.
