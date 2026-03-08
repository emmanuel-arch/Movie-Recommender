# Deploying movies.birgenai.com

Complete guide to deploy the BirgenAI Movies app on **Vercel** with **Cloudflare DNS** and **Cloudflare R2** for static assets.

---

## Architecture

```
┌──────────────┐    DNS (CNAME)      ┌──────────────────┐
│  Cloudflare  │ ──────────────────► │  Vercel Edge     │
│  DNS         │                     │  (Next.js SSR)   │
│              │                     │  movies.birgenai  │
└──────────────┘                     └──────────────────┘
                                              │
       ┌──────────────────────────────────────┤
       ▼                                      ▼
┌──────────────────┐              ┌──────────────────────┐
│  Cloudflare R2   │              │  Google Cloud Run    │
│  (Videos/Images) │              │  (FastAPI Backend)   │
│  assets.birgenai │              │  birgenai-api-*      │
└──────────────────┘              └──────────────────────┘
```

---

## Step 1 — Vercel Project Setup

### 1.1 Import your repo

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your GitHub repository
3. **IMPORTANT** — Set **Root Directory** to `web`
4. Framework Preset will auto-detect **Next.js**
5. Leave Build Command as default (`npm run build`)
6. Leave Output Directory as default (`.next`)

### 1.2 Environment Variables

In Vercel → Project → Settings → Environment Variables, add:

| Variable | Value | Environment |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `https://birgenai-api-529186868469.us-central1.run.app` | Production, Preview, Dev |
| `NEXT_PUBLIC_TMDB_API_KEY` | `your_tmdb_v3_api_key` | Production, Preview, Dev |
| `TMDB_READ_ACCESS_TOKEN` | `your_tmdb_v4_read_token` | Production, Preview, Dev |
| `NEXT_PUBLIC_R2_PUBLIC_URL` | `https://assets.birgenai.com` | Production, Preview |
| `NEXT_PUBLIC_CF_STREAM_DOMAIN` | `customer-XXXXX.cloudflarestream.com` | Production, Preview |

> **Note:** Leave `NEXT_PUBLIC_R2_PUBLIC_URL` empty for local development so assets serve from `public/`.

### 1.3 Custom Domain

1. In Vercel → Project → Settings → Domains
2. Add: `movies.birgenai.com`
3. Vercel will show you the **CNAME target** — something like `cname.vercel-dns.com`
4. **Do NOT use Vercel's nameservers** — you'll configure DNS in Cloudflare (Step 2)

---

## Step 2 — Cloudflare DNS Configuration

### Prerequisites
- Your domain `birgenai.com` must already be added to Cloudflare
- Cloudflare must be the authoritative nameserver for `birgenai.com`

### 2.1 Add DNS Records

Go to **Cloudflare Dashboard → birgenai.com → DNS → Records** and add:

#### For `movies.birgenai.com` (Vercel):

| Type | Name | Target | Proxy | TTL |
|---|---|---|---|---|
| **CNAME** | `movies` | `cname.vercel-dns.com` | **DNS only** (grey cloud) | Auto |

> **CRITICAL**: Set proxy status to **DNS only** (grey cloud icon), NOT proxied (orange cloud).
> Vercel handles its own SSL and edge caching. Cloudflare proxy would interfere with Vercel's TLS certificate provisioning.

#### For `assets.birgenai.com` (Cloudflare R2):

| Type | Name | Target | Proxy | TTL |
|---|---|---|---|---|
| **CNAME** | `assets` | *(your R2 public bucket endpoint)* | **Proxied** (orange cloud) | Auto |

> The R2 CNAME target is set up automatically when you connect a custom domain to your R2 bucket (Step 3).

#### For the root domain (if hosting main site elsewhere):

| Type | Name | Target | Proxy | TTL |
|---|---|---|---|---|
| **A** | `@` | `76.76.21.21` | DNS only | Auto |
| **AAAA** | `@` | `2606:4700:3108::ac42:28b4` | DNS only | Auto |

> The A/AAAA records above are Vercel's IPs — only needed if you want `birgenai.com` (root) to also point to Vercel. Adjust based on your actual root domain setup.

### 2.2 SSL/TLS Settings

In **Cloudflare → SSL/TLS**:
- Set mode to **Full (strict)**
- This ensures Cloudflare doesn't downgrade the connection

### 2.3 Verify Domain in Vercel

After adding the CNAME:
1. Go back to Vercel → Project → Settings → Domains
2. `movies.birgenai.com` should show as **Valid Configuration**
3. Vercel will auto-provision a Let's Encrypt SSL certificate
4. Wait 1-5 minutes for DNS propagation

---

## Step 3 — Cloudflare R2 Setup (Video & Image Hosting)

Your video files (393MB total) exceed Vercel's static file limits. Cloudflare R2 serves them with zero egress fees.

### 3.1 Create R2 Bucket

1. Cloudflare Dashboard → R2 Object Storage → Create bucket
2. Name: `birgenai-assets`
3. Location: Auto (or choose closest to your users)

### 3.2 Connect Custom Domain

1. In the bucket settings → Custom Domains
2. Add: `assets.birgenai.com`
3. Cloudflare will automatically configure the CNAME DNS record
4. SSL is handled automatically

### 3.3 Upload Assets

Upload your video and image files maintaining the folder structure:

```
birgenai-assets/
├── Videos/
│   ├── hero-getout-2017.mp4
│   ├── hero-inception-2010.mp4
│   ├── hero-shutter-island.mp4
│   ├── hero-sicario-2015.mp4
│   ├── hero-thedarkknight-2008.mp4
│   ├── trailer-getout-2017.mp4
│   ├── trailer-inception-2010.mp4
│   ├── trailer-shutter-island.mp4
│   ├── trailer-sicario-2015.mp4
│   └── trailer-thedarkknight-2008.mp4
└── Images/
    ├── getout.png
    ├── hero-inception.webp
    ├── hero-shutter-island.jpg
    ├── hero-sicario.jpg
    ├── hero-the-dark-knight-2008.webp
    └── movies.jpg
```

Upload via CLI (install wrangler first):

```bash
npm install -g wrangler
wrangler login

# Upload all videos
cd web/public
wrangler r2 object put birgenai-assets/Videos/hero-getout-2017.mp4 --file Videos/hero-getout-2017.mp4
wrangler r2 object put birgenai-assets/Videos/hero-inception-2010.mp4 --file Videos/hero-inception-2010.mp4
wrangler r2 object put birgenai-assets/Videos/hero-shutter-island.mp4 --file Videos/hero-shutter-island.mp4
wrangler r2 object put birgenai-assets/Videos/hero-sicario-2015.mp4 --file Videos/hero-sicario-2015.mp4
wrangler r2 object put birgenai-assets/Videos/hero-thedarkknight-2008.mp4 --file Videos/hero-thedarkknight-2008.mp4
wrangler r2 object put birgenai-assets/Videos/trailer-getout-2017.mp4 --file Videos/trailer-getout-2017.mp4
wrangler r2 object put birgenai-assets/Videos/trailer-inception-2010.mp4 --file Videos/trailer-inception-2010.mp4
wrangler r2 object put birgenai-assets/Videos/trailer-shutter-island.mp4 --file Videos/trailer-shutter-island.mp4
wrangler r2 object put birgenai-assets/Videos/trailer-sicario-2015.mp4 --file Videos/trailer-sicario-2015.mp4
wrangler r2 object put birgenai-assets/Videos/trailer-thedarkknight-2008.mp4 --file Videos/trailer-thedarkknight-2008.mp4

# Upload all images
wrangler r2 object put birgenai-assets/Images/getout.png --file Images/getout.png
wrangler r2 object put birgenai-assets/Images/hero-inception.webp --file Images/hero-inception.webp
wrangler r2 object put birgenai-assets/Images/hero-shutter-island.jpg --file Images/hero-shutter-island.jpg
wrangler r2 object put birgenai-assets/Images/hero-sicario.jpg --file Images/hero-sicario.jpg
wrangler r2 object put birgenai-assets/Images/hero-the-dark-knight-2008.webp --file Images/hero-the-dark-knight-2008.webp
wrangler r2 object put birgenai-assets/Images/movies.jpg --file Images/movies.jpg
```

### 3.4 Set CORS (if needed)

In R2 bucket → Settings → CORS Policy, add:

```json
[
  {
    "AllowedOrigins": ["https://movies.birgenai.com"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 86400
  }
]
```

### 3.5 Cache Rules

Cloudflare automatically caches R2 assets when the custom domain is proxied (orange cloud). For video files, the default behavior is optimal — they're cached at the edge.

---

## Step 4 — Deploy

### Option A: Auto-deploy via Git

1. Push to your main branch
2. Vercel auto-builds and deploys

### Option B: Manual deploy via CLI

```bash
npm install -g vercel
cd web
vercel --prod
```

When prompted:
- Set up and deploy? **Y**
- Which scope? (your Vercel account)
- Link to existing project? **Y** (if already created)
- What's the root directory? `.` (since you're already in `web/`)

---

## Step 5 — Verify

After deployment:

1. Visit `https://movies.birgenai.com` — should load the app
2. Check hero banner videos load (sourced from `assets.birgenai.com`)
3. Check movie posters load (TMDB enrichment)
4. Check recommendations work (backend API)
5. Open DevTools → Network tab → confirm videos load from `assets.birgenai.com`

### Troubleshooting

| Issue | Fix |
|---|---|
| Vercel shows "Invalid Configuration" for domain | Verify CNAME is `movies` → `cname.vercel-dns.com`, proxy OFF |
| SSL certificate error | Wait 5 minutes; ensure Cloudflare proxy is OFF for `movies` |
| Videos don't load | Check R2 bucket has public access, custom domain is set, `NEXT_PUBLIC_R2_PUBLIC_URL` is set in Vercel |
| Images broken on production | Verify `assets.birgenai.com` hostname is in `next.config.mjs` `remotePatterns` |
| TMDB posters missing | Verify `TMDB_READ_ACCESS_TOKEN` is set in Vercel env vars |
| API calls fail | Verify `NEXT_PUBLIC_API_URL` is set, Cloud Run service is running |

---

## File Summary

| File | Purpose |
|---|---|
| `web/vercel.json` | Vercel config: build settings, security headers, caching |
| `web/.vercelignore` | Excludes `public/Videos/` from deploy (served via R2) |
| `web/next.config.mjs` | Next.js config: image domains, API CORS headers |
| `web/lib/assets.ts` | Asset URL resolver: local in dev, R2 in production |
| `web/.env.example` | All environment variables documented |
