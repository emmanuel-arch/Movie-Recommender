<#
.SYNOPSIS
  BirgenAI HLS Transcode - SINGLE-PASS, reliable. Produces a 4-bitrate ABR ladder
  (1080p/720p/480p/360p) + master.m3u8 + poster for one source file.

.DESCRIPTION
  Each rendition is encoded in ONE linear ffmpeg pass straight from the source to
  end-of-file. Unlike the previous chunked approach, there is no lossless `-c copy`
  split, so a mid-file timestamp discontinuity or a briefly corrupt region can NOT
  silently truncate the output the way it did for goat-2026 / in-the-grey-2026 —
  ffmpeg decodes through it (concealing errors) and keeps going to the real EOF.

  RESUME: coarse, per-rendition. A rendition is "done" only when its stream.m3u8
  ends with #EXT-X-ENDLIST; on a re-run, finished renditions are skipped and an
  interrupted one is cleared and re-encoded from the start. (We trade per-chunk
  resume for correctness — the chunk method's resumability is what made it fragile.)

  COMPLETENESS GATE: after encoding, the summed #EXTINF duration of the 1080p
  rendition MUST be within -DurationTolerance of the source's ffprobe duration, or
  the script THROWS and writes no master.m3u8. A title with no master never uploads
  and never goes live, so a truncated transcode can't reach viewers again.

.PARAMETER InputPath   Source file (alias -Input). [ ] in names handled via -LiteralPath.
.PARAMETER Slug        Folder/URL slug -> hls\<slug>\.
.PARAMETER DurationTolerance  Max allowed |hls-source|/source. Default 0.02 (2%).
.PARAMETER Force       Re-encode every rendition even if already complete.

.EXAMPLE
  .\transcode-hls.ps1 -InputPath D:\goat-2026\goat-2026.mp4 -Slug goat-2026
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][Alias('Input')][string]$InputPath,
  [Parameter(Mandatory = $true)][string]$Slug,
  [double]$DurationTolerance = 0.02,
  [int]$MaxSourceDecodeErrors = 200,
  [switch]$Force
)

# NB: 'Continue', NOT 'Stop'. ffmpeg/ffprobe write normal warnings to stderr (e.g.
# "Referenced QT chapter track not found"); under 'Stop' PowerShell escalates the
# first such line into a fatal NativeCommandError, killing the transcode before it
# starts. Every real failure here is caught explicitly (Test-Path throws,
# $LASTEXITCODE checks, the completeness gate throw), so 'Continue' loses no safety.
$ErrorActionPreference = 'Continue'

if (-not (Test-Path -LiteralPath $InputPath)) { throw "Input not found: $InputPath" }
if (-not (Get-Command ffmpeg  -ErrorAction SilentlyContinue)) { throw "ffmpeg not installed. winget install Gyan.FFmpeg" }
if (-not (Get-Command ffprobe -ErrorAction SilentlyContinue)) { throw "ffprobe not installed (ships with ffmpeg)." }

$here = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }
$Out  = Join-Path $here "hls/$Slug"
foreach ($r in '1080p','720p','480p','360p') { $null = New-Item -ItemType Directory -Force -Path (Join-Path $Out $r) }

$Renditions = @(
  [pscustomobject]@{ Name='1080p'; W=1920; H=1080; Crf=20; Bv='4500k'; MaxRate='4800k'; BufSize='9000k'; Ab='128k' }
  [pscustomobject]@{ Name='720p';  W=1280; H=720;  Crf=22; Bv='2500k'; MaxRate='2800k'; BufSize='5000k'; Ab='128k' }
  [pscustomobject]@{ Name='480p';  W=854;  H=480;  Crf=24; Bv='1000k'; MaxRate='1200k'; BufSize='2000k'; Ab='96k'  }
  [pscustomobject]@{ Name='360p';  W=640;  H=360;  Crf=28; Bv='400k';  MaxRate='500k';  BufSize='1000k'; Ab='64k'  }
)

function Test-RenditionComplete([string]$rdir) {
  $m3u8 = Join-Path $rdir 'stream.m3u8'
  if (-not (Test-Path -LiteralPath $m3u8)) { return $false }
  $tail = Get-Content -LiteralPath $m3u8 -Tail 1 -ErrorAction SilentlyContinue
  return ($tail -eq '#EXT-X-ENDLIST')
}

function Get-PlaylistDuration([string]$m3u8) {
  if (-not (Test-Path -LiteralPath $m3u8)) { return 0.0 }
  $sum = 0.0
  foreach ($l in Get-Content -LiteralPath $m3u8) { if ($l -match '^#EXTINF:([0-9.]+)') { $sum += [double]$Matches[1] } }
  return $sum
}

# Source duration up front, so we can sanity-check it and gate on it at the end.
$srcDur = [double](& ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 -- "$InputPath" 2>$null)
if (-not $srcDur -or $srcDur -le 0) { throw "Could not read source duration for $InputPath" }
$srcTs = [TimeSpan]::FromSeconds($srcDur)
Write-Host ("-> Source: {0}  ({1:00}:{2:00}:{3:00})" -f (Split-Path $InputPath -Leaf), [int]$srcTs.TotalHours, $srcTs.Minutes, $srcTs.Seconds) -ForegroundColor Cyan

# --- encode each rendition single-pass --------------------------------------
foreach ($r in $Renditions) {
  $rdir = Join-Path $Out $r.Name
  if (-not $Force -and (Test-RenditionComplete $rdir)) {
    Write-Host "   $($r.Name): already complete - skipping" -ForegroundColor DarkGray
    continue
  }
  # Clear any partial output from an interrupted run so segment sets never mix.
  Get-ChildItem -LiteralPath $rdir -Filter '*.ts' -ErrorAction SilentlyContinue | Remove-Item -Force
  Remove-Item -LiteralPath (Join-Path $rdir 'stream.m3u8') -Force -ErrorAction SilentlyContinue

  Write-Host "   $($r.Name): encoding single-pass ($($r.W)x$($r.H))..." -ForegroundColor Cyan
  # Aspect-preserving (letterbox/pillarbox, never stretch); 5.1 -> stereo (-ac 2,
  # required for in-browser HLS). +genpts rebuilds timestamps so a source with DTS
  # gaps still encodes start-to-finish instead of aborting early.
  $vf = "scale=$($r.W):$($r.H):force_original_aspect_ratio=decrease:flags=lanczos:force_divisible_by=2," +
        "pad=$($r.W):$($r.H):(ow-iw)/2:(oh-ih)/2,setsar=1"
  # Capture ffmpeg's stderr so we can detect a CORRUPT source for free (the encode
  # already decodes the whole file). A damaged source emits thousands of decoder
  # errors and can only ever produce a glitchy video, so we fail rather than ship it.
  $errLog = Join-Path $rdir 'encode.err'
  & ffmpeg -hide_banner -loglevel error -y -fflags +genpts -i $InputPath `
      -map 0:v:0 -map 0:a:0 `
      -c:v libx264 -crf $r.Crf -preset fast -vf $vf `
      -b:v $r.Bv -maxrate $r.MaxRate -bufsize $r.BufSize `
      -c:a aac -b:a $r.Ab -ac 2 `
      -f hls -hls_time 6 -hls_list_size 0 -hls_playlist_type vod -hls_flags independent_segments `
      -hls_segment_filename (Join-Path $rdir 'seg%05d.ts') `
      (Join-Path $rdir 'stream.m3u8') 2> $errLog
  if ($LASTEXITCODE -ne 0 -or -not (Test-RenditionComplete $rdir)) {
    throw "Encode failed/incomplete for $($r.Name) (re-run to resume from this rendition)."
  }
  $decErrs = @(Get-Content -LiteralPath $errLog -ErrorAction SilentlyContinue | Where-Object {
    $_ -match 'Invalid NAL unit size|missing picture in access unit|Error submitting packet|reference picture missing|Missing reference picture|mmco:'
  }).Count
  Remove-Item -LiteralPath $errLog -Force -ErrorAction SilentlyContinue
  if ($decErrs -gt $MaxSourceDecodeErrors) {
    throw ("SOURCE CORRUPT for ${Slug}: the $($r.Name) encode hit $decErrs decoder errors. " +
           "The source file ($InputPath) is damaged and would produce a glitchy video. " +
           "Re-download a clean copy, then re-run. (Run verify-source-integrity.ps1 to confirm.)")
  }
  $rd = Get-PlaylistDuration (Join-Path $rdir 'stream.m3u8')
  Write-Host ("      done: {0} segs, {1:N0}s" -f (Get-ChildItem -LiteralPath $rdir -Filter '*.ts').Count, $rd) -ForegroundColor Green
}

# --- COMPLETENESS GATE ------------------------------------------------------
$hlsDur = Get-PlaylistDuration (Join-Path $Out '1080p/stream.m3u8')
$drift = [math]::Abs($hlsDur - $srcDur) / $srcDur
$pct = [int](($hlsDur / $srcDur) * 100)
if ($drift -gt $DurationTolerance) {
  throw ("COMPLETENESS GATE FAILED for ${Slug}: HLS {0:N0}s is {1}% of source {2:N0}s (drift {3:P1} > {4:P0}). " -f $hlsDur, $pct, $srcDur, $drift, $DurationTolerance) +
        "No master.m3u8 written - this title will not upload/go live. If the SOURCE itself is short, replace it; otherwise re-run."
}
Write-Host ("-> Completeness OK: HLS is {0}% of source (drift {1:P2})." -f $pct, $drift) -ForegroundColor Green

# --- master + poster --------------------------------------------------------
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
'@ | Out-File -FilePath (Join-Path $Out 'master.m3u8') -Encoding ascii

Write-Host "-> Poster frame" -ForegroundColor Cyan
& ffmpeg -hide_banner -loglevel error -y -ss '00:00:10' -i $InputPath -frames:v 1 -update 1 -q:v 2 -vf 'scale=1280:-1' (Join-Path $Out 'poster.jpg')

Write-Host "OK Output: $Out" -ForegroundColor Green
