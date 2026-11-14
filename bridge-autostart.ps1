# bridge-autostart.ps1 - start the bridge with no console window at all.
# Used as the action of the logon scheduled task (S4U). Keep this file ASCII-only:
# PowerShell 5.1 reads scripts as ANSI, so non-ASCII text can break parsing.
#
# Why this wrapper exists: launching node.exe directly as a task action gives the
# process a console window (Windows 11 hands it to Windows Terminal), so a terminal
# window pops up on the desktop. Creating the child with CreateNoWindow + piped
# stdio keeps everything invisible, and this wrapper stays alive (waits) so the
# task scheduler does not reap the child process tree.

$ErrorActionPreference = "Continue"
$dir = $PSScriptRoot
$log = Join-Path $dir "bridge.log"
$note = Join-Path $dir "tmp\autostart.log"

function Note([string]$msg) {
    $line = "[" + (Get-Date -Format "yyyy-MM-dd HH:mm:ss") + "] " + $msg
    try { Add-Content -LiteralPath $note -Value $line -Encoding UTF8 } catch {}
    try { Add-Content -LiteralPath $log -Value $line -Encoding UTF8 } catch {}
}

function Resolve-Node {
    $p = Join-Path $dir "node-path.txt"
    if (Test-Path $p) {
        $v = (Get-Content -LiteralPath $p -TotalCount 1).Trim()
        if ($v -and (Test-Path $v)) { return $v }
    }
    $c = Get-Command node -ErrorAction SilentlyContinue
    if ($c) { return $c.Source }
    return $null
}

$node = Resolve-Node
if (-not $node) { Note "autostart: node not found, abort."; exit 1 }
if (-not (Test-Path (Join-Path $dir "bridge.js"))) { Note "autostart: bridge.js missing, abort."; exit 1 }

Note ("autostart: starting bridge with " + $node)

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $node
$psi.Arguments = '"bridge.js"'
$psi.WorkingDirectory = $dir
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $true
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true

$proc = New-Object System.Diagnostics.Process
$proc.StartInfo = $psi
$null = $proc.Start()

$append = {
    param($sender, $e)
    if ($null -ne $e.Data) {
        try { Add-Content -LiteralPath $log -Value $e.Data -Encoding UTF8 } catch {}
    }
}
$null = Register-ObjectEvent -InputObject $proc -EventName OutputDataReceived -Action $append
$null = Register-ObjectEvent -InputObject $proc -EventName ErrorDataReceived -Action $append
$proc.BeginOutputReadLine()
$proc.BeginErrorReadLine()

# Stay alive for the lifetime of the bridge so Task Scheduler keeps the tree.
$proc.WaitForExit()
Note ("autostart: bridge exited with code " + $proc.ExitCode)
exit $proc.ExitCode
