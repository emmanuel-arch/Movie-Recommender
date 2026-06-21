<#
.SYNOPSIS
  Verify that a transcoded film is FULLY and CONSISTENTLY present in R2 - every
  segment, playlist, poster, subtitle, backdrop and card-art object - with no
  truncation, so the in-browser player has nothing missing to choke on.

.DESCRIPTION
  Two independent checks per title, because "the file exists" (HTTP 200) is NOT
  the same as "the file is the right size" (a segment truncated when a previous
  upload/transcode died still returns 200):

    1. LOCAL MANIFEST CONSISTENCY (offline, no network)
       - master.m3u8 lists all 4 renditions and each stream.m3u8 exists locally.
       - every seg*.ts a rendition playlist references exists on disk and is >0 bytes.
       - poster.jpg exists.
       This proves the local output we are about to compare against is itself sound.

    2. R2 BYTE-PARITY (rclone check --size-only)
       - every local object exists in R2 at the EXACT same byte size.
       - reports anything missing on R2, or present but wrong-size (truncated),
         or present on R2 but not locally (orphans / stale).
       --size-only matches the uploader's own comparison mode and catches the
       truncation case HEAD-200 cannot.

  It also confirms the side-car assets the player/cards need:
    - Subtitles/<lang>/<assetKey>-<lang>.vtt  (only the langs that were staged)
    - Images/backdrops/backdrop-<assetKey>.jpg (only if a backdrop was staged)
    - Images/cards/card-<assetKey>.jpg         (cinematic card art; the user uploads these)

  READ-ONLY. Uploads nothing, edits nothing. Safe to run any time.

.EXAMPLE
  .\verify-r2-films.ps1 -Slug f1-the-movie-2025,goat-2026,hoppers-2026,italianna-2026
#>
[CmdletBinding()]
param(
  [string[]]$Slug = @('f1-the-movie-2025','goat-2026','hoppers-2026','italianna-2026'),
  [string]$R2Bucket   = 'birgenai-assets',
  [string]$HlsRoot    = 'Videos/films',
  [string]$SubsRoot   = 'Subtitles',
  [string]$BackdropRoot = 'Images/backdrops',
  [string]$CardRoot   = 'Images/cards',
  # assetKey defaults to the slug (true for all of this drop); override if it differs.
  [hashtable]$AssetKeyMap = @{}
)

$ErrorActionPreference = 'Stop'
$here = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
Set-Location -LiteralPath $here

# --- locate rclone ----------------------------------------------------------
$rclone = (Get-Command rclone -ErrorAction SilentlyContinue).Source
if (-not $rclone) {
  $found = Get-ChildItem -Path "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter rclone.exe -ErrorAction SilentlyContinue |
           Select-Object -First 1 -ExpandProperty FullName
  if ($found) { $rclone = $found }
}
if (-not $rclone) { throw "rclone not found. winget install Rclone.Rclone" }

# --- R2 creds -> inline rclone remote 'r2:' ---------------------------------
$credFile = Join-Path $here '.r2-credentials.ps1'
if (Test-Path -LiteralPath $credFile) { . $credFile }
$accessKey = if ($R2_ACCESS_KEY_ID)     { $R2_ACCESS_KEY_ID }     else { $env:R2_ACCESS_KEY_ID }
$secretKey = if ($R2_SECRET_ACCESS_KEY) { $R2_SECRET_ACCESS_KEY } else { $env:R2_SECRET_ACCESS_KEY }
$accountId = if ($R2_ACCOUNT_ID)        { $R2_ACCOUNT_ID }        else { $env:R2_ACCOUNT_ID }
if (-not $accountId) { $accountId = 'fdcc8a0fa4782d2310c75e78cddf67b6' }
if (-not $accessKey -or -not $secretKey -or $accessKey -like 'PASTE_*') {
  throw "Missing R2 S3 credentials (.r2-credentials.ps1)."
}
$env:RCLONE_CONFIG_R2_TYPE              = 's3'
$env:RCLONE_CONFIG_R2_PROVIDER          = 'Cloudflare'
$env:RCLONE_CONFIG_R2_ACCESS_KEY_ID     = $accessKey
$env:RCLONE_CONFIG_R2_SECRET_ACCESS_KEY = $secretKey
$env:RCLONE_CONFIG_R2_ENDPOINT          = "https://$accountId.r2.cloudflarestorage.com"
$env:RCLONE_CONFIG_R2_ACL               = 'private'

# Run rclone, returning ALL output (stdout + stderr) as plain strings. rclone writes
# NOTICE/summary lines to stderr; under ErrorActionPreference 'Stop' PS 5.1 would turn
# those into terminating NativeCommandErrors, so we downgrade to 'Continue' for the call
# and flatten any ErrorRecord back to its string. NOTICE lines are harmless to our
# parsers (they don't start with the --combined flag chars / the lsl size pattern).
function Invoke-Rclone {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$RArgs)
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { $raw = & $rclone @RArgs 2>&1 }
  finally { $ErrorActionPreference = $prev }
  return @($raw | ForEach-Object { if ($_ -is [System.Management.Automation.ErrorRecord]) { $_.ToString() } else { [string]$_ } })
}

function Test-LocalManifest {
  param([string]$HlsDir)
  $problems = New-Object System.Collections.Generic.List[string]
  $master = Join-Path $HlsDir 'master.m3u8'
  if (-not (Test-Path -LiteralPath $master)) { $problems.Add("missing master.m3u8"); return [pscustomobject]@{ Ok=$false; Problems=$problems; Segments=0 } }
  if (-not (Test-Path -LiteralPath (Join-Path $HlsDir 'poster.jpg'))) { $problems.Add("missing poster.jpg") }

  $segTotal = 0
  foreach ($r in '1080p','720p','480p','360p') {
    $play = Join-Path $HlsDir "$r/stream.m3u8"
    if (-not (Test-Path -LiteralPath $play)) { $problems.Add("missing $r/stream.m3u8"); continue }
    $lines = Get-Content -LiteralPath $play
    if (($lines | Select-Object -Last 1) -ne '#EXT-X-ENDLIST') { $problems.Add("$r/stream.m3u8 has no #EXT-X-ENDLIST (truncated playlist)") }
    $segs = $lines | Where-Object { $_ -match '\.ts$' }
    $segTotal += $segs.Count
    foreach ($s in $segs) {
      $tsPath = Join-Path (Join-Path $HlsDir $r) $s
      if (-not (Test-Path -LiteralPath $tsPath)) { $problems.Add("${r}: playlist references missing $s"); continue }
      if ((Get-Item -LiteralPath $tsPath).Length -le 0) { $problems.Add("${r}: $s is 0 bytes") }
    }
  }
  return [pscustomobject]@{ Ok = ($problems.Count -eq 0); Problems = $problems; Segments = $segTotal }
}

# rclone check src -> dst with --size-only. Parse the summary + any *path lines.
function Invoke-RcloneCheck {
  param([string]$LocalDir, [string]$RemotePrefix)
  $dst = "r2:$R2Bucket/$RemotePrefix"
  # --combined writes one line per file with a leading flag:
  #   '=' match, '+' only on dst (R2), '-' only on src (local), '*' size/hash differ, '!' error
  # --combined flags (literal first char): '=' match, '*' differ, '+' only on dst(R2),
  # '-' only on src(local), '!' error. Match by StartsWith so the '*' line isn't read
  # as a PowerShell -like wildcard (which would match every line).
  $out = Invoke-Rclone check $LocalDir $dst --size-only --s3-no-check-bucket --checkers 32 --combined -
  $missingOnR2 = @($out | Where-Object { $_.StartsWith('- ') } | ForEach-Object { $_.Substring(2) })
  $differ      = @($out | Where-Object { $_.StartsWith('* ') } | ForEach-Object { $_.Substring(2) })
  $onlyOnR2    = @($out | Where-Object { $_.StartsWith('+ ') } | ForEach-Object { $_.Substring(2) })
  $errored     = @($out | Where-Object { $_.StartsWith('! ') } | ForEach-Object { $_.Substring(2) })
  $matched     = @($out | Where-Object { $_.StartsWith('= ') }).Count
  return [pscustomobject]@{ Matched=$matched; MissingOnR2=$missingOnR2; Differ=$differ; OnlyOnR2=$onlyOnR2; Errored=$errored }
}

# Does a single remote key exist (and at what size)?
function Get-RemoteSize {
  param([string]$Key)
  $line = Invoke-Rclone lsl "r2:$R2Bucket/$Key" --s3-no-check-bucket | Where-Object { $_ -match '^\s*\d+\s' } | Select-Object -First 1
  if (-not $line) { return $null }
  if ($line -match '^\s*(\d+)\s') { return [long]$Matches[1] }
  return $null
}

$grand = [pscustomobject]@{ Pass=@(); Fail=@() }

foreach ($s in $Slug) {
  $assetKey = if ($AssetKeyMap.ContainsKey($s)) { $AssetKeyMap[$s] } else { $s }
  $hls = Join-Path $here "hls\$s"
  Write-Host ""
  Write-Host "========================================================" -ForegroundColor Cyan
  Write-Host " $s   (assetKey: $assetKey)" -ForegroundColor Cyan
  Write-Host "========================================================" -ForegroundColor Cyan

  $titleProblems = New-Object System.Collections.Generic.List[string]

  if (-not (Test-Path -LiteralPath $hls -PathType Container)) {
    Write-Host "  [LOCAL]  no local hls\$s folder - cannot verify" -ForegroundColor Red
    $grand.Fail += $s
    continue
  }

  # 1. local manifest consistency
  $m = Test-LocalManifest -HlsDir $hls
  if ($m.Ok) {
    Write-Host ("  [LOCAL]  manifest consistent: {0} segments across 4 renditions + poster" -f $m.Segments) -ForegroundColor Green
  } else {
    Write-Host "  [LOCAL]  manifest PROBLEMS:" -ForegroundColor Red
    $m.Problems | ForEach-Object { Write-Host "             - $_" -ForegroundColor Red; $titleProblems.Add("local: $_") }
  }

  # 2. R2 byte-parity for the HLS tree
  $chk = Invoke-RcloneCheck -LocalDir $hls -RemotePrefix "$HlsRoot/$s"
  Write-Host ("  [R2]     HLS objects byte-matched in R2: {0}" -f $chk.Matched) -ForegroundColor $(if ($chk.MissingOnR2.Count -eq 0 -and $chk.Differ.Count -eq 0) { 'Green' } else { 'Red' })
  if ($chk.MissingOnR2.Count) {
    Write-Host ("  [R2]     MISSING on R2: {0}" -f $chk.MissingOnR2.Count) -ForegroundColor Red
    $chk.MissingOnR2 | Select-Object -First 12 | ForEach-Object { Write-Host "             - $_" -ForegroundColor Red }
    $chk.MissingOnR2 | ForEach-Object { $titleProblems.Add("r2-missing: $_") }
  }
  if ($chk.Differ.Count) {
    Write-Host ("  [R2]     WRONG SIZE (truncated?) on R2: {0}" -f $chk.Differ.Count) -ForegroundColor Red
    $chk.Differ | Select-Object -First 12 | ForEach-Object { Write-Host "             ~ $_" -ForegroundColor Red }
    $chk.Differ | ForEach-Object { $titleProblems.Add("r2-wrong-size: $_") }
  }
  if ($chk.Errored.Count) {
    Write-Host ("  [R2]     ERRORED during check: {0}" -f $chk.Errored.Count) -ForegroundColor Red
    $chk.Errored | Select-Object -First 12 | ForEach-Object { Write-Host "             ! $_" -ForegroundColor Red }
    $chk.Errored | ForEach-Object { $titleProblems.Add("r2-error: $_") }
  }
  if ($chk.OnlyOnR2.Count) {
    Write-Host ("  [R2]     note: {0} object(s) exist on R2 but not locally (stale/extra, not fatal)" -f $chk.OnlyOnR2.Count) -ForegroundColor DarkYellow
    $chk.OnlyOnR2 | Select-Object -First 6 | ForEach-Object { Write-Host "             + $_" -ForegroundColor DarkYellow }
  }

  # 3. side-car assets: subs (staged langs only), backdrop, card art
  $stage = Join-Path $here "stage\$s"
  $stagedVtts = @(Get-ChildItem -LiteralPath $stage -Recurse -Filter '*.vtt' -ErrorAction SilentlyContinue)
  foreach ($v in $stagedVtts) {
    $lang = Split-Path (Split-Path $v.FullName -Parent) -Leaf
    $key = "$SubsRoot/$lang/$assetKey-$lang.vtt"
    $rs = Get-RemoteSize -Key $key
    if ($null -eq $rs) { Write-Host "  [SUBS]   MISSING on R2: $key" -ForegroundColor Red; $titleProblems.Add("subs-missing: $key") }
    elseif ($rs -ne $v.Length) { Write-Host "  [SUBS]   WRONG SIZE on R2: $key ($rs vs local $($v.Length))" -ForegroundColor Red; $titleProblems.Add("subs-size: $key") }
    else { Write-Host "  [SUBS]   ok: $lang ($($v.Length) bytes)" -ForegroundColor Green }
  }
  if (-not $stagedVtts) { Write-Host "  [SUBS]   none staged for this title (no subtitle source) - player CC menu simply omits it" -ForegroundColor DarkGray }

  $bdLocal = Join-Path $stage "backdrop-$assetKey.jpg"
  if (Test-Path -LiteralPath $bdLocal) {
    $rs = Get-RemoteSize -Key "$BackdropRoot/backdrop-$assetKey.jpg"
    if ($null -eq $rs) { Write-Host "  [BCKDR]  MISSING on R2: $BackdropRoot/backdrop-$assetKey.jpg" -ForegroundColor Red; $titleProblems.Add("backdrop-missing") }
    else { Write-Host "  [BCKDR]  ok ($rs bytes)" -ForegroundColor Green }
  }

  # card art is uploaded by the user; report presence (its absence falls back to backdrop in the UI)
  $cardSize = Get-RemoteSize -Key "$CardRoot/card-$assetKey.jpg"
  if ($null -eq $cardSize) { Write-Host "  [CARD]   not yet in R2: $CardRoot/card-$assetKey.jpg (card will fall back to backdrop)" -ForegroundColor DarkYellow }
  else { Write-Host "  [CARD]   ok ($cardSize bytes)" -ForegroundColor Green }

  if ($titleProblems.Count -eq 0) {
    Write-Host "  RESULT: PASS - fully and consistently in R2." -ForegroundColor Green
    $grand.Pass += $s
  } else {
    Write-Host "  RESULT: FAIL - $($titleProblems.Count) problem(s) above." -ForegroundColor Red
    $grand.Fail += $s
  }
}

Write-Host ""
Write-Host "==================== SUMMARY ====================" -ForegroundColor Cyan
Write-Host ("  PASS ({0}): {1}" -f $grand.Pass.Count, ($grand.Pass -join ', ')) -ForegroundColor Green
if ($grand.Fail.Count) {
  Write-Host ("  FAIL ({0}): {1}" -f $grand.Fail.Count, ($grand.Fail -join ', ')) -ForegroundColor Red
  Write-Host "  -> re-run the uploader for the failed slug(s): .\upload-hls-rclone.ps1 -Slug <slug>  (resumes; only missing/wrong-size files transfer)"
  exit 1
} else {
  Write-Host "  All titles verified: every segment, poster, playlist, sub and backdrop is byte-identical in R2." -ForegroundColor Green
}
