# BirgenAI subtitles — English · Kiswahili · French

Generate WebVTT subtitle tracks from a movie's audio and publish them to R2.
Kiswahili subtitles for international films are the headline differentiator — no
Showmax/Netflix competitor ships them.

## How it works

1. **faster-whisper** transcribes the movie audio to **timed English cues**
   (timestamps come from the audio, so they line up with the HLS transcode — no
   manual syncing).
2. **NLLB-200** translates each cue to **Kiswahili** and **French**.
3. The script writes WebVTT files into the exact R2 upload layout.

This transcribes audio **you own/licensed** — the dialogue text is whatever
Whisper hears in your file. Always have a fluent Kiswahili speaker proof the
`sw` pass before publishing; machine translation is a strong first draft.

## Setup

```bash
cd movie-recommender/scripts/subtitles
python -m venv .venv && source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -r requirements.txt                       # needs ffmpeg installed too
```

## Run (Get Out)

```bash
python generate_subs.py \
  --input "/path/to/get-out-2017.mp4" \
  --asset-key get-out-2017 \
  --model large-v3 \
  --langs sw,fr \
  --out ./out
```

Output:

```
out/Subtitles/
├── en/get-out-2017-en.vtt
├── sw/get-out-2017-sw.vtt
└── fr/get-out-2017-fr.vtt
```

GPU is ~10–20× faster: `WHISPER_DEVICE=cuda WHISPER_COMPUTE=float16 python generate_subs.py ...`

## Publish to R2

Upload the `Subtitles/` tree to the **bucket root** (alongside `Images/`,
`Videos/`). With `rclone`:

```bash
rclone copy ./out/Subtitles  r2:your-bucket/Subtitles  --progress
```

…or the S3 API:

```bash
aws s3 cp ./out/Subtitles s3://your-bucket/Subtitles \
  --recursive --content-type text/vtt --endpoint-url https://<accountid>.r2.cloudflarestorage.com
```

The player then resolves, per `lib/subtitles.ts`:

```
https://assets.birgenai.com/Subtitles/en/get-out-2017-en.vtt
https://assets.birgenai.com/Subtitles/sw/get-out-2017-sw.vtt
https://assets.birgenai.com/Subtitles/fr/get-out-2017-fr.vtt
```

### Two gotchas

- **Content-Type** must be `text/vtt`. Set it on upload (flag above) or the
  browser may refuse the track.
- **CORS**: `<track>` is fetched with CORS, like HLS. The R2 bucket currently
  only allows `https://movies.birgenai.com`; add any other origin you serve from
  or captions silently won't load there.

## In the app

No code changes needed per title — `getSubtitleTracksForSlug(slug)` advertises
`en/sw/fr` for any catalogue slug, the watch page passes them to `VideoPlayer`,
and the **CC button** appears with an Off / English / Kiswahili / Français menu.
A language whose `.vtt` isn't uploaded yet simply won't display (the browser
ignores the 404), so you can ship languages incrementally.

`samples/` holds tiny **format-reference** files (placeholder text, not real
dialogue) so you can verify the player end-to-end before the real generation run.
