# start-bridge.ps1 -- launch the bridge with NO visible console window.
# Pure ASCII on purpose: PowerShell 5.1 reads BOM-less .ps1 files as ANSI.
# Uses $PSScriptRoot so paths with non-ASCII characters work without passing
# them through cmd.exe.
#
# Usage:
#   start-bridge.cmd            -> hidden background start (default)
#   start-bridge.cmd -Show      -> visible console, useful for debugging

param([switch]$Show)

$dir  = $PSScriptRoot
$node = (Get-Command node -ErrorAction SilentlyContinue)
if (-not $node) { Write-Output "node-not-found"; exit 1 }

$cmdArgs = '/d /s /c "node bridge.js >> bridge.log 2>&1"'

if ($Show) {
    Start-Process -FilePath "cmd.exe" -ArgumentList $cmdArgs -WorkingDirectory $dir
    Write-Output "started (visible window)"
} else {
    # -WindowStyle Hidden creates the process with SW_HIDE: node inherits a
    # hidden console, so no window ever appears (this is what used to pop up).
    Start-Process -FilePath "cmd.exe" -ArgumentList $cmdArgs -WorkingDirectory $dir -WindowStyle Hidden
    Write-Output "started (hidden)"
}
exit 0
