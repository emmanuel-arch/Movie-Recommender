<#
.SYNOPSIS
  One-shot, RESUMABLE pipeline for the 5 new 1080p films:
  transcode -> subtitles (.srt -> .vtt) -> card/backdrop frame -> upload to R2
  -> verify every object returns HTTP 200 -> flip the title live in the catalog.

.DESCRIPTION
  This wraps the existing two-step manual flow (transcode-hls.ps1 + the rclone
  uploader) into a single command that does ALL of the work for ALL 5 titles and
  is safe to kill at any moment - close the laptop, lose power, Ctrl-C - then just
  re-run it. It picks up exactly where it left off because every stage is either:

    * idempotent  (rclone --size-only re-uploads only what is missing/wrong-size,
                   HEAD verification re-checks the public URL), or
    * marker-gated (a finished stage drops a file under .pipeline-state\ so it is
                   never redone).

  Per title the stages are, in order:
    1. TRANSCODE  -> infra\ffmpeg\hls\<slug>\  (4-bitrate H.264 ABR + master + poster)
                     re-encodes to browser-safe H.264 and downmixes 5.1 -> stereo,
                     both required for in-browser HLS playback.
    2. ASSETS     -> English/French .srt converted to WebVTT (our format) and a
                     1920x1080 backdrop frame grab (so the Netflix card looks right
                     before you upload bespoke card art).
    3. UPLOAD     -> R2 via rclone S3:  Videos/films/<slug>/...,  Subtitles/<lang>/...,
                     Images/backdrops/backdrop-<assetKey>.jpg
    4. VERIFY     -> HEAD every uploaded object against https://assets.birgenai.com;
                     a title is only "done" when 100% of its objects return 200.
    5. FLIP       -> set playable:true + comingSoon:false for the slug in lib\catalog.ts
                     (surgical, keyed on a // FLIP:<slug> token, idempotent).

  The whole title set is looped until every title passes VERIFY (the CDN can briefly
  negative-cache a just-uploaded key; the loop simply retries).

.PARAMETER Only
  Restrict to a subset of slugs, e.g. -Only f1-the-movie-2025,goat-2026

.EXAMPLE
  cd "C:\Users\Arch Bishop\Documents\BIRGEN AI 2.0\movie-recommender\infra\ffmpeg"
  .\publish-new-films.ps1                       # do everything for all 5, resume-safe

.EXAMPLE
  .\publish-new-films.ps1 -Only f1-the-movie-2025  # just one title

.EXAMPLE
  .\publish-new-films.ps1 -DryRun               # report state; transcode/upload/edit nothing

.NOTES
  Credentials: same as upload-hls-rclone.ps1 - copy .r2-credentials.ps1.example to
  .r2-credentials.ps1 and fill in an R2 token (Object Read & Write), or set
  R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY in the environment.

  ASCII-only on purpose: Windows PowerShell 5.1 reads .ps1 as ANSI unless the file
  has a BOM, so non-ASCII glyphs can mis-decode into smart-quotes and break parsing.
#>
[CmdletBinding()]
param(
  [string[]]$Only,
  [string]$R2Bucket    = 'birgenai-assets',
  [string]$PublicBase  = 'https://assets.birgenai.com',
  [string]$HlsRoot     = 'Videos/films',
  [string]$SubsRoot    = 'Subtitles',
  [string]$BackdropRoot= 'Images/backdrops',
  [int]$Transfers      = 16,
  [int]$Checkers       = 32,
  [int]$VerifyConcurrency = 40,
  [int]$MaxLoops       = 25,
  [switch]$SkipImages,
  [switch]$SkipSubs,
  [switch]$NoFlip,
  [switch]$ForceTranscode,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$here = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
Set-Location -LiteralPath $here

$PublicBase   = $PublicBase.TrimEnd('/')
$HlsRoot      = $HlsRoot.Trim('/')
$SubsRoot     = $SubsRoot.Trim('/')
$BackdropRoot = $BackdropRoot.Trim('/')

$StateDir = Join-Path $here '.pipeline-state'
$null = New-Item -ItemType Directory -Force -Path $StateDir
$CatalogPath = Resolve-Path (Join-Path $here '..\..\web\lib\catalog.ts')

# --- The 5 new titles -------------------------------------------------------
# slug MUST equal the R2 folder (Videos/films/<slug>/master.m3u8). assetKey keys
# the subtitle + image filenames (must match lib\catalog.ts).
# Source layout: C:\Videos\<slug>\<slug>.mp4
# Sources live on D:\<slug>\<slug>.mp4 (all 7 present there).
$Films = @(
  [pscustomobject]@{ Slug='f1-the-movie-2025';     AssetKey='f1-the-movie-2025';     Source='D:\f1-the-movie-2025\f1-the-movie-2025.mp4' }
  [pscustomobject]@{ Slug='goat-2026';             AssetKey='goat-2026';             Source='D:\goat-2026\goat-2026.mp4' }
  [pscustomobject]@{ Slug='hoppers-2026';          AssetKey='hoppers-2026';          Source='D:\hoppers-2026\hoppers-2026.mp4' }
  [pscustomobject]@{ Slug='in-the-grey-2026';      AssetKey='in-the-grey-2026';      Source='D:\in-the-grey-2026\in-the-grey-2026.mp4' }
  [pscustomobject]@{ Slug='italianna-2026';        AssetKey='italianna-2026';        Source='D:\italianna-2026\italianna-2026.mp4' }
  [pscustomobject]@{ Slug='michael-2026';          AssetKey='michael-2026';          Source='D:\michael-2026\michael-2026.mp4' }
  [pscustomobject]@{ Slug='mortal-kombat-II-2026'; AssetKey='mortal-kombat-II-2026'; Source='D:\mortal-kombat-II-2026\mortal-kombat-II-2026.mp4' }
)
if ($Only) { $Films = $Films | Where-Object { $Only -contains $_.Slug } }
if (-not $Films) { throw "No films selected. Known slugs: f1-the-movie-2025, goat-2026, hoppers-2026, in-the-grey-2026, italianna-2026, michael-2026, mortal-kombat-II-2026" }

# --- tools ------------------------------------------------------------------
if (-not (Get-Command ffmpeg  -ErrorAction SilentlyContinue)) { throw "ffmpeg not found. winget install Gyan.FFmpeg" }
if (-not (Get-Command ffprobe -ErrorAction SilentlyContinue)) { throw "ffprobe not found (ships with ffmpeg)." }

$rclone = (Get-Command rclone -ErrorAction SilentlyContinue).Source
if (-not $rclone) {
  $found = Get-ChildItem -Path "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter rclone.exe -ErrorAction SilentlyContinue |
           Select-Object -First 1 -ExpandProperty FullName
  if ($found) { $rclone = $found }
}
if (-not $rclone) { throw "rclone not found. winget install Rclone.Rclone, then reopen PowerShell." }

Add-Type -AssemblyName System.Net.Http | Out-Null

# --- R2 credentials -> inline rclone remote 'r2:' (no secrets on the cmdline) --
$credFile = Join-Path $here '.r2-credentials.ps1'
if (Test-Path -LiteralPath $credFile) { . $credFile }
$accessKey = if ($R2_ACCESS_KEY_ID)     { $R2_ACCESS_KEY_ID }     else { $env:R2_ACCESS_KEY_ID }
$secretKey = if ($R2_SECRET_ACCESS_KEY) { $R2_SECRET_ACCESS_KEY } else { $env:R2_SECRET_ACCESS_KEY }
$accountId = if ($R2_ACCOUNT_ID)        { $R2_ACCOUNT_ID }        else { $env:R2_ACCOUNT_ID }
if (-not $accountId) { $accountId = 'fdcc8a0fa4782d2310c75e78cddf67b6' }
if (-not $DryRun -and (-not $accessKey -or -not $secretKey -or $accessKey -like 'PASTE_*')) {
  throw "Missing R2 S3 credentials. Copy .r2-credentials.ps1.example to .r2-credentials.ps1 and fill in your keys."
}
$env:RCLONE_CONFIG_R2_TYPE              = 's3'
$env:RCLONE_CONFIG_R2_PROVIDER          = 'Cloudflare'
$env:RCLONE_CONFIG_R2_ACCESS_KEY_ID     = $accessKey
$env:RCLONE_CONFIG_R2_SECRET_ACCESS_KEY = $secretKey
$env:RCLONE_CONFIG_R2_ENDPOINT          = "https://$accountId.r2.cloudflarestorage.com"
$env:RCLONE_CONFIG_R2_ACL               = 'private'

# --- helpers ----------------------------------------------------------------
function Test-StageDone ([string]$slug, [string]$stage) { Test-Path -LiteralPath (Join-Path $StateDir "$slug.$stage") }
function Set-StageDone  ([string]$slug, [string]$stage) { Set-Content -LiteralPath (Join-Path $StateDir "$slug.$stage") -Value (Get-Date -Format o) -Encoding ascii }

function Get-ContentType([string]$rel) {
  switch -Regex ($rel) {
    '\.m3u8$'    { 'application/vnd.apple.mpegurl'; break }
    '\.ts$'      { 'video/mp2t'; break }
    '\.(jpe?g)$' { 'image/jpeg'; break }
    '\.png$'     { 'image/png'; break }
    '\.webp$'    { 'image/webp'; break }
    '\.vtt$'     { 'text/vtt'; break }
    '\.mp4$'     { 'video/mp4'; break }
    default      { 'application/octet-stream' }
  }
}

# Convert one SubRip .srt to WebVTT (our player format). Tolerates BOM / CRLF and
# fixes the only structural difference: comma -> dot in the timecodes.
function Convert-SrtToVtt {
  param([string]$SrtPath, [string]$VttPath)
  $raw = Get-Content -LiteralPath $SrtPath -Raw -Encoding UTF8
  $raw = $raw -replace '^\uFEFF', ''                  # strip leading BOM if present
  $raw = $raw -replace "`r`n", "`n"                         # normalise newlines
  # 00:00:01,000 --> 00:00:04,000   =>   00:00:01.000 --> 00:00:04.000
  $raw = [regex]::Replace($raw, '(\d{2}:\d{2}:\d{2}),(\d{3})', '$1.$2')
  $out = "WEBVTT`n`n" + $raw.TrimStart("`n")
  $dir = Split-Path -Parent $VttPath
  $null = New-Item -ItemType Directory -Force -Path $dir
  # VTT must be UTF-8 without a BOM.
  [System.IO.File]::WriteAllText($VttPath, $out, (New-Object System.Text.UTF8Encoding($false)))
}

# Find the best source .srt for a language inside the movie's own folder.
# Exact-name candidates first (cleanest match), then a wildcard fallback over Subs\
# by the language's 3-letter tag, then (English only) the release .srt at the movie
# root. This catches the real-world naming variety in YTS rips, e.g.:
#   michael:   Subs\SDH.eng.srt          (no plain English.srt)  -> en
#   italianna: Subs\Francais (Canada).fre.srt                    -> fr
# Wildcards keep this ASCII-safe (we never type the accented filename literally).
function Find-Srt {
  param([string]$SourceFile, [string]$Lang)
  $folder = Split-Path -Parent $SourceFile
  $subs   = Join-Path $folder 'Subs'
  $base   = [System.IO.Path]::GetFileNameWithoutExtension($SourceFile)
  $cands = switch ($Lang) {
    'en' { @("$subs\English.srt", "$subs\English (CC).eng.srt", "$subs\eng.srt", "$subs\SDH.eng.srt", "$subs\English.eng.srt", "$folder\English.srt", "$folder\$base.srt", "$subs\en.srt") }
    'fr' { @("$subs\fre.srt", "$subs\French.srt", "$subs\fra.srt", "$subs\fr.srt") }
    default { @() }
  }
  foreach ($c in $cands) { if (Test-Path -LiteralPath $c) { return (Resolve-Path -LiteralPath $c).Path } }

  # wildcard fallback: any *.<tag>.srt in Subs\ (prefer the largest = fullest track).
  $tag = if ($Lang -eq 'en') { 'eng' } elseif ($Lang -eq 'fr') { 'fre' } else { $null }
  if ($tag) {
    $w = Get-ChildItem -LiteralPath $subs -Filter "*.$tag.srt" -File -ErrorAction SilentlyContinue |
         Sort-Object Length -Descending | Select-Object -First 1
    if ($w) { return $w.FullName }
  }
  # English last resort: the release-named .srt sitting at the movie folder root
  # (these YTS English rips keep the main English track there; other langs go in Subs\).
  if ($Lang -eq 'en') {
    $root = Get-ChildItem -LiteralPath $folder -Filter '*.srt' -File -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($root) { return $root.FullName }
  }
  return $null
}

# 1920x1080 backdrop frame grab at ~38% of the runtime (cover+crop, no black bars).
function New-Backdrop {
  param([string]$SourceFile, [string]$OutPath)
  $dur = [double](& ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$SourceFile")
  if (-not $dur -or $dur -le 0) { $dur = 600 }
  $ss = [int]([math]::Max(5, $dur * 0.38))
  $dir = Split-Path -Parent $OutPath
  $null = New-Item -ItemType Directory -Force -Path $dir
  # NB: no `2>$null` here. Redirecting a native exe's stderr under ErrorActionPreference
  # 'Stop' makes PowerShell wrap ffmpeg's normal stderr as a terminating NativeCommandError.
  # -hide_banner -loglevel error keeps it quiet; -update 1 is required by ffmpeg 8+ to write
  # a single image to a fixed (non-%03d) filename.
  & ffmpeg -hide_banner -loglevel error -y -ss $ss -i "$SourceFile" -frames:v 1 -update 1 `
      -vf 'scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1' `
      -q:v 3 "$OutPath"
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $OutPath)) {
    throw "Backdrop frame grab failed for $SourceFile"
  }
}

# Upload a whole local directory tree to a remote prefix, one content-type pass
# per extension. rclone --size-only => only missing/changed files transfer.
function Push-Dir {
  param([string]$LocalDir, [string]$RemotePrefix)
  $dst = "r2:$R2Bucket/$RemotePrefix"
  $passes = @(
    @{ Include='*.m3u8';       Type='application/vnd.apple.mpegurl' },
    @{ Include='*.ts';         Type='video/mp2t' },
    @{ Include='*.{jpg,jpeg}'; Type='image/jpeg' },
    @{ Include='*.png';        Type='image/png' },
    @{ Include='*.vtt';        Type='text/vtt' }
  )
  $common = @('--size-only','--s3-no-check-bucket','--transfers',"$Transfers",'--checkers',"$Checkers",
              '--retries','5','--low-level-retries','10','--stats','5s','--stats-one-line','-P')
  if ($DryRun) { $common += '--dry-run' }
  foreach ($p in $passes) {
    & $rclone copy $LocalDir $dst --include $p.Include --header-upload "Content-Type: $($p.Type)" @common
    if ($LASTEXITCODE -ne 0) { throw "rclone failed: $LocalDir -> $dst (pass $($p.Include))" }
  }
}

# Upload a single local file to an exact remote key.
function Push-File {
  param([string]$LocalFile, [string]$RemoteKey, [string]$ContentType)
  $common = @('--s3-no-check-bucket','--retries','5','--low-level-retries','10','-P')
  if ($DryRun) { $common += '--dry-run' }
  & $rclone copyto $LocalFile "r2:$R2Bucket/$RemoteKey" --header-upload "Content-Type: $ContentType" @common
  if ($LASTEXITCODE -ne 0) { throw "rclone failed: $LocalFile -> $RemoteKey" }
}

# Parallel HEAD check. Returns the subset of URLs that are NOT 200.
function Get-MissingUrls {
  param([string[]]$Urls, [int]$Concurrency)
  $handler = [System.Net.Http.HttpClientHandler]::new(); $handler.AllowAutoRedirect = $true
  $client  = [System.Net.Http.HttpClient]::new($handler); $client.Timeout = [TimeSpan]::FromSeconds(30)
  $missing = New-Object System.Collections.Generic.List[string]
  $total = $Urls.Count; $done = 0
  for ($i = 0; $i -lt $total; $i += $Concurrency) {
    $slice = $Urls[$i..([Math]::Min($i + $Concurrency - 1, $total - 1))]
    $pending = foreach ($u in $slice) {
      $req = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Head, $u)
      [pscustomobject]@{ Url=$u; Task=$client.SendAsync($req) }
    }
    foreach ($p in $pending) {
      try { $resp = $p.Task.GetAwaiter().GetResult(); if ([int]$resp.StatusCode -ne 200) { $missing.Add($p.Url) }; $resp.Dispose() }
      catch { $missing.Add($p.Url) }
    }
    $done += $slice.Count
    Write-Host ("`r    verified {0,6}/{1}" -f $done, $total) -NoNewline
  }
  Write-Host ''
  $client.Dispose()
  return $missing
}

# Flip a title live in lib\catalog.ts (idempotent - the // FLIP:<slug> token only
# exists while the title is pending, so re-running after a flip is a no-op).
function Set-CatalogPlayable {
  param([string]$Slug)
  $txt = Get-Content -LiteralPath $CatalogPath -Raw -Encoding UTF8
  $before = $txt
  $txt = $txt.Replace("playable: false, // FLIP:$Slug",  "playable: true, // FLIP-DONE:$Slug")
  $txt = $txt.Replace("comingSoon: true, // FLIP:$Slug", "comingSoon: false, // FLIP-DONE:$Slug")
  if ($txt -ne $before) {
    [System.IO.File]::WriteAllText($CatalogPath, $txt, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host "    catalog: $Slug -> playable:true, comingSoon:false" -ForegroundColor Green
  } else {
    Write-Host "    catalog: no FLIP:$Slug token (already live or entry missing)" -ForegroundColor DarkYellow
  }
}

# --- per-title stages -------------------------------------------------------
function Invoke-Transcode {
  param($Film)
  $out = Join-Path $here "hls\$($Film.Slug)"
  $masterOk = Test-Path -LiteralPath (Join-Path $out 'master.m3u8')
  if ((Test-StageDone $Film.Slug 'transcoded') -and $masterOk -and -not $ForceTranscode) { return }
  if (-not (Test-Path -LiteralPath $Film.Source)) { throw "Source not found: $($Film.Source)" }
  if ($DryRun) { Write-Host "    [dry-run] would transcode -> $out"; return }
  Write-Host "    transcoding (this is the slow part; safe to interrupt & resume)..." -ForegroundColor Cyan
  & "$here\transcode-hls.ps1" -InputPath $Film.Source -Slug $Film.Slug
  if (-not (Test-Path -LiteralPath (Join-Path $out 'master.m3u8'))) { throw "No master.m3u8 produced for $($Film.Slug)" }
  Set-StageDone $Film.Slug 'transcoded'
}

function Build-Assets {
  param($Film)
  if (Test-StageDone $Film.Slug 'assets') { return }
  $stage = Join-Path $here "stage\$($Film.Slug)"
  $null = New-Item -ItemType Directory -Force -Path $stage

  if (-not $SkipSubs) {
    foreach ($lang in @('en','fr')) {
      $srt = Find-Srt -SourceFile $Film.Source -Lang $lang
      if ($srt) {
        $vtt = Join-Path $stage "$lang\$($Film.AssetKey)-$lang.vtt"
        if ($DryRun) { Write-Host "    [dry-run] $lang subs: $srt -> $vtt" }
        else { Convert-SrtToVtt -SrtPath $srt -VttPath $vtt; Write-Host "    subs[$lang]: $(Split-Path $srt -Leaf) -> WebVTT" }
      }
    }
  }

  if (-not $SkipImages) {
    $bd = Join-Path $stage "backdrop-$($Film.AssetKey).jpg"
    if ($DryRun) { Write-Host "    [dry-run] backdrop -> $bd" }
    elseif (-not (Test-Path -LiteralPath $bd)) { New-Backdrop -SourceFile $Film.Source -OutPath $bd; Write-Host "    backdrop: 1920x1080 frame grab" }
  }
  if (-not $DryRun) { Set-StageDone $Film.Slug 'assets' }
}

function Push-Title {
  param($Film)
  $hls   = Join-Path $here "hls\$($Film.Slug)"
  $stage = Join-Path $here "stage\$($Film.Slug)"
  Write-Host "    uploading HLS -> $HlsRoot/$($Film.Slug)/ ..." -ForegroundColor Cyan
  Push-Dir -LocalDir $hls -RemotePrefix "$HlsRoot/$($Film.Slug)"

  if (-not $SkipSubs) {
    foreach ($lang in @('en','fr')) {
      $vtt = Join-Path $stage "$lang\$($Film.AssetKey)-$lang.vtt"
      if (Test-Path -LiteralPath $vtt) {
        Push-File -LocalFile $vtt -RemoteKey "$SubsRoot/$lang/$($Film.AssetKey)-$lang.vtt" -ContentType 'text/vtt'
      }
    }
  }
  if (-not $SkipImages) {
    $bd = Join-Path $stage "backdrop-$($Film.AssetKey).jpg"
    if (Test-Path -LiteralPath $bd) {
      Push-File -LocalFile $bd -RemoteKey "$BackdropRoot/backdrop-$($Film.AssetKey).jpg" -ContentType 'image/jpeg'
    }
  }
}

# Build the full list of public URLs that MUST be 200 for this title.
function Get-ExpectedUrls {
  param($Film)
  $hls = Join-Path $here "hls\$($Film.Slug)"
  $urls = New-Object System.Collections.Generic.List[string]
  if (Test-Path -LiteralPath $hls) {
    $prefix = $hls.Length + 1
    Get-ChildItem -LiteralPath $hls -Recurse -File | ForEach-Object {
      $rel = $_.FullName.Substring($prefix).Replace('\','/')
      $urls.Add("$PublicBase/$HlsRoot/$($Film.Slug)/$rel")
    }
  }
  if (-not $SkipSubs) {
    foreach ($lang in @('en','fr')) {
      $vtt = Join-Path $here "stage\$($Film.Slug)\$lang\$($Film.AssetKey)-$lang.vtt"
      if (Test-Path -LiteralPath $vtt) { $urls.Add("$PublicBase/$SubsRoot/$lang/$($Film.AssetKey)-$lang.vtt") }
    }
  }
  if (-not $SkipImages) {
    $bd = Join-Path $here "stage\$($Film.Slug)\backdrop-$($Film.AssetKey).jpg"
    if (Test-Path -LiteralPath $bd) { $urls.Add("$PublicBase/$BackdropRoot/backdrop-$($Film.AssetKey).jpg") }
  }
  return $urls.ToArray()
}

# --- main loop --------------------------------------------------------------
Write-Host ""
Write-Host "BirgenAI - publishing $($Films.Count) new 1080p title(s)" -ForegroundColor Cyan
Write-Host "  state: $StateDir"
Write-Host "  R2:    $PublicBase/$HlsRoot/<slug>/  (plus Subtitles + Images/backdrops)"
if ($DryRun) { Write-Host "  *** DRY RUN - nothing is transcoded, uploaded, or edited ***" -ForegroundColor Yellow }

for ($loop = 1; $loop -le $MaxLoops; $loop++) {
  $allDone = $true
  foreach ($film in $Films) {
    if (Test-StageDone $film.Slug 'verified') { continue }
    Write-Host ""
    Write-Host "=== $($film.Slug)  (pass $loop) ===" -ForegroundColor Magenta

    Invoke-Transcode -Film $film
    Build-Assets     -Film $film
    if (-not $DryRun) { Push-Title -Film $film }

    Write-Host "    verifying public 200s ..." -ForegroundColor Cyan
    $urls = Get-ExpectedUrls -Film $film
    if (-not $urls -or $urls.Count -eq 0) { Write-Warning "    no objects to verify (transcode incomplete?)"; $allDone = $false; continue }
    if ($DryRun) { Write-Host "    [dry-run] would verify $($urls.Count) objects"; $allDone = $false; continue }

    $missing = Get-MissingUrls -Urls $urls -Concurrency $VerifyConcurrency
    if ($missing.Count -eq 0) {
      Write-Host "    OK - all $($urls.Count) objects return 200." -ForegroundColor Green
      Set-StageDone $film.Slug 'verified'
      if (-not $NoFlip) { Set-CatalogPlayable -Slug $film.Slug }
    } else {
      $allDone = $false
      Write-Host "    $($missing.Count)/$($urls.Count) not yet 200 - re-uploading next pass." -ForegroundColor Yellow
      $missing | Select-Object -First 8 | ForEach-Object { Write-Host "      - $_" }
    }
  }
  if ($allDone) { break }
  if ($loop -lt $MaxLoops) { Write-Host "`n--- pass $loop incomplete; retrying ---" -ForegroundColor DarkYellow; Start-Sleep -Seconds 5 }
}

# --- report -----------------------------------------------------------------
Write-Host ""
Write-Host "================ SUMMARY ================" -ForegroundColor Cyan
$pending = @()
foreach ($film in $Films) {
  if (Test-StageDone $film.Slug 'verified') {
    Write-Host ("  [LIVE]    {0}  -> {1}/{2}/{3}/master.m3u8" -f $film.Slug, $PublicBase, $HlsRoot, $film.Slug) -ForegroundColor Green
  } else {
    Write-Host ("  [PENDING] {0}" -f $film.Slug) -ForegroundColor Yellow
    $pending += $film.Slug
  }
}
if ($DryRun) {
  Write-Host "`nDry run complete." -ForegroundColor Cyan
} elseif ($pending.Count -eq 0) {
  Write-Host "`nAll titles are transcoded, uploaded, verified (200), and flipped live in the catalog." -ForegroundColor Green
  Write-Host "Next: commit lib\catalog.ts and deploy the web app. Optionally upload bespoke"
  Write-Host "card art to Images/cards/card-<assetKey>.jpg to replace the frame-grab backdrops."
} else {
  Write-Host "`nNot finished - re-run this same command to resume: $($pending -join ', ')" -ForegroundColor Yellow
}
