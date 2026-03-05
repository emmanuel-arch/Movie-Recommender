# BirgenAI Movies — Full Setup & Deployment Guide

## Project Architecture

```
movies.birgenai.com  (Vercel)
        │
        ▼
Next.js 14 Frontend
        │
        ▼ API calls
BirgenAI Backend (Google Cloud Run)
https://birgenai-api-529186868469.us-central1.run.app
        │
        ▼
TMDB API (movie posters & metadata)
```

---

## Pages & Components Overview

```
app/
├── layout.tsx                ← Root layout (fonts, metadata, Toaster)
├── globals.css               ← Design tokens, scrollbar, shimmer, utilities
├── page.tsx                  ← Home (Hero + carousels by genre)
├── HomeClient.tsx            ← Client-side home with popular movies
├── browse/
│   └── page.tsx              ← Browse all movies, genre filter, grid/carousel toggle
├── onboarding/
│   └── page.tsx              ← Rate movies, search, sidebar progress tracker
└── recommendations/
    └── page.tsx              ← AI-generated personalized picks

components/
├── Navbar.tsx                ← Fixed top nav, scroll effect, mobile menu
├── HeroBanner.tsx            ← Cinematic hero with backdrop image
├── MovieCard.tsx             ← Poster card + star rating + genre chips
├── MovieCarousel.tsx         ← Horizontal scroll row with left/right nav
└── SearchBar.tsx             ← Live search dropdown with results

lib/
├── api.ts                    ← BirgenAI backend API calls (axios)
└── tmdb.ts                   ← TMDB poster/backdrop fetching + enrichment

hooks/
└── useRatings.ts             ← Rating state + localStorage persistence + recommendations

types/
└── index.ts                  ← TypeScript interfaces
```

---

## Step 1 — Get Your TMDB API Key (Free, 10 min)

Movie posters are the most important visual element. TMDB provides them free.

1. Go to **https://www.themoviedb.org/signup** and create an account
2. Go to **https://www.themoviedb.org/settings/api**
3. Click **"Request an API Key"** → choose **"Developer"**
4. Fill in the form (you can describe it as a personal movie app)
5. Copy your **API Key (v3 auth)** — looks like `abc123def456...`

---

## Step 2 — Local Development Setup

```bash
# Clone or create the project folder
mkdir birgenai-movies && cd birgenai-movies

# Copy all the project files into this directory
# (the files from this codebase)

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local and add your TMDB API key:
# NEXT_PUBLIC_TMDB_API_KEY=your_key_here

# Run development server
npm run dev

# Open http://localhost:3000
```

---

## Step 3 — Enable TMDB Poster Fetching

The `lib/tmdb.ts` file handles poster fetching. To auto-enrich popular movies
with posters, add this API route so posters load server-side:

```bash
# Create this file: app/api/enrich/route.ts
```

```typescript
// app/api/enrich/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { batchEnrichMovies } from '@/lib/tmdb';

export async function POST(req: NextRequest) {
  const movies = await req.json();
  const enriched = await batchEnrichMovies(movies);
  return NextResponse.json(enriched);
}
```

Then in your components, call `/api/enrich` with the movie list to get
posters in batch. This avoids exposing your TMDB key in client-side code.

---

## Step 4 — Push to GitHub

```bash
# Initialize git in the project folder
git init
git add .
git commit -m "feat: initial BirgenAI Movies frontend"

# Create a new GitHub repo at https://github.com/new
# Repo name: birgenai-movies (or similar)
# Set it to Private or Public

# Link and push
git remote add origin https://github.com/YOUR_USERNAME/birgenai-movies.git
git branch -M main
git push -u origin main
```

---

## Step 5 — Deploy to Vercel

### Option A: Vercel Dashboard (Recommended)
1. Go to **https://vercel.com/new**
2. Click **"Import Git Repository"**
3. Select your `birgenai-movies` repo
4. Configure:
   - **Framework Preset**: Next.js (auto-detected)
   - **Root Directory**: `./` (leave default)
5. Add Environment Variables:
   ```
   NEXT_PUBLIC_API_URL = https://birgenai-api-529186868469.us-central1.run.app
   NEXT_PUBLIC_TMDB_API_KEY = your_tmdb_key_here
   ```
6. Click **Deploy** → wait ~2 minutes
7. You'll get a URL like `birgenai-movies.vercel.app`

### Option B: Vercel CLI
```bash
npm install -g vercel
vercel login
vercel --prod
# Follow prompts, add env vars when asked
```

---

## Step 6 — Cloudflare DNS Setup for movies.birgenai.com

Your domain `birgenai.com` is on Vercel. To create `movies.birgenai.com`,
you need to either:
- Use **Cloudflare for DNS** (then point to Vercel), or
- Stay on **Vercel DNS** and add the subdomain there

### Option A: Cloudflare (Recommended for full DNS control)

#### 6A.1 — Move birgenai.com to Cloudflare

1. Go to **https://dash.cloudflare.com** → "Add a Site"
2. Enter `birgenai.com` → choose the **Free plan**
3. Cloudflare will scan your existing DNS records
4. **IMPORTANT**: Cloudflare will show your existing Vercel DNS records.
   Keep them all (your www.birgenai.com should already be there).
5. Cloudflare gives you two nameservers like:
   ```
   ns1.cloudflare.com
   ns2.cloudflare.com
   ```
6. Go to your domain registrar (GoDaddy, Namecheap, etc.)
7. Replace the current nameservers with Cloudflare's nameservers
8. Wait 24-48 hours for propagation (usually faster)

#### 6A.2 — Add movies subdomain in Cloudflare

Once your domain is on Cloudflare:

1. In Cloudflare Dashboard → **DNS** → **Records**
2. Click **"Add Record"**:
   ```
   Type:    CNAME
   Name:    movies
   Target:  cname.vercel-dns.com
   Proxy:   ON (orange cloud) ← enables Cloudflare CDN + DDoS protection
   TTL:     Auto
   ```
3. Click **Save**

#### 6A.3 — Add movies.birgenai.com to Vercel

1. In Vercel Dashboard → your project → **Settings** → **Domains**
2. Type `movies.birgenai.com` → click **Add**
3. Vercel will verify the CNAME and activate SSL automatically
4. Wait ~5 minutes → visit `https://movies.birgenai.com` ✅

### Option B: Stay on Vercel DNS (simpler)

1. In Vercel Dashboard → your project → **Settings** → **Domains**
2. Add `movies.birgenai.com`
3. Vercel will show you the DNS records to add
4. Go to wherever `birgenai.com` DNS is managed
5. Add the CNAME record as instructed by Vercel

---

## Step 7 — Verify Everything Works

```bash
# Check DNS propagation
dig movies.birgenai.com CNAME
# Should show cname.vercel-dns.com

# Check SSL
curl -I https://movies.birgenai.com
# Should return HTTP/2 200

# Check API connectivity
curl https://birgenai-api-529186868469.us-central1.run.app/
# Should return health status
```

---

## Step 8 — Enable CORS on Your Backend (if needed)

If you see CORS errors in the browser console, add this to your FastAPI backend:

```python
# In your FastAPI main.py
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://movies.birgenai.com",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

Then redeploy your Cloud Run service.

---

## Movie Poster Strategy — What to Know

### Why TMDB?
Your backend uses **MovieLens data** (movieIds like 1, 2, 3...). TMDB has
posters for virtually every movie in MovieLens. The flow is:

```
MovieLens movieId + title → TMDB search by title → TMDB poster URL
```

### Pre-caching Posters (Production Optimization)
For production, don't fetch posters live. Instead:

1. Run a one-time script to map all popular MovieLens movies to TMDB IDs
2. Store the mapping in a JSON file or database
3. Serve poster URLs directly without live TMDB calls

```typescript
// scripts/cache-posters.ts — run once with: npx ts-node scripts/cache-posters.ts
import { getPopularMovies } from '../lib/api';
import { batchEnrichMovies } from '../lib/tmdb';
import fs from 'fs';

async function main() {
  const movies = await getPopularMovies(200);
  const enriched = await batchEnrichMovies(movies);
  fs.writeFileSync('./public/poster-cache.json', JSON.stringify(enriched, null, 2));
  console.log(`Cached ${enriched.length} movies with posters`);
}
main();
```

---

## Cloudflare Extra Features (Bonus)

Once on Cloudflare, enable these free features:

| Feature | Where | Benefit |
|---------|-------|---------|
| **Caching** | Caching → Configuration | Cache static assets globally |
| **Speed → Image Optimization** | Speed → Optimization | Compress images automatically |
| **Security → Bot Fight Mode** | Security → Bots | Block bad bots |
| **Analytics** | Analytics & Logs | See traffic stats |
| **Page Rules** | Rules → Page Rules | Force HTTPS, redirect www |

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Yes | Your BirgenAI FastAPI backend URL |
| `NEXT_PUBLIC_TMDB_API_KEY` | Yes (for posters) | TMDB v3 API key |

---

## Ongoing Deployment

Every time you push to `main` branch on GitHub, Vercel automatically
rebuilds and deploys. Zero downtime deployments.

```bash
# Make changes, then:
git add .
git commit -m "feat: improve movie card hover effects"
git push origin main
# Vercel deploys automatically in ~60 seconds
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| No posters showing | Check `NEXT_PUBLIC_TMDB_API_KEY` in Vercel env vars |
| API calls failing | Check CORS on backend, verify `NEXT_PUBLIC_API_URL` |
| `movies.birgenai.com` not loading | Wait for DNS propagation (up to 48h) or check Vercel domain config |
| Recommendations empty | Need ≥5 ratings; check backend `/recommend` endpoint directly |
| TypeScript build errors | Run `npm run lint` locally before pushing |
