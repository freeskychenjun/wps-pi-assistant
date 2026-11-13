# pack-release.ps1 - build a distributable zip (production files only, no node_modules)
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\pack-release.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\pack-release.ps1 -Version 0.2.2
#
# Output: dist\wps-pi-assistant-v<version>.zip
# Included: bridge.js, pi-doc-tools.js, doc-assistant-prompt.md, start-bridge.cmd,
#           watch-bridge.cmd (per-minute watchdog for the logon task),
#           install-addin.ps1/.cmd, README.md, pi-assistant production files
#           (index.html, main.js, manifest.xml, ribbon.xml, js/, ui/, images/).
# Excluded: pi-assistant\node_modules (71 MB, only needed by `wpsjs debug`),
#           package.json/package-lock.json/vite.config.js, sessions/, tmp/,
#           test fixtures, logs, bridge-config.json (may hold an API key).
# NOTE: keep this file pure ASCII - PowerShell 5.1 reads non-BOM scripts as ANSI.

param(
    [string]$Version = "",
    [string]$OutDir = "dist"
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

function Fail([string]$msg) {
    Write-Host "[X] $msg" -ForegroundColor Red
    exit 1
}

# ---- version ----
if (-not $Version) {
    $tag = ""
    try { $tag = (& git -C $root describe --tags --abbrev=0 2>$null) } catch { }
    if ($tag) {
        $Version = ($tag -replace '^v', '')
    } else {
        $Version = "0.0.0-" + (Get-Date -Format "yyyyMMdd")
    }
}
Write-Host "Release version: $Version"

# ---- staging ----
$dist = Join-Path $root $OutDir
$stage = Join-Path $dist "_stage"
if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
New-Item -ItemType Directory -Path $stage -Force | Out-Null

$files = @(
    "bridge.js",
    "pi-doc-tools.js",
    "doc-assistant-prompt.md",
    "start-bridge.cmd",
    "start-bridge.ps1",
    "install-addin.ps1",
    "watch-bridge.cmd",
    "install-addin.cmd",
    "README.md",
    "pi-assistant\index.html",
    "pi-assistant\main.js",
    "pi-assistant\manifest.xml",
    "pi-assistant\ribbon.xml"
)

$dirs = @(
    "pi-assistant\js",
    "pi-assistant\ui",
    "pi-assistant\images"
)

$count = 0
$bytes = 0

function Copy-One([string]$rel) {
    $src = Join-Path $root $rel
    if (-not (Test-Path $src)) { Fail "missing file: $rel" }
    $dst = Join-Path $stage $rel
    $parent = Split-Path $dst -Parent
    if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    Copy-Item -LiteralPath $src -Destination $dst -Force
    $script:count++
    $script:bytes += (Get-Item -LiteralPath $dst).Length
    Write-Host ("  + " + $rel)
}

Write-Host ""
Write-Host "Collecting files ..."
foreach ($f in $files) { Copy-One $f }
foreach ($d in $dirs) {
    $srcDir = Join-Path $root $d
    if (-not (Test-Path $srcDir)) { Fail "missing folder: $d" }
    Get-ChildItem -LiteralPath $srcDir -File | ForEach-Object {
        $rel = Join-Path $d $_.Name
        Copy-One $rel
    }
}

# ---- sanity checks ----
Write-Host ""
Write-Host "Sanity checks ..."
$bad = @()
foreach ($f in @("bridge.js", "pi-assistant\ui\taskpane.html", "pi-assistant\js\taskpane.js")) {
    $p = Join-Path $stage $f
    if (-not (Test-Path $p)) { $bad += $f }
}
if (Test-Path (Join-Path $stage "pi-assistant\node_modules")) { Fail "node_modules leaked into the package" }
if (Test-Path (Join-Path $stage "bridge-config.json")) { Fail "bridge-config.json leaked into the package (may contain an API key)" }
if ($bad.Count -gt 0) { Fail ("required files missing: " + ($bad -join ", ")) }

# ---- zip ----
$zip = Join-Path $dist ("wps-pi-assistant-v" + $Version + ".zip")
if (Test-Path $zip) { Remove-Item -LiteralPath $zip -Force }
Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $zip -CompressionLevel Optimal
$zipLen = (Get-Item -LiteralPath $zip).Length
Remove-Item -Recurse -Force $stage

Write-Host ""
Write-Host "OK" -ForegroundColor Green
Write-Host ("  zip    : " + $zip)
Write-Host ("  files  : " + $count + " (" + [Math]::Round($bytes / 1KB, 1) + " KB raw)")
Write-Host ("  zip size: " + [Math]::Round($zipLen / 1KB, 1) + " KB")
Write-Host ""
Write-Host "Give the zip to a colleague, they:"
Write-Host "  1) unzip it anywhere"
Write-Host "  2) double-click install-addin.cmd  (registers the add-in, starts the bridge)"
Write-Host "  3) restart WPS, trust the add-in, open the sidebar, fill in the model config"
exit 0
