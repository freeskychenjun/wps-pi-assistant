# bridge-autostart.ps1 - start the pi-assistant bridge for the logon scheduled task.
# Launched by Task Scheduler as:  powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "bridge-autostart.ps1"
#
# Why this script exists:
#  - Task Scheduler kills the whole process tree when the task's main process exits,
#    so we keep powershell alive by waiting on node (Run + wait), instead of forking and exiting.
#  - -WindowStyle Hidden suppresses the console window; node inherits that hidden console.
#  - node executable is taken from node-path.txt (written by install-addin.ps1), fallback PATH.
#  - No duplicate check: bridge.js itself exits on EADDRINUSE and logs to debug.log.
# NOTE: keep this file pure ASCII - PowerShell 5.1 reads non-BOM scripts as ANSI.

$ErrorActionPreference = "Continue"
$dir = $PSScriptRoot
$log = Join-Path $dir "tmp\autostart.log"

function Note([string]$msg) {
    try {
        New-Item -ItemType Directory -Force -Path (Join-Path $dir "tmp") | Out-Null
        Add-Content -LiteralPath $log -Value ("[" + (Get-Date -Format "yyyy-MM-dd HH:mm:ss") + "] " + $msg) -Encoding UTF8
    } catch {}
}

$bridge = Join-Path $dir "bridge.js"
$node = "node"
$nodeFile = Join-Path $dir "node-path.txt"
if (Test-Path -LiteralPath $nodeFile) {
    $v = (Get-Content -LiteralPath $nodeFile -TotalCount 1)
    if ($v) { $v = $v.Trim(); if ($v) { $node = $v } }
}

if (-not (Test-Path -LiteralPath $bridge)) { Note "bridge.js missing, abort"; exit 1 }
if (-not (Test-Path -LiteralPath $node)) {
    $cmd = Get-Command node -ErrorAction SilentlyContinue
    if ($cmd) { $node = $cmd.Source } else { Note ("node not found (tried " + $node + " and PATH), abort"); exit 1 }
}

Set-Location -LiteralPath $dir
Note ("starting bridge: " + $node + " " + $bridge)

# keep this process (and the task) alive while the bridge runs
& $node $bridge
$code = $LASTEXITCODE
Note ("bridge exited, code " + $code)
exit $code
