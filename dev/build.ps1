# FraudShield: build a clean release zip (only the files Chrome needs).
# Run from the project root:  npm run build
# Output: dist/FraudShield-vX.Y.zip (dist/ is ignored by git).

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$version = (Get-Content manifest.json -Raw | ConvertFrom-Json).version
$name = "FraudShield-v$version"
$zip = Join-Path $root "dist\$name.zip"

# Tracked files only, minus developer files.
$skip = '^(dev/|dist/|site/|submission/|\.gitignore$|package\.json$|README\.md$|CHANGELOG\.md$)'
$files = git ls-files | Where-Object { $_ -notmatch $skip }
if (-not ($files -contains "manifest.json")) { throw "manifest.json missing" }

New-Item -ItemType Directory -Force (Join-Path $root "dist") | Out-Null
if (Test-Path $zip) { Remove-Item $zip -Force }

# Write entries with forward slashes (Compress-Archive in PowerShell 5 uses
# backslashes, which break the zip on macOS, Linux and the Chrome Web Store).
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::Open($zip, "Create")
try {
  foreach ($f in $files) {
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
      $archive, (Join-Path $root $f), $f, "Optimal") | Out-Null
  }
} finally {
  $archive.Dispose()
}

$kb = [math]::Round((Get-Item $zip).Length / 1KB)
Write-Host "Built dist\$name.zip ($($files.Count) files, $kb KB)"
