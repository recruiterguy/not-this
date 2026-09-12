# Builds dist/not-this-<version>.zip for store submission.
# Usage (from the repo root):  powershell -ExecutionPolicy Bypass -File scripts/package.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$manifest = Get-Content (Join-Path $root 'manifest.json') -Raw | ConvertFrom-Json
$version = $manifest.version
$dist = Join-Path $root 'dist'
New-Item -ItemType Directory -Force $dist | Out-Null
$zip = Join-Path $dist "not-this-$version.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }

$staging = Join-Path $dist 'staging'
if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory -Force $staging | Out-Null
foreach ($item in @('manifest.json', 'src', 'popup', 'icons')) {
  Copy-Item (Join-Path $root $item) -Destination (Join-Path $staging $item) -Recurse
}
Compress-Archive -Path (Join-Path $staging '*') -DestinationPath $zip
Remove-Item $staging -Recurse -Force
Write-Host "Wrote $zip"
