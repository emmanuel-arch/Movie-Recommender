<#
.SYNOPSIS
  Source-integrity pre-check. Fully decodes each source file and counts decoder
  errors, so a CORRUPT download is caught BEFORE a multi-hour transcode (a damaged
  source can only ever produce a glitchy video — re-download it instead).

  A clean file yields ~0 errors (the harmless "Referenced QT chapter track not
  found" notice is ignored). Hundreds/thousands of errors = corrupt.

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
  [int]$ErrorThreshold = 50
)
$ErrorActionPreference = 'Continue'

$files = @()
if ($Slug) { foreach ($s in $Slug) { $files += (Join-Path (Join-Path $SourceRoot $s) "$s.mp4") } }
if ($Path) { $files += $Path }
if (-not $files) { throw 'Pass -Slug <slug>,... or -Path <file>,...' }

$bad = @()
'{0,-44} {1,10}  {2}' -f 'SOURCE', 'ERRORS', 'VERDICT'
'-' * 78
foreach ($f in $files) {
  if (-not (Test-Path -LiteralPath $f)) { '{0,-44} {1,10}  {2}' -f (Split-Path $f -Leaf), '-', 'MISSING'; continue }
  $tmp = [System.IO.Path]::GetTempFileName()
  # full decode to null; -v error keeps only decode errors on stderr.
  & ffmpeg -hide_banner -v error -i $f -f null - 2> $tmp | Out-Null
  $errs = @(Get-Content -LiteralPath $tmp -ErrorAction SilentlyContinue |
            Where-Object { $_ -and $_ -notmatch 'Referenced QT chapter track not found' })
  Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
  $n = $errs.Count
  $verdict = if ($n -le $ErrorThreshold) { 'CLEAN' } else { 'CORRUPT - re-download'; }
  if ($n -gt $ErrorThreshold) { $bad += (Split-Path $f -Leaf) }
  '{0,-44} {1,10}  {2}' -f (Split-Path $f -Leaf), $n, $verdict
}
'-' * 78
if ($bad.Count) { Write-Host ("CORRUPT (replace these): " + ($bad -join ', ')) -ForegroundColor Red }
else { Write-Host 'All sources decode clean.' -ForegroundColor Green }
