<#
.SYNOPSIS
  Upload a local HLS folder to R2 at Videos/films/<slug>/ with content-types, optional local/remote checks, and resume-friendly manifest.

.DESCRIPTION
  Remote layout (default):
    birgenai-assets/Videos/films/<slug>/master.m3u8
    birgenai-assets/Videos/films/<slug>/1080p/...
    etc.

  Prerequisites: npm i -g wrangler && wrangler login

.EXAMPLE
  cd infra\r2
  .\upload-hls-film-to-r2.ps1 -Slug get-out -LocalHlsDir ..\ffmpeg\hls\get-out

.EXAMPLE
  Same, then spot-check a few objects against R2 (downloads via wrangler; slower):
  .\upload-hls-film-to-r2.ps1 -Slug get-out -LocalHlsDir ..\ffmpeg\hls\get-out -SampleVerifyRemote

.EXAMPLE
  Re-run after a failure (-Resume): skips files already in the manifest with same size + LastWriteTime.
  .\upload-hls-film-to-r2.ps1 -Slug get-out -LocalHlsDir ..\ffmpeg\hls\get-out -Resume

.NOTES
  Set NEXT_PUBLIC_HLS_ROOT=Videos/films in web/.env.local so the app uses this path.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Slug,

  [Parameter(Mandatory = $true)]
  [string]$LocalHlsDir,

  [string]$R2Bucket = 'birgenai-assets',

  # Must match app: NEXT_PUBLIC_HLS_ROOT default is Videos; use Videos/films for this layout.
  [string]$RemotePrefix = 'Videos/films',

  [switch]$Resume,
  [switch]$SkipLocalCheck,
  [switch]$SampleVerifyRemote,
  [int]$SampleVerifyCount = 8,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

function Get-R2ContentType([string]$Name) {
  switch -Regex ($Name) {
    '\.m3u8$' { return 'application/vnd.apple.mpegurl' }
    '\.ts$' { return 'video/mp2t' }
    '\.(jpe?g)$' { return 'image/jpeg' }
    '\.png$' { return 'image/png' }
    '\.mp4$' { return 'video/mp4' }
    default { return 'application/octet-stream' }
  }
}

function Invoke-R2Put {
  param(
    [string]$LocalFile,
    [string]$ObjectKey,
    [string]$ContentType
  )
  if (-not (Test-Path -LiteralPath $LocalFile -PathType Leaf)) {
    throw "Missing local file: $LocalFile"
  }
  $full = "$R2Bucket/$ObjectKey"
  Write-Host "  PUT $ObjectKey" -ForegroundColor Cyan
  if ($DryRun) { return $true }
  & wrangler r2 object put $full --file="$LocalFile" --content-type=$ContentType --remote
  if ($LASTEXITCODE -ne 0) {
    Write-Host "  FAILED $ObjectKey" -ForegroundColor Red
    return $false
  }
  return $true
}

# --- Paths ---
$LocalRoot = (Resolve-Path -LiteralPath $LocalHlsDir).Path
$BasePrefix = "$RemotePrefix/$Slug".TrimStart('/').Replace('//', '/')
$ManifestPath = Join-Path (Split-Path -Parent $LocalRoot) ".hls-r2-manifest-$Slug.json"

if (-not $DryRun -and -not (Get-Command wrangler -ErrorAction SilentlyContinue)) {
  throw "wrangler not found. npm i -g wrangler ; wrangler login"
}

if (-not (Test-Path -LiteralPath "$LocalRoot\master.m3u8")) {
  throw "master.m3u8 not found under: $LocalRoot"
}

# --- Optional: load resume manifest ---
$resumeMap = @{} # key -> { Length, LastWriteUtc }
if ($Resume -and (Test-Path -LiteralPath $ManifestPath)) {
  try {
    $prev = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
    foreach ($e in $prev.Uploaded) {
      $resumeMap[$e.Key] = @{ Length = [long]$e.Length; LastWriteUtc = $e.LastWriteUtc }
    }
    Write-Host "Resume: loaded $($resumeMap.Count) keys from $(Split-Path $ManifestPath -Leaf)" -ForegroundColor DarkGray
  } catch {
    Write-Warning "Could not read resume manifest: $_"
  }
}

# --- Local validation (m3u8 references exist on disk) ---
if (-not $SkipLocalCheck) {
  Write-Host "`nLocal HLS sanity check..." -ForegroundColor Green
  $missing = [System.Collections.Generic.List[string]]::new()
  $m3u8 = Get-ChildItem -Path $LocalRoot -Filter '*.m3u8' -Recurse -File
  foreach ($pl in $m3u8) {
    $dir = $pl.Directory.FullName
    $lines = Get-Content -LiteralPath $pl.FullName
    foreach ($line in $lines) {
      $t = $line.Trim()
      if ($t.Length -eq 0 -or $t.StartsWith('#')) { continue }
      if ($t -match '^https?://') { continue }
      # EXT-X-MAP:URI="init.mp4"
      if ($t -match 'URI="([^"]+)"') {
        $u = $Matches[1]
        if ($u -match '^https?://') { continue }
        $target = Join-Path $dir ($u -replace '^\./', '')
        if (-not (Test-Path -LiteralPath $target)) {
          $missing.Add("[$($pl.Name)] EXT-X-MAP missing: $u")
        }
        continue
      }
      if ($t -match '\.(ts|m3u8|mp4|aac|webvtt)(\?.*)?$') {
        $target = Join-Path $dir ($t -replace '^\./', '')
        if (-not (Test-Path -LiteralPath $target)) {
          $missing.Add("[$($pl.Name)] references missing: $t")
        }
      }
    }
  }
  if ($missing.Count -gt 0) {
    Write-Host "Problems:" -ForegroundColor Red
    $missing | Select-Object -First 40 | ForEach-Object { Write-Host "  $_" }
    if ($missing.Count -gt 40) { Write-Host "  ... and $($missing.Count - 40) more" }
    throw "Local HLS validation failed. Fix paths before upload."
  }
  Write-Host "  OK: m3u8 references resolve on disk." -ForegroundColor DarkGreen
}

# --- Collect files ---
$all = Get-ChildItem -Path $LocalRoot -Recurse -File | Sort-Object FullName
Write-Host "`nUpload $($all.Count) files -> ${R2Bucket}/${BasePrefix}/" -ForegroundColor Green

$uploaded = [System.Collections.ArrayList]::new()
$failed = [System.Collections.ArrayList]::new()

foreach ($f in $all) {
  $rel = $f.FullName.Substring($LocalRoot.Length + 1).Replace('\', '/')
  $objectKey = "$BasePrefix/$rel"
  $fi = Get-Item -LiteralPath $f.FullName
  if ($Resume -and $resumeMap.ContainsKey($objectKey)) {
    $p = $resumeMap[$objectKey]
    if ($fi.Length -eq $p.Length -and $fi.LastWriteTimeUtc.ToString('o') -eq $p.LastWriteUtc) {
      Write-Host "  SKIP (unchanged) $objectKey" -ForegroundColor DarkGray
      [void]$uploaded.Add([ordered]@{
          Key = $objectKey; Rel = $rel; Length = $fi.Length
          LastWriteUtc = $fi.LastWriteTimeUtc.ToString('o')
        })
      continue
    }
  }
  $ct = Get-R2ContentType $rel
  $ok = Invoke-R2Put $f.FullName $objectKey $ct
  if ($ok) {
    [void]$uploaded.Add([ordered]@{
        Key = $objectKey; Rel = $rel; Length = $fi.Length
        LastWriteUtc = $fi.LastWriteTimeUtc.ToString('o')
      })
  } else {
    [void]$failed.Add($objectKey)
  }
}

# --- Persist manifest ---
$manifest = [ordered]@{
  Slug           = $Slug
  R2Bucket       = $R2Bucket
  RemotePrefix   = $BasePrefix
  GeneratedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
  LocalRoot      = $LocalRoot
  FileCount      = $all.Count
  UploadedCount  = $uploaded.Count
  FailedCount    = $failed.Count
  Uploaded       = @($uploaded)
  Failed         = @($failed)
}
if (-not $DryRun) {
  $manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $ManifestPath -Encoding UTF8
  Write-Host "`nManifest: $ManifestPath" -ForegroundColor DarkGray
}

if ($failed.Count -gt 0) {
  Write-Host "`nUpload finished WITH ERRORS. Failed keys:" -ForegroundColor Red
  $failed | ForEach-Object { Write-Host "  $_" }
  Write-Host "Re-run the same command (without -Resume) to retry failed puts, or fix wrangler/auth." -ForegroundColor Yellow
  exit 1
}

Write-Host "`nSummary: $($uploaded.Count) / $($all.Count) objects OK." -ForegroundColor Green
Write-Host "Manifest URL: https://<your-public-host>/${BasePrefix}/master.m3u8" -ForegroundColor Cyan

# --- Optional remote sample verify ---
if ($SampleVerifyRemote -and -not $DryRun) {
  Write-Host "`nSample remote verify ($SampleVerifyCount random segments + all m3u8)..." -ForegroundColor Yellow
  $verifyTargets = [System.Collections.Generic.List[string]]::new()
  foreach ($f in $all) {
    if ($f.Name -like '*.m3u8') {
      $rel = $f.FullName.Substring($LocalRoot.Length + 1).Replace('\', '/')
      $verifyTargets.Add("$BasePrefix/$rel") | Out-Null
    }
  }
  $tsFiles = $all | Where-Object { $_.Extension -eq '.ts' }
  if ($tsFiles.Count -gt 0) {
    $rng = [System.Random]::new()
    $n = [Math]::Min($SampleVerifyCount, $tsFiles.Count)
    for ($i = 0; $i -lt $n; $i++) {
      $pick = $tsFiles[$rng.Next($tsFiles.Count)]
      $rel = $pick.FullName.Substring($LocalRoot.Length + 1).Replace('\', '/')
      $key = "$BasePrefix/$rel"
      if (-not $verifyTargets.Contains($key)) { $verifyTargets.Add($key) | Out-Null }
    }
  }
  $tmpBase = Join-Path $env:TEMP "r2-hls-verify-$Slug"
  New-Item -ItemType Directory -Path $tmpBase -Force | Out-Null
  $bad = 0
  foreach ($key in $verifyTargets) {
    $localRel = $key.Substring($BasePrefix.Length + 1)
    $localPath = Join-Path $LocalRoot $localRel.Replace('/', '\')
    $tmp = Join-Path $tmpBase ($localRel.Replace('/', '_'))
    & wrangler r2 object get "$R2Bucket/$key" --file="$tmp" --remote
    if ($LASTEXITCODE -ne 0) {
      Write-Host "  GET failed: $key" -ForegroundColor Red
      $bad++
      continue
    }
    $a = (Get-Item -LiteralPath $localPath).Length
    $b = (Get-Item -LiteralPath $tmp).Length
    if ($a -ne $b) {
      Write-Host "  SIZE MISMATCH: $key (local $a vs remote $b)" -ForegroundColor Red
      $bad++
    } else {
      Write-Host "  OK $key ($a bytes)" -ForegroundColor DarkGreen
    }
  }
  Remove-Item -LiteralPath $tmpBase -Recurse -Force -ErrorAction SilentlyContinue
  if ($bad -gt 0) {
    Write-Host "`nSample verify reported $bad problem(s). Re-run full upload without -Resume." -ForegroundColor Red
    exit 1
  }
  Write-Host "Sample verify passed." -ForegroundColor Green
}

exit 0
