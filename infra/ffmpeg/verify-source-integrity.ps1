<#
.SYNOPSIS
  Source pre-check: confirms a download is COMPLETE end-to-end before a multi-hour
  transcode.

  This script does NOT count decoder errors. Errors like "Invalid NAL unit size",
  "missing picture in access unit" and "Error submitting packet" are endemic to YTS
  x264 rips and ffmpeg conceals them harmlessly on transcode - a known-good,
  currently-live title (italianna) emits 3,500+ of them, MORE than several titles
  that an earlier error-count check falsely condemned. Counting them produced only
  false "corrupt" alarms, so that approach was retired.

  The real failure mode for a damaged download is TRUNCATION: bytes are missing, so
  the actual video data ends before the container's declared duration (or the moov
  header is unreadable). This script compares the last decodable video timestamp
  against the declared duration and flags a file only when it is materially short or
  unreadable - which is exactly what the transcoder's completeness gate also enforces.

.EXAMPLE
  .\verify-source-integrity.ps1 -Slug goat-2026,in-the-grey-2026,michael-2026,mortal-kombat-II-2026
.EXAMPLE
  .\verify-source-integrity.ps1 -Path 'D:\goat-2026\goat-2026.mp4'
#>
[CmdletBinding()]
param(
  [string[]]$Slug,
  [string[]]$Path,
  [string]$SourceRoot = 'D:\',
  [double]$Tolerance = 0.02   # actual end must be within 2% of declared duration
)
$ErrorActionPreference = 'Continue'

$files = @()
if ($Slug) { foreach ($s in $Slug) { $files += (Join-Path (Join-Path $SourceRoot $s) "$s.mp4") } }
if ($Path) { $files += $Path }
if (-not $files) { throw 'Pass -Slug <slug>,... or -Path <file>,...' }

function Format-HMS([double]$sec) {
  $ts = [TimeSpan]::FromSeconds([math]::Max(0, $sec))
  '{0:00}:{1:00}:{2:00}' -f [int]$ts.TotalHours, $ts.Minutes, $ts.Seconds
}

$bad = @()
'{0,-44} {1,10} {2,10}  {3}' -f 'SOURCE', 'DECLARED', 'ACTUAL', 'VERDICT'
'-' * 86
foreach ($f in $files) {
  if (-not (Test-Path -LiteralPath $f)) {
    '{0,-44} {1,10} {2,10}  {3}' -f (Split-Path $f -Leaf), '-', '-', 'MISSING'
    continue
  }

  # Declared duration from the container header. If this fails the moov/header is
  # unreadable - typically a download truncated before its trailing moov atom.
  $declared = [double](& ffprobe -v error -show_entries format=duration `
                         -of default=noprint_wrappers=1:nokey=1 -- "$f" 2>$null)
  if (-not $declared -or $declared -le 0) {
    '{0,-44} {1,10} {2,10}  {3}' -f (Split-Path $f -Leaf), '-', '-', 'UNREADABLE - re-download'
    $bad += (Split-Path $f -Leaf)
    continue
  }

  # Actual end: largest video packet timestamp. Demux only the last ~10% (fast, no
  # decode) to find where real data stops. A truncated download has no packets out
  # there, so $actual stays far below $declared.
  $start = [int]([math]::Max(0, $declared * 0.90))
  $pts = @(& ffprobe -v error -select_streams v:0 -read_intervals "$start%+99999" `
             -show_entries packet=pts_time -of csv=p=0 -- "$f" 2>$null) |
         Where-Object { $_ -match '^[\d.]+$' }
  $actual = if ($pts) { [double]($pts | Measure-Object -Maximum).Maximum } else { 0.0 }

  $drift   = [math]::Abs($declared - $actual) / $declared
  $verdict = if ($drift -le $Tolerance) { 'COMPLETE' } else { 'TRUNCATED - re-download' }
  if ($drift -gt $Tolerance) { $bad += (Split-Path $f -Leaf) }
  '{0,-44} {1,10} {2,10}  {3}' -f (Split-Path $f -Leaf), (Format-HMS $declared), (Format-HMS $actual), $verdict
}
'-' * 86
if ($bad.Count) { Write-Host ("REPLACE these (incomplete/unreadable downloads): " + ($bad -join ', ')) -ForegroundColor Red }
else { Write-Host 'All sources are complete end-to-end.' -ForegroundColor Green }
