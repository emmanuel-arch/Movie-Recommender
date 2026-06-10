<#
.SYNOPSIS
  Fast, resume-safe upload of local .\hls\<slug>\ trees to Cloudflare R2 using rclone.

.DESCRIPTION
  Uses rclone's S3 backend against R2. `rclone copy --size-only` lists what is
  already in the bucket and uploads ONLY files that are missing or the wrong
  size (e.g. a segment truncated when a previous run died). Nothing correct is
  re-uploaded; nothing is deleted. Transfers run in parallel, so a ~6000-file
  movie finishes in minutes, and an S3 token does not expire mid-run the way the
  wrangler OAuth login does.

  Content-Type is set correctly per file type via separate include-filtered
  passes (.m3u8, .ts, images).

  Credentials: create an R2 API token (Object Read & Write) in the Cloudflare
  dashboard, then copy .r2-credentials.ps1.example to .r2-credentials.ps1 and
  fill in the keys. That file is git-ignored. Alternatively set the environment
  variables R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY before running.

.EXAMPLE
  cd infra\ffmpeg
  .\upload-hls-rclone.ps1                       # finish ALL slugs
  .\upload-hls-rclone.ps1 -Slug the-dark-knight # one movie
  .\upload-hls-rclone.ps1 -DryRun               # show what would transfer
#>
[CmdletBinding()]
param(
  [string[]]$Slug = @('get-out', 'sicario', 'inception', 'shutter-island', 'the-dark-knight'),
  [string]$R2Bucket   = 'birgenai-assets',
  [string]$RemoteRoot = 'Videos/films',
  [int]$Transfers     = 16,
  [int]$Checkers      = 32,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

# --- locate rclone ----------------------------------------------------------
$rclone = (Get-Command rclone -ErrorAction SilentlyContinue).Source
if (-not $rclone) {
  $found = Get-ChildItem -Path "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter rclone.exe -ErrorAction SilentlyContinue |
           Select-Object -First 1 -ExpandProperty FullName
  if ($found) { $rclone = $found }
}
if (-not $rclone) {
  throw "rclone not found. Install it (winget install Rclone.Rclone) and reopen PowerShell, or add it to PATH."
}

# --- load credentials -------------------------------------------------------
$credFile = Join-Path $here '.r2-credentials.ps1'
if (Test-Path -LiteralPath $credFile) { . $credFile }

$accessKey = if ($R2_ACCESS_KEY_ID)     { $R2_ACCESS_KEY_ID }     else { $env:R2_ACCESS_KEY_ID }
$secretKey = if ($R2_SECRET_ACCESS_KEY) { $R2_SECRET_ACCESS_KEY } else { $env:R2_SECRET_ACCESS_KEY }
$accountId = if ($R2_ACCOUNT_ID)        { $R2_ACCOUNT_ID }        else { $env:R2_ACCOUNT_ID }
if (-not $accountId) { $accountId = 'fdcc8a0fa4782d2310c75e78cddf67b6' }

if (-not $accessKey -or -not $secretKey -or $accessKey -like 'PASTE_*') {
  throw "Missing R2 S3 credentials. Copy .r2-credentials.ps1.example to .r2-credentials.ps1 and fill in your keys (see that file for how to create the token)."
}

# --- define an inline rclone remote called "r2:" via env vars ---------------
# (keeps secrets out of the command line / process list and out of any config file)
$env:RCLONE_CONFIG_R2_TYPE              = 's3'
$env:RCLONE_CONFIG_R2_PROVIDER          = 'Cloudflare'
$env:RCLONE_CONFIG_R2_ACCESS_KEY_ID     = $accessKey
$env:RCLONE_CONFIG_R2_SECRET_ACCESS_KEY = $secretKey
$env:RCLONE_CONFIG_R2_ENDPOINT          = "https://$accountId.r2.cloudflarestorage.com"
$env:RCLONE_CONFIG_R2_ACL               = 'private'

# extension -> content-type passes
$passes = @(
  @{ Include = '*.m3u8';            Type = 'application/vnd.apple.mpegurl' },
  @{ Include = '*.ts';              Type = 'video/mp2t' },
  @{ Include = '*.{jpg,jpeg}';      Type = 'image/jpeg' },
  @{ Include = '*.png';             Type = 'image/png' },
  @{ Include = '*.webp';            Type = 'image/webp' },
  @{ Include = '*.vtt';             Type = 'text/vtt' }
)

$common = @(
  '--size-only',            # decide by size only (wrangler-uploaded files have no rclone mtime)
  '--s3-no-check-bucket',   # token may not be allowed to HEAD/create the bucket
  '--transfers',  "$Transfers",
  '--checkers',   "$Checkers",
  '--retries',    '5',
  '--low-level-retries', '10',
  '--stats',      '5s',
  '--stats-one-line',
  '-P'
)
if ($DryRun) { $common += '--dry-run' }

foreach ($s in $Slug) {
  $src = Join-Path $here "hls\$s"
  if (-not (Test-Path -LiteralPath $src -PathType Container)) {
    Write-Warning "Skipping '$s' - folder not found: $src"
    continue
  }
  $dst = "r2:$R2Bucket/$RemoteRoot/$s"
  Write-Host ""
  Write-Host "=== $s -> $dst ===" -ForegroundColor Cyan

  foreach ($p in $passes) {
    Write-Host "  pass $($p.Include)  (Content-Type: $($p.Type))" -ForegroundColor DarkCyan
    & $rclone copy $src $dst `
        --include $p.Include `
        --header-upload "Content-Type: $($p.Type)" `
        @common
    if ($LASTEXITCODE -ne 0) {
      throw "rclone failed on '$s' pass '$($p.Include)' (exit $LASTEXITCODE). Check the token has R2 Object Read & Write. Re-running resumes safely."
    }
  }
  Write-Host "  $s done." -ForegroundColor Green
}

Write-Host ""
if ($DryRun) {
  Write-Host "DRY RUN complete - nothing was uploaded." -ForegroundColor Cyan
}
else {
  Write-Host "All selected slugs synced to R2." -ForegroundColor Green
}
