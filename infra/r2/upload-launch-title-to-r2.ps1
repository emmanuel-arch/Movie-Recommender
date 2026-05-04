<#
.SYNOPSIS
  Upload one launch title’s assets + HLS tree to birgenai-assets using the canonical R2 layout.

.DESCRIPTION
  Images →  Images/posters|backdrops|heroes|thumbnails|logos|trailers/...
  Clips   →  Videos/clips/hero-{assetKey}.mp4
  Trailers→  Videos/trailers/trailer-{assetKey}.mp4
  Previews→  Videos/previews/preview-{assetKey}.mp4
  HLS     →  {FilmsPrefix}/{slug}/...   (default FilmsPrefix = Videos/films)

  Prereq: npm i -g wrangler && wrangler login

.EXAMPLE
  # 1) Stage files under infra/r2/staging/get-out/ (see STAGING LAYOUT in script comments)
  cd infra\r2
  .\upload-launch-title-to-r2.ps1 -Title get-out -StagingDir .\staging\get-out -HlsDir ..\ffmpeg\hls\get-out

.EXAMPLE
  # 2) Point at your Next.js public folder — reuses legacy Get Out filenames (getout.png, hero/trailer mp4s)
  .\upload-launch-title-to-r2.ps1 -Title get-out -UseLegacyWebPublic -WebPublicDir ..\..\web\public -HlsDir ..\ffmpeg\hls\get-out

.NOTES
  After uploading HLS under Videos/films/, set in web/.env.local:
    NEXT_PUBLIC_HLS_ROOT=Videos/films
  (If you keep HLS under Videos/{slug}/ only, set FilmsPrefix to "Videos" and omit NEXT_PUBLIC_HLS_ROOT override.)
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $false)]
  [ValidateSet('get-out', 'sicario', 'inception', 'the-dark-knight', 'shutter-island')]
  [string]$Title = 'get-out',

  # Folder with files ready using *canonical names* (see comment block at end of script)
  [string]$StagingDir = '',

  # Local HLS output folder (must contain master.m3u8). Uploaded under {FilmsPrefix}/{slug}/
  [string]$HlsDir = '',

  [string]$R2Bucket = 'birgenai-assets',

  # R2 prefix for feature films (matches NEXT_PUBLIC_HLS_ROOT=Videos/films)
  [string]$FilmsPrefix = 'Videos/films',

  # Path to web/public — used only with -UseLegacyWebPublic
  [string]$WebPublicDir = '',

  [switch]$UseLegacyWebPublic,

  [switch]$SkipHls,
  [switch]$SkipAssets,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

$Titles = @{
  'get-out'          = @{ Slug = 'get-out'; AssetKey = 'get-out-2017' }
  'sicario'          = @{ Slug = 'sicario'; AssetKey = 'sicario-2015' }
  'inception'        = @{ Slug = 'inception'; AssetKey = 'inception-2010' }
  'the-dark-knight'  = @{ Slug = 'the-dark-knight'; AssetKey = 'the-dark-knight-2008' }
  'shutter-island'   = @{ Slug = 'shutter-island'; AssetKey = 'shutter-island-2010' }
}

$T = $Titles[$Title]
$slug = $T.Slug
$key = $T.AssetKey

function Get-R2ContentType([string]$Name) {
  switch -Regex ($Name) {
    '\.m3u8$' { return 'application/vnd.apple.mpegurl' }
    '\.ts$' { return 'video/mp2t' }
    '\.(jpe?g)$' { return 'image/jpeg' }
    '\.png$' { return 'image/png' }
    '\.webp$' { return 'image/webp' }
    '\.mp4$' { return 'video/mp4' }
    '\.vtt$' { return 'text/vtt; charset=utf-8' }
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
    Write-Warning "Skip missing file: $LocalFile"
    return
  }
  $full = "$R2Bucket/$ObjectKey"
  Write-Host "  PUT $ObjectKey  <=  $LocalFile" -ForegroundColor Cyan
  if ($DryRun) { return }
  & wrangler r2 object put $full --file="$LocalFile" --content-type=$ContentType --remote
  if ($LASTEXITCODE -ne 0) {
    throw "wrangler failed for $ObjectKey (exit $LASTEXITCODE)"
  }
}

if (-not $DryRun -and -not (Get-Command wrangler -ErrorAction SilentlyContinue)) {
  throw "wrangler not found. Install: npm i -g wrangler  then  wrangler login"
}

# ── Asset uploads (canonical staging layout) ───────────────────────────────
if (-not $SkipAssets) {
  if ($UseLegacyWebPublic) {
    if (-not $WebPublicDir) {
      throw "With -UseLegacyWebPublic you must pass -WebPublicDir (e.g. ..\..\web\public)"
    }
    $Pub = (Resolve-Path -LiteralPath $WebPublicDir).Path

    if ($Title -eq 'get-out') {
      $img = Join-Path $Pub 'Images\getout.png'
      if (Test-Path -LiteralPath $img) {
        # Same still as poster / backdrop / hero until you export separate JPGs
        Invoke-R2Put $img "Images/posters/poster-$key.png" (Get-R2ContentType 'poster.png')
        Invoke-R2Put $img "Images/backdrops/backdrop-$key.png" (Get-R2ContentType 'backdrop.png')
        Invoke-R2Put $img "Images/heroes/hero-$key.png" (Get-R2ContentType 'hero.png')
      } else {
        Write-Warning "Legacy image not found: $img"
      }
      $thumb = Join-Path $Pub "Images\thumbnails\thumb-$key.jpg"
      if (Test-Path -LiteralPath $thumb) {
        Invoke-R2Put $thumb "Images/thumbnails/thumb-$key.jpg" (Get-R2ContentType 'thumb.jpg')
      } else {
        Write-Warning "Optional thumbnail not found: $thumb — generate 800x450 JPG or add later."
      }
      $logo = Join-Path $Pub "Images\logos\logo-$key.png"
      if (Test-Path -LiteralPath $logo) {
        Invoke-R2Put $logo "Images/logos/logo-$key.png" (Get-R2ContentType 'logo.png')
      } else {
        Write-Warning "Optional logo not found: $logo"
      }
      $ttr = Join-Path $Pub 'Videos\trailer-getout-2017.mp4'
      if (Test-Path -LiteralPath $ttr) {
        Invoke-R2Put $ttr "Videos/trailers/trailer-$key.mp4" (Get-R2ContentType 't.mp4')
      }
      $hv = Join-Path $Pub 'Videos\hero-getout-2017.mp4'
      if (Test-Path -LiteralPath $hv) {
        Invoke-R2Put $hv "Videos/clips/hero-$key.mp4" (Get-R2ContentType 'h.mp4')
      }
      $pr = Join-Path $Pub 'Videos\previews\preview-get-out-2017.mp4'
      if (-not (Test-Path -LiteralPath $pr)) {
        $pr = Join-Path $Pub "Videos\previews\preview-$key.mp4"
      }
      if (Test-Path -LiteralPath $pr) {
        Invoke-R2Put $pr "Videos/previews/preview-$key.mp4" (Get-R2ContentType 'p.mp4')
      } else {
        Write-Warning "Optional hover preview not found under Videos/previews/"
      }
      # Optional VTT next to repo convention
      foreach ($lang in @('en', 'sw', 'fr')) {
        $vtt = Join-Path $Pub "Subtitles\$lang\$key-$lang.vtt"
        if (Test-Path -LiteralPath $vtt) {
          Invoke-R2Put $vtt "Subtitles/$lang/$key-$lang.vtt" (Get-R2ContentType 'captions.vtt')
        }
      }
    } else {
      throw "-UseLegacyWebPublic is implemented for get-out first. Use -StagingDir for other titles or extend the script."
    }
  }
  elseif ($StagingDir) {
    $S = (Resolve-Path -LiteralPath $StagingDir).Path
    $map = @(
      @{ Rel = "poster-$key.jpg"; Key = "Images/posters/poster-$key.jpg" }
      @{ Rel = "backdrop-$key.jpg"; Key = "Images/backdrops/backdrop-$key.jpg" }
      @{ Rel = "backdrop-$key-alt.jpg"; Key = "Images/backdrops/backdrop-$key-alt.jpg" }
      @{ Rel = "hero-$key.jpg"; Key = "Images/heroes/hero-$key.jpg" }
      @{ Rel = "thumb-$key.jpg"; Key = "Images/thumbnails/thumb-$key.jpg" }
      @{ Rel = "logo-$key.png"; Key = "Images/logos/logo-$key.png" }
      @{ Rel = "trailer-thumb-$key.jpg"; Key = "Images/trailers/trailer-thumb-$key.jpg" }
      @{ Rel = "clip-hero.mp4"; Key = "Videos/clips/hero-$key.mp4" }
      @{ Rel = "trailer.mp4"; Key = "Videos/trailers/trailer-$key.mp4" }
      @{ Rel = "preview.mp4"; Key = "Videos/previews/preview-$key.mp4" }
    )
    foreach ($row in $map) {
      $local = Join-Path $S $row.Rel.Replace('/', '\')
      if (Test-Path -LiteralPath $local) {
        $ct = Get-R2ContentType $row.Key
        Invoke-R2Put $local $row.Key $ct
      }
    }
    foreach ($lang in @('en', 'sw', 'fr')) {
      $vtt = Join-Path $S "subtitles\$lang\$key-$lang.vtt"
      if (Test-Path -LiteralPath $vtt) {
        Invoke-R2Put $vtt "Subtitles/$lang/$key-$lang.vtt" (Get-R2ContentType 'sub.vtt')
      }
    }
  }
  else {
    Write-Warning "No -StagingDir or -UseLegacyWebPublic — skipping image/trailer uploads. Use -SkipAssets:$false with a source."
  }
}

# ── HLS tree ──────────────────────────────────────────────────────────────
if (-not $SkipHls) {
  if (-not $HlsDir) {
    Write-Warning "No -HlsDir — skipping HLS. Transcode first (see infra/ffmpeg README)."
  } else {
    $H = (Resolve-Path -LiteralPath $HlsDir).Path
    if (-not (Test-Path -LiteralPath "$H\master.m3u8")) {
      Write-Warning "Missing master.m3u8 under $H"
    }
    $prefix = "$FilmsPrefix/$slug".TrimEnd('/')
    Write-Host "`n-> HLS to $R2Bucket/$prefix/ ..." -ForegroundColor Green
    Get-ChildItem -Path $H -Recurse -File | ForEach-Object {
      $rel = $_.FullName.Substring($H.Length + 1).Replace('\', '/')
      $objectKey = "$prefix/$rel"
      $ct = Get-R2ContentType $rel
      Invoke-R2Put $_.FullName $objectKey $ct
    }
    # Optional: duplicate poster into film folder for player thumb (if you keep poster.jpg beside master)
    $filmPoster = Join-Path $H 'poster.jpg'
    if (Test-Path -LiteralPath $filmPoster) {
          Invoke-R2Put $filmPoster "$prefix/poster.jpg" (Get-R2ContentType 'poster.jpg')
    }
    Write-Host "HLS manifest URL (after custom domain): https://<YOUR_HOST>/$prefix/master.m3u8" -ForegroundColor Green
  }
}

Write-Host "`nDone." -ForegroundColor Green
if ($Title -eq 'get-out' -and $UseLegacyWebPublic) {
  Write-Host @"

Next steps for Get Out:
  1) Point NEXT_PUBLIC_R2_PUBLIC_URL at your public bucket URL.
  2) If HLS is under Videos/films/, add: NEXT_PUBLIC_HLS_ROOT=Videos/films
  3) Update web/lib/catalog.ts Get Out media.* URLs to the new R2 paths (or remove media block to use defaults).
     PNG stills were uploaded as poster/backdrop/hero with .png keys — match in catalog or re-export as JPG.

STAGING LAYOUT (canonical -StagingDir .\staging) optional files:
  poster-{assetKey}.jpg
  backdrop-{assetKey}.jpg
  backdrop-{assetKey}-alt.jpg
  hero-{assetKey}.jpg
  thumb-{assetKey}.jpg
  logo-{assetKey}.png
  trailer-thumb-{assetKey}.jpg
  clip-hero.mp4
  trailer.mp4
  preview.mp4
  subtitles\en|sw|fr\{assetKey}-en.vtt  (etc.)
"@ -ForegroundColor DarkGray
}

<#
STAGING LAYOUT (reference)
  staging\<slug>\
    poster-<assetKey>.jpg
    backdrop-<assetKey>.jpg
    hero-<assetKey>.jpg
    thumb-<assetKey>.jpg
    logo-<assetKey>.png
    clip-hero.mp4      → Videos/clips/hero-<assetKey>.mp4
    trailer.mp4        → Videos/trailers/trailer-<assetKey>.mp4
    preview.mp4        → Videos/previews/preview-<assetKey>.mp4
    subtitles\en\<assetKey>-en.vtt
#>
