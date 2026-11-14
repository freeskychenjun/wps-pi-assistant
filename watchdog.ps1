# watchdog.ps1 - keep the bridge alive without ever flashing a console window.
# Registered as the action of the "WPSPiAssistantBridgeWatchdog" task (S4U, every
# minute). Probes 127.0.0.1:3987 and asks Task Scheduler to (re)start the main
# bridge task when nothing is listening. Keep this file ASCII-only.

$ErrorActionPreference = "Continue"
$dir = $PSScriptRoot
$log = Join-Path $dir "bridge-watchdog.log"

function Note([string]$msg) {
    $line = "[" + (Get-Date -Format "yyyy-MM-dd HH:mm:ss") + "] " + $msg
    try { Add-Content -LiteralPath $log -Value $line -Encoding UTF8 } catch {}
}

function Test-Bridge {
    try {
        $c = New-Object Net.Sockets.TcpClient
        $ok = $c.ConnectAsync("127.0.0.1", 3987).Wait(1200)
        try { $c.Close() } catch {}
        return $ok
    } catch {
        return $false
    }
}

if (Test-Bridge) { exit 0 }

Note "bridge not listening, restarting via scheduled task"
try {
    Start-ScheduledTask -TaskName "WPSPiAssistantBridge" -ErrorAction Stop
} catch {
    Note ("failed to start task: " + $_.Exception.Message)
    exit 1
}
exit 0
