<#
.SYNOPSIS
  Reset titles so they re-transcode cleanly with the single-pass pipeline.
  Clears local output + pipeline markers + leftover chunk/stage dirs, and
  (with -PurgeR2) deletes the title's R2 folder so the fresh upload has no
  orphan segments left over from the old chunked naming.

  After running this, re-publish with:
    .\publish-new-films.ps1 -Only <slug>,<slug>,...

.EXAMPLE
  .\redo-titles.ps1 -Slug goat-2026,in-the-grey-2026,michael-2026,mortal-kombat-II-2026 -PurgeR2
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string[]]$Slug,
  [switch]$PurgeR2,
  [string]$R2Bucket = 'birgenai-assets',
  [string]$HlsRoot = 'Videos/films'
)
$ErrorActionPreference = 'Stop'
$here = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }

foreach ($s in $Slug) {
  Write-Host "=== $s ===" -ForegroundColor Cyan
  foreach ($sub in "hls\$s", ".chunks\$s", "stage\$s") {
    $p = Join-Path $here $sub
    if (Test-Path -LiteralPath $p) { Remove-Item -LiteralPath $p -Recurse -Force; Write-Host "  cleared $sub" }
  }
  $state = Join-Path $here '.pipeline-state'
  Get-ChildItem -LiteralPath $state -Filter "$s.*" -ErrorAction SilentlyContinue | ForEach-Object {
    Remove-Item -LiteralPath $_.FullName -Force; Write-Host "  cleared .pipeline-state\$($_.Name)"
  }
}

if ($PurgeR2) {
  $rclone = (Get-Command rclone -ErrorAction SilentlyContinue).Source
  if (-not $rclone) {
    $found = Get-ChildItem -Path "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter rclone.exe -ErrorAction SilentlyContinue |
             Select-Object -First 1 -ExpandProperty FullName
    if ($found) { $rclone = $found }
  }
  if (-not $rclone) { throw "rclone not found - cannot purge R2. winget install Rclone.Rclone" }

  $credFile = Join-Path $here '.r2-credentials.ps1'
  if (Test-Path -LiteralPath $credFile) { . $credFile }
  $accessKey = if ($R2_ACCESS_KEY_ID) { $R2_ACCESS_KEY_ID } else { $env:R2_ACCESS_KEY_ID }
  $secretKey = if ($R2_SECRET_ACCESS_KEY) { $R2_SECRET_ACCESS_KEY } else { $env:R2_SECRET_ACCESS_KEY }
  $accountId = if ($R2_ACCOUNT_ID) { $R2_ACCOUNT_ID } else { 'fdcc8a0fa4782d2310c75e78cddf67b6' }
  if (-not $accessKey -or -not $secretKey) { throw "Missing R2 credentials (.r2-credentials.ps1)." }
  $env:RCLONE_CONFIG_R2_TYPE = 's3'; $env:RCLONE_CONFIG_R2_PROVIDER = 'Cloudflare'
  $env:RCLONE_CONFIG_R2_ACCESS_KEY_ID = $accessKey; $env:RCLONE_CONFIG_R2_SECRET_ACCESS_KEY = $secretKey
  $env:RCLONE_CONFIG_R2_ENDPOINT = "https://$accountId.r2.cloudflarestorage.com"; $env:RCLONE_CONFIG_R2_ACL = 'private'

  $prevEAP = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  foreach ($s in $Slug) {
    Write-Host "  purging R2: $HlsRoot/$s ..." -ForegroundColor DarkYellow
    & $rclone purge "r2:$R2Bucket/$HlsRoot/$s" --s3-no-check-bucket 2>&1 |
      ForEach-Object { if ($_ -is [System.Management.Automation.ErrorRecord]) { $_.ToString() } else { "$_" } } | Out-Null
  }
  $ErrorActionPreference = $prevEAP
  Write-Host "  R2 folders purged." -ForegroundColor Green
}

Write-Host ""
Write-Host "Done. Now re-publish:" -ForegroundColor Green
Write-Host ("  .\publish-new-films.ps1 -Only {0}" -f ($Slug -join ',')) -ForegroundColor White
