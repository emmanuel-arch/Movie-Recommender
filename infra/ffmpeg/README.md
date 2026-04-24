# BirgenAI HLS Transcode Pipeline

Transcode a source MP4 to a 4-bitrate adaptive HLS ladder (1080p / 720p / 480p / 360p) locally with FFmpeg, then upload to Cloudflare R2 with Wrangler. No cloud transcoding — zero ongoing cost.

## Prerequisites

- `ffmpeg` (x264 + AAC)
- `wrangler` authenticated against your Cloudflare account (`wrangler login`)
- An R2 bucket (default: `birgenai-assets`) with a public URL (custom domain or `pub-*.r2.dev`)

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

### macOS / Linux
```bash
chmod +x transcode-hls.sh
./transcode-hls.sh /path/to/movie.mp4 nairobi-half-life --upload
```

### Windows (PowerShell)
```powershell
.\transcode-hls.ps1 -Input C:\videos\movie.mp4 -Slug nairobi-half-life -Upload
```

### Override R2 bucket
```bash
R2_BUCKET=my-bucket ./transcode-hls.sh movie.mp4 my-slug --upload
```
```powershell
.\transcode-hls.ps1 -Input movie.mp4 -Slug my-slug -R2Bucket my-bucket -Upload
```

## Batch (all 5 launch titles)

```bash
for movie in \
  "getout-2017.mp4:get-out" \
  "sicario-2015.mp4:sicario" \
  "inception-2010.mp4:inception" \
  "darkknight-2008.mp4:the-dark-knight" \
  "shutter-island-2010.mp4:shutter-island"
do
  IFS=":" read -r FILE SLUG <<< "$movie"
  ./transcode-hls.sh "$FILE" "$SLUG" --upload
done
```

## Encoding ladder (what `ffmpeg` produces)

| Level | Resolution | Bitrate  | Audio    | CRF |
|-------|-----------:|---------:|---------:|----:|
| 1080p | 1920×1080  |  4500 k  | 128 k    | 20  |
| 720p  | 1280×720   |  2500 k  | 128 k    | 22  |
| 480p  |  854×480   |  1000 k  |  96 k    | 24  |
| 360p  |  640×360   |   400 k  |  64 k    | 28  |

Segments are 6 s so HLS.js's ABR can switch rungs within ~12 s of a bandwidth change. A typical 2 h film produces ~8 GB total across all 4 ladders.

## After upload — wire it up

Add the slug to `web/lib/hls.ts` → `KENYAN_HLS_MAP` (or ingest from Supabase). The player URL is always:

```
https://<NEXT_PUBLIC_R2_PUBLIC_URL>/Videos/<slug>/master.m3u8
```
