# install-addin.ps1 - register the pi-assistant add-in with WPS (writes publish.xml)
#
# Usage (or just double-click install-addin.cmd):
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\install-addin.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\install-addin.ps1 -DryRun   # show plan only
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\install-addin.ps1 -Remove   # unregister
#   -Url changes the add-in address (default http://127.0.0.1:3987/addin/; dev mode: http://127.0.0.1:3889/)
#   -NoAutostart skips creating the logon scheduled task (default: create it)
#
# Autostart: creates the planned task "WPSPiAssistantBridge" running node.exe
#            directly (no cmd/start wrapper) under the S4U logon type, so the
#            process lives in session 0 with no console that can be closed
#            (interactive consoles die with 0xC000013A = STATUS_CONTROL_C_EXIT).
#            A per-minute watchdog task ("WPSPiAssistantBridgeWatchdog",
#            watch-bridge.cmd) restarts it if the port stops listening.
#
# Behaviour: backs up publish.xml (keeps the newest 5 .bak files), merges the
#            <jspluginonline> entry idempotently, keeps other add-ins untouched,
#            writes UTF-8 without BOM so WPS can read it.
# NOTE: keep this file pure ASCII - PowerShell 5.1 reads non-BOM scripts as ANSI.

param(
    [switch]$Remove,
    [switch]$DryRun,
    [switch]$NoAutostart,
    [string]$Url = "http://127.0.0.1:3987/addin/"
)

$ErrorActionPreference = "Stop"
$Name = "pi-assistant"
$TaskName = "WPSPiAssistantBridge"
$WatchdogName = "WPSPiAssistantBridgeWatchdog"

$dir  = Join-Path $env:APPDATA "kingsoft\wps\jsaddons"
$file = Join-Path $dir "publish.xml"

function Save-Xml($doc, [string]$path) {
    $settings = New-Object System.Xml.XmlWriterSettings
    $settings.Indent = $true
    $settings.IndentChars = "  "
    $settings.Encoding = New-Object System.Text.UTF8Encoding($false)
    $settings.OmitXmlDeclaration = $false
    $w = [System.Xml.XmlWriter]::Create($path, $settings)
    try { $doc.Save($w) } finally { $w.Close() }
}

Write-Host ""
Write-Host "[1/6] checking prerequisites ..."
$nodeExePre = $null
try { $nodeExePre = (Get-Command node -ErrorAction Stop).Source } catch {}
$piExePre = $null
try { $piExePre = (Get-Command pi -ErrorAction Stop).Source } catch {}
if ($nodeExePre) { Write-Host "      node: $nodeExePre" } else { Write-Host "      [!] node NOT found in PATH - the bridge cannot start. Install Node 22+ first." -ForegroundColor Yellow }
if ($piExePre) { Write-Host "      pi:   $piExePre" } else { Write-Host "      [!] pi NOT found in PATH - install it with: npm i -g @earendil-works/pi-coding-agent" -ForegroundColor Yellow }

Write-Host "[2/6] checking WPS add-in folder ..."
if (-not (Test-Path $dir)) {
    if ($DryRun) { Write-Host "      (dry-run) would create: $dir" }
    else { New-Item -ItemType Directory -Path $dir -Force | Out-Null; Write-Host "      created: $dir" }
} else {
    Write-Host "      exists: $dir"
}

Write-Host "[3/6] reading publish.xml ..."
$doc = New-Object System.Xml.XmlDocument
if (Test-Path $file) {
    try {
        $doc.Load($file)
    } catch {
        Write-Host "      [X] existing publish.xml cannot be parsed, nothing changed: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "          file: $file"
        exit 1
    }
    Write-Host "      loaded: $file"
} else {
    $doc.LoadXml('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><jsplugins></jsplugins>')
    Write-Host "      file not found, will create a new one"
}

$root = $doc.DocumentElement
# Use LocalName: on XmlElement PowerShell resolves ".Name" to the name ATTRIBUTE (case-insensitive).
if ($root -eq $null -or $root.LocalName -ne "jsplugins") {
    Write-Host "      [X] root element is not <jsplugins>, refusing to modify." -ForegroundColor Red
    exit 1
}

$node = $null
foreach ($n in $root.ChildNodes) {
    if ($n.NodeType -eq [System.Xml.XmlNodeType]::Element -and $n.LocalName -eq "jspluginonline" -and $n.GetAttribute("name") -eq $Name) {
        $node = $n
        break
    }
}

$changed = $false
$action = ""

if ($Remove) {
    if ($node) {
        $action = "remove registration"
        if (-not $DryRun) { [void]$root.RemoveChild($node) }
        $changed = $true
    } else {
        Write-Host "[3/4] $Name is not registered, nothing to remove."
    }
} else {
    if ($node) {
        if ($node.GetAttribute("url") -ne $Url) {
            $action = "update url to $Url"
            if (-not $DryRun) { $node.SetAttribute("url", $Url) }
            $changed = $true
        }
    } else {
        $action = "add registration (url $Url)"
        $new = $doc.CreateElement("jspluginonline")
        $new.SetAttribute("name", $Name)
        $new.SetAttribute("type", "wps")
        $new.SetAttribute("url", $Url)
        $new.SetAttribute("debug", "")
        $new.SetAttribute("enable", "enable_dev")
        $new.SetAttribute("install", "null")
        if (-not $DryRun) { [void]$root.AppendChild($new) }
        $changed = $true
    }
}

Write-Host "[4/6] change: " -NoNewline
if ($action) { Write-Host $action } else { Write-Host "none (already up to date)" }

Write-Host "[5/6] writing ..."
if (-not $changed) {
    Write-Host "      publish.xml untouched."
} elseif ($DryRun) {
    Write-Host "      (dry-run) would write: $file"
} else {
    if (Test-Path $file) {
        $bak = "$file.bak-" + (Get-Date -Format "yyyyMMdd-HHmmss")
        Copy-Item -LiteralPath $file -Destination $bak -Force
        Write-Host "      backup: $bak"
        $old = Get-ChildItem -Path $dir -Filter "publish.xml.bak-*" | Sort-Object LastWriteTime -Descending | Select-Object -Skip 5
        foreach ($o in $old) { Remove-Item -LiteralPath $o.FullName -Force -ErrorAction SilentlyContinue }
    }
    Save-Xml $doc $file
    Write-Host "      written: $file"
}


Write-Host "[6/6] autostart (logon scheduled task) ..."

$nodeExe = $null
try { $nodeExe = (Get-Command node -ErrorAction Stop).Source } catch {}
$watchdog = Join-Path $PSScriptRoot "watch-bridge.cmd"
$hasSched = $null -ne (Get-Module -ListAvailable -Name ScheduledTasks)

function Remove-TaskSafe([string]$tn) {
    $exists = $null
    try { $exists = schtasks /Query /TN $tn 2>$null } catch {}
    if (-not $exists) { return $false }
    if ($DryRun) { Write-Host "      (dry-run) would delete task: $tn"; return $true }
    schtasks /Delete /TN $tn /F | Out-Null
    Write-Host "      deleted task: $tn"
    return $true
}

if ($Remove -or $NoAutostart) {
    $null = Remove-TaskSafe $TaskName
    $null = Remove-TaskSafe $WatchdogName
} elseif (-not $nodeExe) {
    Write-Host "      [!] node not found in PATH - skipping autostart." -ForegroundColor Yellow
    Write-Host "          install Node 22+ then re-run this script (or use -NoAutostart to silence)."
} elseif (-not $hasSched) {
    Write-Host "      [!] ScheduledTasks module not available - skipping autostart." -ForegroundColor Yellow
} elseif ($DryRun) {
    Write-Host ("      (dry-run) would create task: " + $TaskName + " -> " + $nodeExe + " bridge.js (S4U, no console)")
    if (Test-Path $watchdog) {
        Write-Host ("      (dry-run) would create watchdog: " + $WatchdogName + " -> " + $watchdog + " every minute")
    }
} else {
    # main task: node.exe directly as the action (cmd/start wrappers get their child
    # tree reaped when the wrapper exits) + S4U logon type (no interactive console,
    # so no CTRL_CLOSE / 0xC000013A when the user logs off or closes a console).
    $action = New-ScheduledTaskAction -Execute $nodeExe -Argument '"bridge.js"' -WorkingDirectory $PSScriptRoot
    $trigger = New-ScheduledTaskTrigger -AtLogOn
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
    $principal = New-ScheduledTaskPrincipal -UserId ($env:USERDOMAIN + "\" + $env:USERNAME) -LogonType S4U -RunLevel Limited
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
    Write-Host "      created logon task: $TaskName (S4U, node.exe direct)"
    Write-Host "      node: $nodeExe"

    # watchdog: Task Scheduler "restart on failure" only helps when the task itself
    # reports failure; a killed node just ends. Probe the port every minute instead.
    if (Test-Path $watchdog) {
        $tr = [char]34 + $watchdog + [char]34
        schtasks /Create /F /SC MINUTE /MO 1 /RL LIMITED /TN $WatchdogName /TR $tr | Out-Null
        Write-Host "      created watchdog task: $WatchdogName (every minute)"
    } else {
        Write-Host "      [!] watch-bridge.cmd not found - no watchdog task created." -ForegroundColor Yellow
    }
    Write-Host "      (disable later: install-addin.cmd -Remove, or delete both tasks in Task Scheduler)"
}

# ---------------------------------------------------------------- self check
# An online-hosted add-in is silently skipped by WPS when the bridge is not
# listening: the ribbon.xml cannot be fetched and the tab simply never appears,
# with no error anywhere. Never let install finish with a silent failure.
if (-not $Remove) {
    $up = $false
    try {
        $c = New-Object Net.Sockets.TcpClient
        $up = $c.ConnectAsync("127.0.0.1", 3987).Wait(900)
        try { $c.Close() } catch {}
    } catch {}
    if ($up) {
        Write-Host "[7/7] bridge check: listening on 127.0.0.1:3987" -ForegroundColor Green
    } else {
        Write-Host "[7/7] bridge check: NOT listening on 127.0.0.1:3987" -ForegroundColor Yellow
        Write-Host "      WPS will silently skip this add-in (no 'AI assistant' tab, no error)." -ForegroundColor Yellow
        Write-Host "      Fix: double-click start-bridge.cmd in this folder, then open WPS." -ForegroundColor Yellow
    }
}

Write-Host ""
if ($DryRun) {
    Write-Host "dry-run finished, no files changed."
} elseif ($changed) {
    Write-Host "Done. Next steps:" -ForegroundColor Green
    Write-Host "  1) make sure the bridge is running (double-click start-bridge.cmd)"
    Write-Host "  2) fully quit WPS Writer first: Task Manager -> end EVERY wps.exe (WPS keeps"
Write-Host "     windowless helper processes; with them alive it will not reload the add-in)"
Write-Host "     then start WPS Writer; on first load click OK in the 'trust this add-in?' prompt"
    Write-Host "  3) WPS now shows the 'AI assistant' tab -> click 'open sidebar'"
} else {
    Write-Host "Already up to date, nothing to do."
}
exit 0
