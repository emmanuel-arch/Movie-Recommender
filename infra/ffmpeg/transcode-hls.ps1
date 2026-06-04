<#
.SYNOPSIS
  BirgenAI HLS Transcode + Upload — Windows PowerShell version.

.DESCRIPTION
  Mirrors transcode-hls.sh: produces a 4-bitrate ABR ladder for a single MP4
  input and (optionally) uploads the result to Cloudflare R2 via Wrangler.

.PARAMETER Input
  Path to the source MP4.
.PARAMETER Slug
  Folder / URL slug for this movie (e.g. 'nairobi-half-life').
.PARAMETER Upload
  If set, pushes the output to R2 via `wrangler r2 object put`.
.PARAMETER R2Bucket
  R2 bucket name. Defaults to 'birgenai-assets'.

.EXAMPLE
  .\transcode-hls.ps1 -Input .\movie.mp4 -Slug nairobi-half-life -Upload
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Input,
  [Parameter(Mandatory = $true)][string]$Slug,
  [switch]$Upload,
  [string]$R2Bucket = 'birgenai-assets'
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $Input)) { throw "Input not found: $Input" }
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
  throw "ffmpeg is not installed. Try: choco install ffmpeg / winget install Gyan.FFmpeg"
}

$Out = Join-Path (Get-Location) "hls/$Slug"
$null = New-Item -ItemType Directory -Force -Path "$Out/1080p", "$Out/720p", "$Out/480p", "$Out/360p"

Write-Host "-> Transcoding 4-bitrate ABR ladder for '$Slug'..." -ForegroundColor Cyan

# All scaling in filter_complex — FFmpeg 6+ errors if -vf is used on a stream
# already produced by -filter_complex.
$filterComplex = '[0:v]split=4[v1][v2][v3][v4];' +
  '[v1]scale=1920:1080:flags=lanczos[v1s];' +
  '[v2]scale=1280:720:flags=lanczos[v2s];' +
  '[v3]scale=854:480:flags=lanczos[v3s];' +
  '[v4]scale=640:360:flags=lanczos[v4s]'

$ffArgs = @(
  '-y', '-i', $Input,
  '-filter_complex', $filterComplex,

  '-map', '[v1s]', '-map', '0:a',
  '-c:v', 'libx264', '-crf', '20', '-preset', 'fast',
  '-b:v', '4500k', '-maxrate', '4800k', '-bufsize', '9000k',
  '-c:a', 'aac', '-b:a', '128k',
  '-f', 'hls', '-hls_time', '6', '-hls_list_size', '0', '-hls_playlist_type', 'vod',
  '-hls_segment_filename', "$Out/1080p/seg%03d.ts", "$Out/1080p/stream.m3u8",

  '-map', '[v2s]', '-map', '0:a',
  '-c:v', 'libx264', '-crf', '22', '-preset', 'fast',
  '-b:v', '2500k', '-maxrate', '2800k', '-bufsize', '5000k',
  '-c:a', 'aac', '-b:a', '128k',
  '-f', 'hls', '-hls_time', '6', '-hls_list_size', '0', '-hls_playlist_type', 'vod',
  '-hls_segment_filename', "$Out/720p/seg%03d.ts", "$Out/720p/stream.m3u8",

  '-map', '[v3s]', '-map', '0:a',
  '-c:v', 'libx264', '-crf', '24', '-preset', 'fast',
  '-b:v', '1000k', '-maxrate', '1200k', '-bufsize', '2000k',
  '-c:a', 'aac', '-b:a', '96k',
  '-f', 'hls', '-hls_time', '6', '-hls_list_size', '0', '-hls_playlist_type', 'vod',
  '-hls_segment_filename', "$Out/480p/seg%03d.ts", "$Out/480p/stream.m3u8",

  '-map', '[v4s]', '-map', '0:a',
  '-c:v', 'libx264', '-crf', '28', '-preset', 'fast',
  '-b:v', '400k', '-maxrate', '500k', '-bufsize', '1000k',
  '-c:a', 'aac', '-b:a', '64k',
  '-f', 'hls', '-hls_time', '6', '-hls_list_size', '0', '-hls_playlist_type', 'vod',
  '-hls_segment_filename', "$Out/360p/seg%03d.ts", "$Out/360p/stream.m3u8"
)

& ffmpeg @ffArgs

Write-Host "-> Writing master.m3u8" -ForegroundColor Cyan
@'
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
'@ | Out-File -FilePath "$Out/master.m3u8" -Encoding ascii

Write-Host "-> Generating poster frame" -ForegroundColor Cyan
& ffmpeg -y -ss '00:00:10' -i $Input -frames:v 1 -q:v 2 -vf 'scale=1280:-1' "$Out/poster.jpg"

Write-Host "OK Output: $Out" -ForegroundColor Green

if ($Upload) {
  if (-not (Get-Command wrangler -ErrorAction SilentlyContinue)) {
    throw "wrangler not installed. npm i -g wrangler"
  }
  Write-Host "-> Uploading to R2 bucket '$R2Bucket' under Videos/$Slug/" -ForegroundColor Cyan

  Get-ChildItem -Path $Out -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($Out.Length + 1).Replace('\', '/')
    $key = "Videos/$Slug/$rel"
    $ct = switch -Regex ($rel) {
      '\.m3u8$' { 'application/vnd.apple.mpegurl' ; break }
      '\.ts$'   { 'video/mp2t' ; break }
      '\.(jpe?g)$' { 'image/jpeg' ; break }
      '\.png$'  { 'image/png' ; break }
      default   { 'application/octet-stream' }
    }
    Write-Host "  $key"
    & wrangler r2 object put "$R2Bucket/$key" --file=$_.FullName --content-type=$ct --remote
    if ($LASTEXITCODE -ne 0) {
      throw "wrangler failed for '$key' (exit $LASTEXITCODE). Create bucket if needed: wrangler r2 bucket create $R2Bucket"
    }
  }
  Write-Host "OK Uploaded all objects." -ForegroundColor Green
  Write-Host "Master playlist URL (if bucket has public domain):"
  Write-Host "  https://<R2_PUBLIC_HOST>/Videos/$Slug/master.m3u8"
}
