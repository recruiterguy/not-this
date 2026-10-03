# Builds dist/not-this-<version>.zip for store submission.
# Usage (from the repo root):  powershell -ExecutionPolicy Bypass -File scripts/package.ps1
#
# Writes entries with forward slashes. Compress-Archive in Windows PowerShell 5.1
# uses backslashes, which Firefox Add-ons rejects.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$root = Split-Path -Parent $PSScriptRoot
$manifest = Get-Content (Join-Path $root 'manifest.json') -Raw | ConvertFrom-Json
$version = $manifest.version
$dist = Join-Path $root 'dist'
New-Item -ItemType Directory -Force $dist | Out-Null
$zip = Join-Path $dist "not-this-$version.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }

$archive = [System.IO.Compression.ZipFile]::Open($zip, 'Create')
try {
  foreach ($item in @('manifest.json', 'src', 'popup', 'icons')) {
    $path = Join-Path $root $item
    $files = if (Test-Path $path -PathType Container) { Get-ChildItem $path -Recurse -File } else { Get-Item $path }
    foreach ($f in $files) {
      $name = $f.FullName.Substring($root.Length + 1).Replace('\', '/')
      [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $f.FullName, $name, 'Optimal') | Out-Null
    }
  }
} finally {
  $archive.Dispose()
}
Write-Host "Wrote $zip"
