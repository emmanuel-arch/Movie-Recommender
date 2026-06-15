# Publishing the 6 new 1080p films

One command does everything for all six titles — **transcode, subtitles, card
backdrop, upload to R2, verify every object returns HTTP 200, and flip the title
live in the catalog** — and it is safe to interrupt at any point (close the laptop,
power loss, Ctrl-C). Just run it again and it resumes exactly where it stopped.

```powershell
cd "C:\Users\Arch Bishop\Documents\BIRGEN AI 2.0\movie-recommender\infra\ffmpeg"
.\publish-new-films.ps1
```

That replaces the old two-step manual flow (`transcode-hls.ps1` then
`upload-hls-rclone.ps1`) for these six. You can still use the old scripts for
one-off titles; this orchestrator just wraps them and adds subtitles, the card
backdrop, 200-verification, and the catalog flip.

## The six titles

| Slug (= R2 folder = assetKey) | Source | Notes |
|---|---|---|
| `crime-101-2026`           | `Crime 101 ... HEVC x265 BONE.mkv` | **HEVC** → re-encoded to H.264 so it plays in the browser. No subtitles. |
| `apex-2026`                | `Apex (2026) ... .mp4`             | English + French subs |
| `mercy-2026`               | `Mercy (2026) ... .mp4`            | English subs |
| `send-help-2026`           | `Send Help (2026) ... .mp4`        | No subtitles |
| `jack-ryan-ghost-war-2026` | `Jack Ryan Ghost War (2026) ...mp4`| English + French subs |
| `the-wrecking-crew-2026`   | `The Wrecking Crew (2026) ...mp4`  | English subs |

All six are 1080p. Each is re-encoded into a **4-bitrate ABR ladder**
(1080p/720p/480p/360p) and **downmixed to stereo** (the sources are 5.1, which
breaks in-browser HLS). Crime 101's HEVC/x265 is converted to H.264 — that is the
only reason it will play in a browser at all.

## What it uploads to R2 (`birgenai-assets`)

- `Videos/films/<slug>/master.m3u8` + `1080p|720p|480p|360p/stream.m3u8` + `segNNN.ts` + `poster.jpg`
- `Subtitles/en/<assetKey>-en.vtt`, `Subtitles/fr/<assetKey>-fr.vtt` (where a source .srt exists; `.srt` → WebVTT is automatic)
- `Images/backdrops/backdrop-<assetKey>.jpg` (a 1920×1080 frame grab — the card looks right immediately)

## How resume works

State lives in `.pipeline-state\`. Per title the stages are gated:
`transcoded` → `assets` → upload (rclone `--size-only`, only missing files) →
`verified` (HEAD every public URL; a title is done only when **100% return 200**).
The whole set loops until every title verifies (the CDN can briefly 404 a fresh
key; the loop retries). A finished title is skipped on the next run.

## Useful flags

```powershell
.\publish-new-films.ps1 -DryRun                 # report state; do nothing
.\publish-new-films.ps1 -Only crime-101-2026    # just one (or a comma list)
.\publish-new-films.ps1 -SkipImages             # don't make/upload the backdrop frame
.\publish-new-films.ps1 -SkipSubs               # don't convert/upload subtitles
.\publish-new-films.ps1 -NoFlip                 # verify only, don't edit catalog.ts
.\publish-new-films.ps1 -ForceTranscode         # re-encode even if already done
```

## After it finishes

1. The six are already flipped `playable: true` in `web/lib/catalog.ts`. **Commit
   that file and deploy the web app.**
2. They lead the **"Now Streaming in HD"** row (newest `createdAt`).
3. **Verify the metadata** in `catalog.ts` (lines tagged `// verify`): cast,
   director, rating, runtime. It is a best-effort first pass.
4. Optional: drop bespoke cinematic card art (title baked in, 1920×1080 JPG) at
   `Images/cards/card-<assetKey>.jpg` in R2. It takes over automatically; until
   then the frame-grab backdrop + app-drawn title is shown.

## Credentials

Same as `upload-hls-rclone.ps1`: copy `.r2-credentials.ps1.example` →
`.r2-credentials.ps1` and fill in an R2 API token (Object Read & Write), or set
`R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` in the environment.
