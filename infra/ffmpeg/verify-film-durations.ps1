<#
.SYNOPSIS
  Catch truncated / incomplete transcodes. For each title compares:
    - SOURCE : the original .mp4 duration (ffprobe)
    - LOCAL  : sum of real #EXTINF durations in local hls\<slug>\1080p\stream.m3u8
    - R2     : same, fetched from the public bucket (what actually streams)
  and flags anything whose streamed length is materially shorter than the source.
  Read-only. Run from infra\ffmpeg. ASCII-only (PS 5.1 mis-decodes non-ASCII .ps1).
#>
[CmdletBinding()]
param(
  [string[]]$Slug = @('f1-the-movie-2025','goat-2026','hoppers-2026','in-the-grey-2026','italianna-2026','michael-2026','mortal-kombat-II-2026'),
  [string]$PublicBase = 'https://assets.birgenai.com',
  [string]$HlsRoot = 'Videos/films',
  [double]$OkRatio = 0.98
)
$ErrorActionPreference = 'Continue'
$here = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }

$srcMap = @{
  'f1-the-movie-2025'     = 'C:\Videos\f1-the-movie-2025\f1-the-movie-2025.mp4'
  'goat-2026'             = 'C:\Videos\goat-2026\goat-2026.mp4'
  'hoppers-2026'          = 'C:\Videos\hoppers-2026\hoppers-2026.mp4'
  'in-the-grey-2026'      = 'C:\Videos\In-the-grey-2026\in-the-grey-2026.mp4'
  'italianna-2026'        = 'C:\Videos\italianna-2026\italianna-2026.mp4'
  'michael-2026'          = 'C:\Videos\michael-2026\michael-2026.mp4'
  'mortal-kombat-II-2026' = 'C:\Videos\mortal-kombat-II-2026\mortal-kombat-II-2026.mp4'
}

function Get-Mp4Duration([string]$path) {
  if (-not $path -or -not (Test-Path -LiteralPath $path)) { return $null }
  $d = & ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 -- "$path" 2>$null
  if ($d) { return [double]$d } else { return $null }
}

function Sum-Extinf([string[]]$lines) {
  $sum = 0.0; $n = 0
  foreach ($l in $lines) { if ($l -match '^#EXTINF:([0-9.]+)') { $sum += [double]$Matches[1]; $n++ } }
  [pscustomobject]@{ Dur = $sum; Count = $n }
}

function Get-LocalPlaylist([string]$slug) {
  $p = Join-Path $here "hls\$slug\1080p\stream.m3u8"
  if (Test-Path -LiteralPath $p) { return (Sum-Extinf (Get-Content -LiteralPath $p)) }
  return $null
}

function Get-R2Playlist([string]$slug) {
  $url = "$PublicBase/$HlsRoot/$slug/1080p/stream.m3u8"
  try {
    $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 30
    return (Sum-Extinf ($resp.Content -split "`n"))
  } catch { return $null }
}

function Fmt($sec) {
  if ($null -eq $sec) { return '-' }
  $t = [TimeSpan]::FromSeconds([double]$sec)
  '{0:00}:{1:00}:{2:00}' -f [int]$t.TotalHours, $t.Minutes, $t.Seconds
}

$fmt = "{0,-24} {1,10} {2,10} {3,10} {4,7} {5}"
$fails = @()
Write-Host ($fmt -f 'TITLE', 'SOURCE', 'LOCAL', 'R2', 'R2/SRC', 'VERDICT')
Write-Host ('-' * 90)
foreach ($s in $Slug) {
  $src   = Get-Mp4Duration $srcMap[$s]
  $local = Get-LocalPlaylist $s
  $r2    = Get-R2Playlist $s
  $localDur = if ($local) { $local.Dur } else { $null }
  $r2Dur    = if ($r2) { $r2.Dur } else { $null }
  $ratio = if ($src -and $r2Dur) { [math]::Round($r2Dur / $src, 3) } else { 0 }

  if (-not $r2Dur)        { $verdict = 'NOT ON R2' }
  elseif (-not $src)      { $verdict = 'no source file' }
  elseif ($ratio -ge $OkRatio) { $verdict = "OK ($([int]$r2.Count) segs)" }
  else { $verdict = "*** SHORT - only $([int]($ratio*100))% of source ***"; $fails += $s }

  Write-Host ($fmt -f $s, (Fmt $src), (Fmt $localDur), (Fmt $r2Dur), $ratio, $verdict)
}
Write-Host ('-' * 90)
if ($fails.Count) {
  Write-Host ("INCOMPLETE / TRUNCATED: " + ($fails -join ', ')) -ForegroundColor Red
} else {
  Write-Host "All checked titles match their source length." -ForegroundColor Green
}
