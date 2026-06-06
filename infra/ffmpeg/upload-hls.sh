#!/usr/bin/env bash
# Upload an existing ./hls/<slug>/ tree to R2 (no transcoding).
#
# Usage (from infra/ffmpeg):
#   ./upload-hls.sh inception
#   R2_BUCKET=my-bucket ./upload-hls.sh inception
#
# Copy a folder from another machine into:
#   infra/ffmpeg/hls/<slug>/
# matching the layout from transcode-hls.sh (master.m3u8, poster.jpg, 1080p/…).
#
# Uses wrangler … --remote (Wrangler 4 defaults to a local R2 simulator without it).
set -euo pipefail

SLUG="${1:?Usage: $0 <slug> (e.g. inception — folder must exist at ./hls/<slug>/)}"
R2_BUCKET="${R2_BUCKET:-birgenai-assets}"
OUT="$(pwd)/hls/$SLUG"

if [[ ! -d "$OUT" ]]; then
  echo "Folder not found: $OUT" >&2
  echo "Copy your pre-transcoded tree there, then rerun." >&2
  exit 1
fi

if ! command -v wrangler >/dev/null 2>&1; then
  echo "wrangler is not installed. npm i -g wrangler && wrangler login" >&2
  exit 1
fi

if [[ ! -f "$OUT/master.m3u8" ]]; then
  echo "Warning: missing $OUT/master.m3u8 — upload may be incomplete." >&2
fi

echo "→ Uploading ./hls/$SLUG/ to R2 bucket '$R2_BUCKET' as Videos/films/$SLUG/"

while IFS= read -r -d '' FILE; do
  REL="${FILE#$OUT/}"
  REL="${REL#/}" # strip leading slash if any
  KEY="Videos/films/$SLUG/$REL"
  case "$REL" in
    *.m3u8) CT="application/vnd.apple.mpegurl" ;;
    *.ts)   CT="video/mp2t" ;;
    *.jpg|*.jpeg) CT="image/jpeg" ;;
    *.png)  CT="image/png" ;;
    *)      CT="application/octet-stream" ;;
  esac
  echo "  $KEY"
  if ! wrangler r2 object put "$R2_BUCKET/$KEY" --file="$FILE" --content-type="$CT" --remote; then
    echo "✗ wrangler failed for: $KEY — create bucket with: wrangler r2 bucket create '$R2_BUCKET' (once), or fix R2 permissions on your API token." >&2
    exit 1
  fi
done < <(find "$OUT" -type f -print0)

echo "✓ Done."
echo "  https://<R2_PUBLIC_HOST>/Videos/films/$SLUG/master.m3u8"
