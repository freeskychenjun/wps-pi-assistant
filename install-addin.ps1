# install-addin.ps1 - register the pi-assistant add-in with WPS (writes publish.xml)
#
# Usage (or just double-click install-addin.cmd):
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\install-addin.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\install-addin.ps1 -DryRun   # show plan only
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\install-addin.ps1 -Remove   # unregister
#   -Url changes the add-in address (default http://127.0.0.1:3987/addin/; dev mode: http://127.0.0.1:3889/)
#
# Behaviour: backs up publish.xml (keeps the newest 5 .bak files), merges the
#            <jspluginonline> entry idempotently, keeps other add-ins untouched,
#            writes UTF-8 without BOM so WPS can read it.
# NOTE: keep this file pure ASCII - PowerShell 5.1 reads non-BOM scripts as ANSI.

param(
    [switch]$Remove,
    [switch]$DryRun,
    [string]$Url = "http://127.0.0.1:3987/addin/"
)

$ErrorActionPreference = "Stop"
$Name = "pi-assistant"

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
Write-Host "[1/4] checking WPS add-in folder ..."
if (-not (Test-Path $dir)) {
    if ($DryRun) { Write-Host "      (dry-run) would create: $dir" }
    else { New-Item -ItemType Directory -Path $dir -Force | Out-Null; Write-Host "      created: $dir" }
} else {
    Write-Host "      exists: $dir"
}

Write-Host "[2/4] reading publish.xml ..."
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

Write-Host "[3/4] change: " -NoNewline
if ($action) { Write-Host $action } else { Write-Host "none (already up to date)" }

Write-Host "[4/4] writing ..."
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

Write-Host ""
if ($DryRun) {
    Write-Host "dry-run finished, no files changed."
} elseif ($changed) {
    Write-Host "Done. Next steps:" -ForegroundColor Green
    Write-Host "  1) make sure the bridge is running (double-click start-bridge.cmd)"
    Write-Host "  2) restart WPS Writer; on first load click OK in the 'trust this add-in?' prompt"
    Write-Host "  3) WPS now shows the 'AI assistant' tab -> click 'open sidebar'"
} else {
    Write-Host "Already up to date, nothing to do."
}
exit 0
