# BirgenAI HLS Transcode Pipeline

Transcode a source MP4 to a 4-bitrate adaptive HLS ladder (1080p / 720p / 480p / 360p) locally with FFmpeg, then upload to Cloudflare R2 with Wrangler. No cloud transcoding — zero ongoing cost.

## Prerequisites

- **`ffmpeg`** (must be on your **`PATH`**) — x264 + AAC. This folder does **not** use `package.json`; **`npm install` here will fail** and does not install FFmpeg.
- **`wrangler`** — Node CLI; install globally (`npm install -g wrangler`) or use `npx wrangler`, then `wrangler login`.
- An R2 bucket (default: `birgenai-assets`) with a public URL (custom domain or `pub-*.r2.dev`)

### Install FFmpeg on Windows

In **PowerShell** (or CMD), run one of:

```powershell
winget install Gyan.FFmpeg
```

```powershell
choco install ffmpeg
```

After install, **close and reopen** the terminal so `PATH` updates, then check:

```powershell
ffmpeg -version
```

Git Bash uses the same Windows `PATH`; if `ffmpeg -version` works in PowerShell but not in Git Bash, restart Git Bash.

## Folder layout produced

```
Videos/<slug>/
  master.m3u8          # the only URL the player loads
  poster.jpg           # 10s-mark frame
  1080p/stream.m3u8
  1080p/seg000.ts …
  720p/stream.m3u8
  720p/seg000.ts  …
  480p/…
  360p/…
```

## Run it

**Always run from `infra/ffmpeg`** (or call the script with that path). From repo root, `bash: ./transcode-hls.sh: No such file or directory` means you are in the wrong folder.

```bash
cd infra/ffmpeg
chmod +x transcode-hls.sh   # macOS / Linux once
```

### macOS / Linux
```bash
./transcode-hls.sh /path/to/movie.mp4 nairobi-half-life --upload
```

### Windows (PowerShell)

From `infra\ffmpeg`:

```powershell
cd infra\ffmpeg
.\transcode-hls.ps1 -Input C:\videos\movie.mp4 -Slug nairobi-half-life -Upload
```

### Windows (Git Bash)

Git Bash maps `C:\videos\` → `/c/videos/`. From `infra/ffmpeg`:

```bash
cd infra/ffmpeg
./transcode-hls.sh /c/videos/movie.mp4 nairobi-half-life --upload
```

### Override R2 bucket
```bash
R2_BUCKET=my-bucket ./transcode-hls.sh movie.mp4 my-slug --upload
```
```powershell
.\transcode-hls.ps1 -Input movie.mp4 -Slug my-slug -R2Bucket my-bucket -Upload
```

## Upload only (HLS already transcoded elsewhere)

If **Inception** (or any title) was already encoded on another PC, copy the finished tree into **`infra/ffmpeg/hls/<slug>/`** so it matches the layout above (`master.m3u8`, `poster.jpg`, `1080p/`, …). The slug must match **`web/lib/hls.ts`** (e.g. `inception`, not `Inception`).

Then from **`infra/ffmpeg`**:

```bash
chmod +x upload-hls.sh   # once on Unix
./upload-hls.sh inception
```

```bash
R2_BUCKET=birgenai-assets ./upload-hls.sh inception
```

```powershell
.\upload-hls.ps1 -Slug inception
.\upload-hls.ps1 -Slug inception -R2Bucket birgenai-assets
```

That runs the same `wrangler r2 object put` layout as `--upload` on `transcode-hls.sh`, without running FFmpeg.

**Checks before upload:** `master.m3u8` exists; segment `.ts` files sit next to each `stream.m3u8` under `1080p/`, `720p/`, etc.; relative paths inside the playlists still work when the folder is copied as-is.

## Batch (all 5 launch titles)

Paths must point at your real files (here: `C:\videos\` → `/c/videos/` in Git Bash). **Run inside `infra/ffmpeg`.**

### Git Bash (Windows)

```bash
cd infra/ffmpeg
for movie in \
  "/c/videos/getout-2017.mp4:get-out" \
  "/c/videos/sicario-2015.mp4:sicario" \
  "/c/videos/inception-2010.mp4:inception" \
  "/c/videos/darkknight-2008.mp4:the-dark-knight" \
  "/c/videos/shutter-island-2010.mp4:shutter-island"
do
  IFS=":" read -r FILE SLUG <<< "$movie"
  ./transcode-hls.sh "$FILE" "$SLUG" --upload
done
```

### macOS / Linux

```bash
cd infra/ffmpeg
for movie in \
  "/path/to/videos/getout-2017.mp4:get-out" \
  "/path/to/videos/sicario-2015.mp4:sicario" \
  "/path/to/videos/inception-2010.mp4:inception" \
  "/path/to/videos/darkknight-2008.mp4:the-dark-knight" \
  "/path/to/videos/shutter-island-2010.mp4:shutter-island"
do
  IFS=":" read -r FILE SLUG <<< "$movie"
  ./transcode-hls.sh "$FILE" "$SLUG" --upload
done
```

### PowerShell (Windows) — run each line or save as `batch-hls.ps1` next to `transcode-hls.ps1`

```powershell
Set-Location infra\ffmpeg
$jobs = @(
  @{ File = 'C:\videos\getout-2017.mp4';       Slug = 'get-out' },
  @{ File = 'C:\videos\sicario-2015.mp4';     Slug = 'sicario' },
  @{ File = 'C:\videos\inception-2010.mp4';   Slug = 'inception' },
  @{ File = 'C:\videos\darkknight-2008.mp4';  Slug = 'the-dark-knight' },
  @{ File = 'C:\videos\shutter-island-2010.mp4'; Slug = 'shutter-island' }
)
foreach ($j in $jobs) {
  .\transcode-hls.ps1 -Input $j.File -Slug $j.Slug -Upload
}
```

## Encoding ladder (what `ffmpeg` produces)

| Level | Resolution | Bitrate  | Audio    | CRF |
|-------|-----------:|---------:|---------:|----:|
| 1080p | 1920×1080  |  4500 k  | 128 k    | 20  |
| 720p  | 1280×720   |  2500 k  | 128 k    | 22  |
| 480p  |  854×480   |  1000 k  |  96 k    | 24  |
| 360p  |  640×360   |   400 k  |  64 k    | 28  |

Segments are 6 s so HLS.js's ABR can switch rungs within ~12 s of a bandwidth change. A typical 2 h film produces ~8 GB total across all 4 ladders.

### Troubleshooting

**R2 upload does nothing / Wrangler errors**

0. **Wrangler 4 — `Resource location: local`:** If you omit `--remote`, `wrangler r2 object put` writes to a **local Miniflare-style simulator** on your machine, **not** the bucket in the Cloudflare dashboard. You should see **`… --remote`** in your command (our `transcode-hls` / `upload-hls` scripts add it). Smoke test:

   ```bash
   wrangler r2 object put birgenai-assets/Videos/sicario/_smoke.txt --file=r2-smoke.txt --content-type=text/plain --remote
   ```

   Delete the probe with `wrangler r2 object delete birgenai-assets/Videos/sicario/_smoke.txt --remote`. If that works, run **`./upload-hls.sh sicario`** (or `get-out`, `inception`) to push the full tree.

   After upload, **`Videos/sicario/`** should appear in the **`birgenai-assets`** bucket in the dashboard, or verify with:

   ```bash
   wrangler r2 object list birgenai-assets --remote --prefix Videos/sicario/
   ```

1. **Create the bucket once** (objects are not enough — the bucket name must exist):

   ```bash
   wrangler r2 bucket list
   wrangler r2 bucket create birgenai-assets
   ```

2. **`wrangler whoami` does not list “R2”** — OAuth login often still allows R2; if `r2 object put` returns **403** or **Unauthorized**, create an **API Token** in Cloudflare Dashboard: **My Profile → API Tokens → Create** with **Account → R2 Storage → Edit** (and read on the account), then:

   ```bash
   export CLOUDFLARE_API_TOKEN=…   # Unix
   # or in PowerShell:
   $env:CLOUDFLARE_API_TOKEN = "…"
   ```

3. **Public 404 on `https://assets…/Videos/…/master.m3u8`** means either the object key is wrong or the bucket is not published (custom domain / r2.dev **public access**). Upload can still succeed — confirm with `wrangler r2 object list birgenai-assets --remote --prefix Videos/sicario/` (see `wrangler r2 object list --help`).

**`Filtergraph 'scale=…' was specified for a stream fed from a complex filtergraph`** — fixed in current scripts by applying all `scale` inside `-filter_complex`. Update your checkout and rerun.

**`Simple and complex filtering cannot be used together`** — same root cause; use the latest `transcode-hls.sh` / `transcode-hls.ps1`.

## After upload — wire it up

Add the slug to `web/lib/hls.ts` → `KENYAN_HLS_MAP` (or ingest from Supabase). The player URL is always:

```
https://<NEXT_PUBLIC_R2_PUBLIC_URL>/Videos/<slug>/master.m3u8
```
