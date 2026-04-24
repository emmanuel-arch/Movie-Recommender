#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# BirgenAI HLS Transcode + Upload — single-pass, four-bitrate adaptive stream.
#
# Usage:
#   ./transcode-hls.sh <input.mp4> <slug> [--upload]
#
# Produces a production-ready HLS ladder under ./hls/<slug>/ with the same
# folder structure expected by R2:
#
#   Videos/<slug>/
#     master.m3u8
#     1080p/{stream.m3u8, segNNN.ts}
#     720p/{stream.m3u8,  segNNN.ts}
#     480p/{stream.m3u8,  segNNN.ts}
#     360p/{stream.m3u8,  segNNN.ts}
#     poster.jpg          # generated from 10s mark
#
# If --upload is passed, the folder is pushed into R2 via Wrangler. The bucket
# is read from $R2_BUCKET (default: birgenai-assets).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

INPUT="${1:?Usage: $0 <input.mp4> <slug> [--upload]}"
SLUG="${2:?slug is required (e.g. nairobi-half-life)}"
UPLOAD="${3:-}"

R2_BUCKET="${R2_BUCKET:-birgenai-assets}"
OUT="./hls/$SLUG"

if [[ ! -f "$INPUT" ]]; then
  echo "Input not found: $INPUT" >&2
  exit 1
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg is not installed. brew install ffmpeg / choco install ffmpeg / apt install ffmpeg" >&2
  exit 1
fi

mkdir -p "$OUT"/{1080p,720p,480p,360p}

echo "→ Transcoding 4-bitrate ABR ladder for '$SLUG'..."

ffmpeg -y -i "$INPUT" \
  -filter_complex "[0:v]split=4[v1][v2][v3][v4]" \
  \
  -map "[v1]" -map 0:a -c:v libx264 -crf 20 -preset fast -vf "scale=1920:1080" -b:v 4500k -maxrate 4800k -bufsize 9000k -c:a aac -b:a 128k \
    -f hls -hls_time 6 -hls_list_size 0 -hls_playlist_type vod \
    -hls_segment_filename "$OUT/1080p/seg%03d.ts" "$OUT/1080p/stream.m3u8" \
  \
  -map "[v2]" -map 0:a -c:v libx264 -crf 22 -preset fast -vf "scale=1280:720"  -b:v 2500k -maxrate 2800k -bufsize 5000k -c:a aac -b:a 128k \
    -f hls -hls_time 6 -hls_list_size 0 -hls_playlist_type vod \
    -hls_segment_filename "$OUT/720p/seg%03d.ts"  "$OUT/720p/stream.m3u8" \
  \
  -map "[v3]" -map 0:a -c:v libx264 -crf 24 -preset fast -vf "scale=854:480"   -b:v 1000k -maxrate 1200k -bufsize 2000k -c:a aac -b:a 96k  \
    -f hls -hls_time 6 -hls_list_size 0 -hls_playlist_type vod \
    -hls_segment_filename "$OUT/480p/seg%03d.ts"  "$OUT/480p/stream.m3u8" \
  \
  -map "[v4]" -map 0:a -c:v libx264 -crf 28 -preset fast -vf "scale=640:360"   -b:v 400k  -maxrate 500k  -bufsize 1000k -c:a aac -b:a 64k  \
    -f hls -hls_time 6 -hls_list_size 0 -hls_playlist_type vod \
    -hls_segment_filename "$OUT/360p/seg%03d.ts"  "$OUT/360p/stream.m3u8"

echo "→ Writing master.m3u8"
cat > "$OUT/master.m3u8" <<EOF
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=4628000,RESOLUTION=1920x1080,CODECS="avc1.640028,mp4a.40.2"
1080p/stream.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2628000,RESOLUTION=1280x720,CODECS="avc1.64001f,mp4a.40.2"
720p/stream.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1096000,RESOLUTION=854x480,CODECS="avc1.64001e,mp4a.40.2"
480p/stream.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=464000,RESOLUTION=640x360,CODECS="avc1.64001e,mp4a.40.2"
360p/stream.m3u8
EOF

echo "→ Generating poster frame"
ffmpeg -y -ss 00:00:10 -i "$INPUT" -frames:v 1 -q:v 2 -vf "scale=1280:-1" "$OUT/poster.jpg"

echo "✓ Done. Output: $OUT"

if [[ "$UPLOAD" == "--upload" ]]; then
  if ! command -v wrangler >/dev/null 2>&1; then
    echo "wrangler is not installed. npm i -g wrangler" >&2
    exit 1
  fi

  echo "→ Uploading to R2 bucket '$R2_BUCKET' under Videos/$SLUG/"

  # Upload each file preserving the folder layout.
  while IFS= read -r -d '' FILE; do
    REL="${FILE#$OUT/}"
    KEY="Videos/$SLUG/$REL"
    # Derive content type
    case "$REL" in
      *.m3u8) CT="application/vnd.apple.mpegurl" ;;
      *.ts)   CT="video/mp2t" ;;
      *.jpg|*.jpeg) CT="image/jpeg" ;;
      *.png)  CT="image/png" ;;
      *)      CT="application/octet-stream" ;;
    esac
    echo "  $KEY"
    wrangler r2 object put "$R2_BUCKET/$KEY" --file="$FILE" --content-type="$CT" >/dev/null
  done < <(find "$OUT" -type f -print0)

  echo "✓ Uploaded all objects."
  echo ""
  echo "Master playlist public URL (if bucket has a public domain):"
  echo "  https://<R2_PUBLIC_HOST>/Videos/$SLUG/master.m3u8"
fi
