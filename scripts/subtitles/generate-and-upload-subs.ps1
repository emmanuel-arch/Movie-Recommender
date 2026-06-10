<#
.SYNOPSIS
  Generate English + Kiswahili WebVTT subtitles for all 5 BirgenAI films and
  upload them to R2 — one command, resumable.

.DESCRIPTION
  For each film this:
    1. Runs generate_subs.py (faster-whisper transcribe EN -> NLLB translate SW)
       writing  out/Subtitles/en/<assetKey>-en.vtt  and  out/Subtitles/sw/<assetKey>-sw.vtt
    2. (unless -SkipUpload) rclone-copies out/Subtitles -> r2:<bucket>/Subtitles
       with Content-Type text/vtt, so the player at assets.birgenai.com/Subtitles/...
       lights up automatically (see web/lib/subtitles.ts).

  Resumable: a film whose .vtt files already exist is skipped (use -Force to
  regenerate). rclone upload is --size-only, so re-runs only push new/changed files.

  Source .mp4s are mapped EXPLICITLY by filename (so the "Sicario: Day of the
  Soldado" sequel in C:\Videos is never mistaken for sicario-2015).

.EXAMPLE
  cd movie-recommender\scripts\subtitles
  .\generate-and-upload-subs.ps1                 # all 5, generate + upload
  .\generate-and-upload-subs.ps1 -Slug get-out   # one film
  .\generate-and-upload-subs.ps1 -Model large-v3 # best quality (much slower on CPU)
  .\generate-and-upload-subs.ps1 -SkipUpload     # just generate locally
#>
[CmdletBinding()]
param(
  [string[]]$Slug,
  [string]$VideosDir   = 'C:\Videos',
  [string]$Model       = 'medium.en',          # CPU-friendly, English-optimized. Use large-v3 for best quality.
  [string]$Langs       = 'sw',                  # translation targets (en is always produced)
  [string]$Out         = '',                    # default: <scriptdir>\out
  [string]$R2Bucket    = 'birgenai-assets',
  [string]$SubsRoot    = 'Subtitles',
  [string]$CredFile    = '',                    # default: ..\..\infra\ffmpeg\.r2-credentials.ps1
  [string]$Python      = '',                    # explicit interpreter; default: auto-detect one that has the deps
  [switch]$SkipUpload,
  [switch]$SkipInstall,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $Out)      { $Out = Join-Path $here 'out' }
if (-not $CredFile) { $CredFile = Join-Path $here '..\..\infra\ffmpeg\.r2-credentials.ps1' }

# Explicit film table: slug -> assetKey -> exact source filename in $VideosDir.
$films = @(
  @{ Slug = 'get-out';        AssetKey = 'get-out-2017';        File = 'getout-2017.mp4' },
  @{ Slug = 'sicario';        AssetKey = 'sicario-2015';        File = 'sicario-2015.mp4' },
  @{ Slug = 'inception';      AssetKey = 'inception-2010';      File = 'inception-2010.mp4' },
  @{ Slug = 'the-dark-knight';AssetKey = 'the-dark-knight-2008';File = 'darkknight-2008.mp4' },
  @{ Slug = 'shutter-island'; AssetKey = 'shutter-island-2010'; File = 'shutter-island-2010.mp4' }
)
if ($Slug) { $films = $films | Where-Object { $Slug -contains $_.Slug } }
if (-not $films) { throw "No matching films for -Slug $($Slug -join ',')" }

$targets = @($Langs -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })

# --- resolve a Python interpreter that has the deps -------------------------
# Crash-safe dep probe: a failed `import` prints a traceback to stderr, which in
# Windows PowerShell 5.1 under ErrorActionPreference='Stop' would be turned into
# a terminating NativeCommandError. We flip to 'Continue' around the probe and
# read only the exit code.
function Test-PyDeps([string]$exe) {
  if (-not $exe) { return $false }
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & $exe -c "import faster_whisper, transformers, torch, sentencepiece" 2>$null | Out-Null
    return ($LASTEXITCODE -eq 0)
  } catch { return $false }
  finally { $ErrorActionPreference = $prev }
}

$venvPy = Join-Path $here '.venv\Scripts\python.exe'

# Candidate interpreters, in preference order. The first that already has the
# deps wins — so whichever interpreter you installed the libs into is used
# (e.g. a standalone C:\Python313) instead of an empty .venv.
$candidates = @()
if ($Python)                          { $candidates += $Python }       # explicit override always first
if (Test-Path -LiteralPath $venvPy)   { $candidates += $venvPy }       # project venv
# every python/python3 on PATH (covers conda base, C:\Python313, etc.)
foreach ($name in @('python', 'python3')) {
  try { (& where.exe $name 2>$null) | Where-Object { $_ } | ForEach-Object { $candidates += $_.Trim() } } catch {}
}
$candidates += 'python'
$candidates = $candidates | Where-Object { $_ } | Select-Object -Unique

$py = $null
foreach ($c in $candidates) {
  if (Test-PyDeps $c) { $py = $c; break }
}

if ($py) {
  Write-Host "Using Python with deps already installed: $py" -ForegroundColor DarkGreen
}
else {
  # No interpreter has the deps. Install into the chosen target.
  if ($Python)                        { $py = $Python }
  elseif (Test-Path -LiteralPath $venvPy) { $py = $venvPy }
  else {
    Write-Host "Creating venv ..." -ForegroundColor Cyan
    & python -m venv (Join-Path $here '.venv')
    if ($LASTEXITCODE -ne 0) { throw "Failed to create venv. Is Python 3.10+ on PATH?" }
    $py = $venvPy
  }
  if ($SkipInstall) { throw "Python deps missing in '$py' and -SkipInstall set. Run: & '$py' -m pip install -r requirements.txt" }
  Write-Host "Installing Python deps into '$py' (one-time; downloads torch CPU on first run) ..." -ForegroundColor Cyan
  & $py -m pip install --upgrade pip
  & $py -m pip install -r (Join-Path $here 'requirements.txt')
  if ($LASTEXITCODE -ne 0) { throw "pip install failed." }
  if (-not (Test-PyDeps $py)) { throw "Deps still not importable after install in '$py'." }
}

if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
  Write-Warning "ffmpeg not on PATH. faster-whisper needs it: winget install Gyan.FFmpeg (then reopen shell)."
}

# --- generate ---------------------------------------------------------------
$gen = Join-Path $here 'generate_subs.py'
$generated = @()
foreach ($f in $films) {
  $inputPath = Join-Path $VideosDir $f.File
  Write-Host ""
  Write-Host "=== $($f.Slug)  ($($f.AssetKey)) ===" -ForegroundColor Cyan
  if (-not (Test-Path -LiteralPath $inputPath)) {
    Write-Warning "  Source not found: $inputPath — skipping."
    continue
  }

  # resume check: en + every target lang already present and non-empty?
  $wanted = @("en") + $targets
  $allExist = $true
  foreach ($lang in $wanted) {
    $vtt = Join-Path $Out "Subtitles/$lang/$($f.AssetKey)-$lang.vtt"
    if (-not (Test-Path -LiteralPath $vtt) -or (Get-Item -LiteralPath $vtt).Length -eq 0) { $allExist = $false }
  }
  if ($allExist -and -not $Force) {
    Write-Host "  Already generated (en+$($targets -join '+')). Skipping. Use -Force to redo." -ForegroundColor DarkGray
    $generated += $f
    continue
  }

  Write-Host "  Transcribing + translating (model=$Model, langs=$($targets -join ','))  — CPU, this is slow ..." -ForegroundColor Yellow
  & $py $gen --input $inputPath --asset-key $f.AssetKey --model $Model --langs ($targets -join ',') --out $Out
  if ($LASTEXITCODE -ne 0) { throw "generate_subs.py failed for $($f.Slug) (exit $LASTEXITCODE)." }
  $generated += $f
}

if (-not (Test-Path -LiteralPath (Join-Path $Out 'Subtitles'))) {
  throw "Nothing generated under $Out\Subtitles — cannot upload."
}

# --- upload -----------------------------------------------------------------
if ($SkipUpload) {
  Write-Host ""
  Write-Host "Generation done. Skipping upload (-SkipUpload). Files under: $Out\Subtitles" -ForegroundColor Green
  return
}

$rclone = (Get-Command rclone -ErrorAction SilentlyContinue).Source
if (-not $rclone) {
  $rclone = (Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter rclone.exe -ErrorAction SilentlyContinue | Select-Object -First 1).FullName
}
if (-not $rclone) { throw "rclone not found. Install it or re-open PowerShell. (Generation succeeded — re-run to upload.)" }

if (-not (Test-Path -LiteralPath $CredFile)) {
  throw "R2 credentials not found at $CredFile. (Generation succeeded — set up creds and re-run; it'll skip straight to upload.)"
}
. $CredFile
$accessKey = if ($R2_ACCESS_KEY_ID)     { $R2_ACCESS_KEY_ID }     else { $env:R2_ACCESS_KEY_ID }
$secretKey = if ($R2_SECRET_ACCESS_KEY) { $R2_SECRET_ACCESS_KEY } else { $env:R2_SECRET_ACCESS_KEY }
$accountId = if ($R2_ACCOUNT_ID)        { $R2_ACCOUNT_ID }        else { 'fdcc8a0fa4782d2310c75e78cddf67b6' }
if (-not $accessKey -or -not $secretKey -or $accessKey -like 'PASTE_*') {
  throw "Missing R2 S3 credentials in $CredFile."
}

$env:RCLONE_CONFIG_R2_TYPE              = 's3'
$env:RCLONE_CONFIG_R2_PROVIDER          = 'Cloudflare'
$env:RCLONE_CONFIG_R2_ACCESS_KEY_ID     = $accessKey
$env:RCLONE_CONFIG_R2_SECRET_ACCESS_KEY = $secretKey
$env:RCLONE_CONFIG_R2_ENDPOINT          = "https://$accountId.r2.cloudflarestorage.com"
$env:RCLONE_CONFIG_R2_ACL               = 'private'

Write-Host ""
Write-Host "Uploading $Out\Subtitles -> r2:$R2Bucket/$SubsRoot (Content-Type: text/vtt) ..." -ForegroundColor Cyan
& $rclone copy (Join-Path $Out 'Subtitles') "r2:$R2Bucket/$SubsRoot" `
    --header-upload "Content-Type: text/vtt" `
    --size-only --s3-no-check-bucket `
    --transfers 8 --checkers 16 --retries 5 --low-level-retries 10 `
    --stats 5s --stats-one-line -P
if ($LASTEXITCODE -ne 0) { throw "rclone upload failed (exit $LASTEXITCODE). Re-run to resume." }

Write-Host ""
Write-Host "Done. Published subtitle tracks:" -ForegroundColor Green
foreach ($f in $generated) {
  foreach ($lang in (@('en') + $targets)) {
    Write-Host "  https://assets.birgenai.com/$SubsRoot/$lang/$($f.AssetKey)-$lang.vtt"
  }
}
Write-Host ""
Write-Host "Reminders:" -ForegroundColor Yellow
Write-Host "  * Proof the Kiswahili (sw) pass with a fluent speaker before relying on it — MT is a first draft."
Write-Host "  * R2 CORS must allow the origin you serve the player from, or <track> fetches fail silently."
