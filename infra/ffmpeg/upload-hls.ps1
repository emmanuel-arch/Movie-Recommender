<#
.SYNOPSIS
  Resume-safe upload of local .\hls\<slug>\ trees to Cloudflare R2.

  Verifies what is ALREADY in R2 (via cheap HTTP HEAD against the public host)
  and uploads ONLY the files that are missing. Nothing is re-uploaded and
  nothing is deleted, so you can run it as many times as you like to fill gaps
  left by interrupted/expired-token runs.

.DESCRIPTION
  For every local file under hls/<slug>/ the script builds its R2 key
  (Videos/films/<slug>/<rel>) and HEAD-probes <PublicBase>/<key>:
    200  -> already uploaded, skip
    else -> upload with `wrangler r2 object put` (with retry + backoff)

  HEAD checks run in parallel (default 40 at a time) so verifying ~6000 files
  takes well under two minutes. Uploads are sequential through wrangler.

  Auth handling: if wrangler returns a 401 / "Authentication error" (the OAuth
  token expired mid-run), the file is retried with backoff; after several
  consecutive auth failures the run stops with clear guidance. Everything
  already uploaded stays put — just `wrangler login` and re-run; it resumes.

.EXAMPLE
  cd infra\ffmpeg
  .\upload-hls.ps1                       # verify + finish ALL slugs (default order)

.EXAMPLE
  .\upload-hls.ps1 -Slug sicario         # just one movie

.EXAMPLE
  .\upload-hls.ps1 -Slug inception,the-dark-knight

.EXAMPLE
  .\upload-hls.ps1 -DryRun               # report what's missing, upload nothing

.NOTES
  Extra images (backdrop/hero/thumb/poster-<slug>-<year>.jpg) are uploaded too —
  just drop the .jpg files into hls/<slug>/ and re-run; they're treated like any
  other loose file (HEAD-checked, uploaded if missing).
#>
[CmdletBinding()]
param(
  [string[]]$Slug = @('get-out', 'sicario', 'inception', 'shutter-island', 'the-dark-knight'),
  [string]$PublicBase = 'https://assets.birgenai.com',
  [string]$R2Bucket   = 'birgenai-assets',
  [string]$RemoteRoot = 'Videos/films',
  [int]$Concurrency   = 40,
  [int]$MaxRetries    = 5,
  [int]$MaxAuthFailures = 3,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$PublicBase = $PublicBase.TrimEnd('/')
$RemoteRoot = $RemoteRoot.Trim('/')

if (-not (Get-Command wrangler -ErrorAction SilentlyContinue)) {
  throw "wrangler not installed. npm i -g wrangler ; wrangler login"
}

Add-Type -AssemblyName System.Net.Http | Out-Null

function Get-ContentType([string]$rel) {
  switch -Regex ($rel) {
    '\.m3u8$'     { 'application/vnd.apple.mpegurl'; break }
    '\.ts$'       { 'video/mp2t'; break }
    '\.(jpe?g)$'  { 'image/jpeg'; break }
    '\.png$'      { 'image/png'; break }
    '\.webp$'     { 'image/webp'; break }
    '\.mp4$'      { 'video/mp4'; break }
    '\.vtt$'      { 'text/vtt'; break }
    default       { 'application/octet-stream' }
  }
}

# --- Parallel HEAD existence check -----------------------------------------
# Returns the same objects with an added .Exists boolean. Uses one shared
# HttpClient and processes URLs in concurrency-sized batches.
function Test-RemoteBatch {
  param([object[]]$Items, [int]$Concurrency)

  $handler = [System.Net.Http.HttpClientHandler]::new()
  $handler.AllowAutoRedirect = $true
  $client  = [System.Net.Http.HttpClient]::new($handler)
  $client.Timeout = [TimeSpan]::FromSeconds(30)

  $done = 0
  $total = $Items.Count
  for ($i = 0; $i -lt $total; $i += $Concurrency) {
    $slice = $Items[$i..([Math]::Min($i + $Concurrency - 1, $total - 1))]
    $pending = @()
    foreach ($it in $slice) {
      $req = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Head, $it.Url)
      $pending += [pscustomobject]@{ Item = $it; Task = $client.SendAsync($req) }
    }
    foreach ($p in $pending) {
      try {
        $resp = $p.Task.GetAwaiter().GetResult()
        $p.Item | Add-Member -NotePropertyName Exists -NotePropertyValue ([int]$resp.StatusCode -eq 200) -Force
        $resp.Dispose()
      }
      catch {
        # Network/timeout — treat as "not confirmed present" so we (re)upload.
        $p.Item | Add-Member -NotePropertyName Exists -NotePropertyValue $false -Force
      }
    }
    $done += $slice.Count
    Write-Host ("`r    verified {0,6}/{1}" -f $done, $total) -NoNewline
  }
  Write-Host ''
  $client.Dispose()
  return $Items
}

# --- Upload one file via wrangler, with retry/backoff ----------------------
# Returns: 'ok' | 'failed' | 'auth'  (auth = looks like an expired/invalid token)
function Invoke-Upload {
  param([string]$Key, [string]$File, [string]$ContentType, [int]$MaxRetries)

  for ($attempt = 1; $attempt -le $MaxRetries; $attempt++) {
    $out = & wrangler r2 object put "$R2Bucket/$Key" --file="$File" --content-type="$ContentType" --remote 2>&1
    if ($LASTEXITCODE -eq 0) { return 'ok' }

    $text = ($out | Out-String)
    $isAuth = $text -match '(?i)(401|Unauthorized|Authentication error|code"?\s*:?\s*10000)'
    if ($isAuth) {
      Write-Host ''
      Write-Warning "Auth failure on '$Key' (attempt $attempt/$MaxRetries) — OAuth token may have expired."
      if ($attempt -lt $MaxRetries) {
        Start-Sleep -Seconds ([Math]::Min(30, 5 * $attempt))
        continue
      }
      return 'auth'
    }

    Write-Warning "Upload failed for '$Key' (attempt $attempt/$MaxRetries, exit $LASTEXITCODE):`n$text"
    if ($attempt -lt $MaxRetries) { Start-Sleep -Seconds ([Math]::Min(20, 2 * $attempt)) }
  }
  return 'failed'
}

# ---------------------------------------------------------------------------
$root = Get-Location
$grandMissing = 0
$grandFailed  = @()

foreach ($s in $Slug) {
  $local = Join-Path $root "hls/$s"
  if (-not (Test-Path -LiteralPath $local -PathType Container)) {
    Write-Warning "Skipping '$s' — folder not found: $local"
    continue
  }

  Write-Host ""
  Write-Host "=== $s ===" -ForegroundColor Cyan
  if (-not (Test-Path -LiteralPath (Join-Path $local 'master.m3u8'))) {
    Write-Warning "  No local master.m3u8 under $local — tree may be incomplete."
  }

  $prefixLen = $local.Length + 1
  $items = Get-ChildItem -LiteralPath $local -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($prefixLen).Replace('\', '/')
    $key = "$RemoteRoot/$s/$rel"
    [pscustomobject]@{
      File        = $_.FullName
      Rel         = $rel
      Key         = $key
      Url         = "$PublicBase/$key"
      ContentType = (Get-ContentType $rel)
    }
  }

  if (-not $items) { Write-Warning "  No files under $local"; continue }

  Write-Host ("  {0} local files — verifying against {1} ..." -f $items.Count, $PublicBase)
  $items = Test-RemoteBatch -Items $items -Concurrency $Concurrency
  $missing = @($items | Where-Object { -not $_.Exists })
  $present = $items.Count - $missing.Count

  Write-Host ("  present: {0}   missing: {1}" -f $present, $missing.Count) -ForegroundColor Yellow

  # Per-folder breakdown of what's missing (helps spot the gaps).
  if ($missing.Count -gt 0) {
    $missing | Group-Object { ($_.Rel -split '/')[0] } | Sort-Object Name | ForEach-Object {
      Write-Host ("    - {0}: {1} missing" -f $_.Name, $_.Count)
    }
  }

  if ($missing.Count -eq 0) { Write-Host "  Nothing to do." -ForegroundColor Green; continue }
  if ($DryRun) { $grandMissing += $missing.Count; continue }

  # Upload missing files (smallest dirs / loose files first is fine; keep order).
  $i = 0; $ok = 0; $failed = @(); $authStreak = 0
  foreach ($m in $missing) {
    $i++
    Write-Host ("  [{0}/{1}] {2}" -f $i, $missing.Count, $m.Key)
    $result = Invoke-Upload -Key $m.Key -File $m.File -ContentType $m.ContentType -MaxRetries $MaxRetries
    switch ($result) {
      'ok'   { $ok++; $authStreak = 0 }
      'auth' {
        $authStreak++
        $failed += $m.Key
        if ($authStreak -ge $MaxAuthFailures) {
          Write-Host ''
          Write-Host "Stopping: $authStreak consecutive auth failures — your wrangler token is expired/invalid." -ForegroundColor Red
          Write-Host "Everything uploaded so far is saved. To finish:" -ForegroundColor Red
          Write-Host "    wrangler logout ; wrangler login" -ForegroundColor Red
          Write-Host "  then re-run this script — it resumes and only uploads what's still missing." -ForegroundColor Red
          $grandFailed += $failed
          throw "Aborted on auth failure (resume by re-running after re-login)."
        }
      }
      'failed' { $failed += $m.Key; $authStreak = 0 }
    }
  }

  Write-Host ("  $s done — uploaded {0}, failed {1}" -f $ok, $failed.Count) -ForegroundColor Green
  if ($failed.Count -gt 0) {
    $grandFailed += $failed
    $failLog = Join-Path $local ".upload-failed.txt"
    $failed | Set-Content -LiteralPath $failLog -Encoding UTF8
    Write-Warning "  $($failed.Count) file(s) failed — listed in $failLog. Re-run to retry them."
  }
}

Write-Host ""
if ($DryRun) {
  Write-Host "DRY RUN — $grandMissing file(s) would be uploaded across the selected slugs." -ForegroundColor Cyan
}
elseif ($grandFailed.Count -gt 0) {
  Write-Host "Finished with $($grandFailed.Count) failed upload(s). Re-run the script to retry them." -ForegroundColor Yellow
}
else {
  Write-Host "All selected slugs are fully uploaded." -ForegroundColor Green
  foreach ($s in $Slug) {
    Write-Host "  $PublicBase/$RemoteRoot/$s/master.m3u8"
  }
}
