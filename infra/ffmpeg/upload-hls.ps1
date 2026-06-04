<#
.SYNOPSIS
  Upload an existing .\hls\<slug>\ folder to R2 (no transcoding).

.EXAMPLE
  cd infra\ffmpeg
  .\upload-hls.ps1 -Slug inception
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Slug,
  [string]$R2Bucket = 'birgenai-assets'
)

$ErrorActionPreference = 'Stop'
$Out = Join-Path (Get-Location) "hls/$Slug"

if (-not (Test-Path -LiteralPath $Out -PathType Container)) {
  throw "Folder not found: $Out — copy your HLS tree here first."
}
if (-not (Get-Command wrangler -ErrorAction SilentlyContinue)) {
  throw "wrangler not installed. npm i -g wrangler ; wrangler login"
}

if (-not (Test-Path -LiteralPath "$Out/master.m3u8")) {
  Write-Warning "Missing master.m3u8 under $Out — upload may be incomplete."
}

Write-Host "-> Uploading hls/$Slug to R2 $R2Bucket as Videos/$Slug/" -ForegroundColor Cyan

Get-ChildItem -Path $Out -Recurse -File | ForEach-Object {
  $rel = $_.FullName.Substring($Out.Length + 1).Replace('\', '/')
  $key = "Videos/$Slug/$rel"
  $ct = switch -Regex ($rel) {
    '\.m3u8$' { 'application/vnd.apple.mpegurl'; break }
    '\.ts$'   { 'video/mp2t'; break }
    '\.(jpe?g)$' { 'image/jpeg'; break }
    '\.png$'  { 'image/png'; break }
    default   { 'application/octet-stream' }
  }
  Write-Host "  $key"
  & wrangler r2 object put "$R2Bucket/$key" --file=$_.FullName --content-type=$ct --remote
  if ($LASTEXITCODE -ne 0) {
    throw "wrangler failed for '$key' (exit $LASTEXITCODE). Ensure bucket exists: wrangler r2 bucket create $R2Bucket — and that your token has R2 write (Dashboard → API Tokens → R2 Storage: Edit)."
  }
}

Write-Host "OK https://<R2_PUBLIC_HOST>/Videos/$Slug/master.m3u8" -ForegroundColor Green
