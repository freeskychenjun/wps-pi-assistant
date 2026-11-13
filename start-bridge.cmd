@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
    echo.
    echo [pi-assistant] Node.js not found in PATH.
    echo                Install Node 22+ from https://nodejs.org/ and run this again.
    echo                Then re-run install-addin.cmd so the autostart task uses the right path.
    echo.
    pause
    exit /b 1
)

call :probe
if not errorlevel 1 (
    echo [pi-assistant] bridge already running on 127.0.0.1:3987
    exit /b 0
)

echo [pi-assistant] starting bridge in the background (no window, log: bridge.log) ...
rem The bridge must not own a visible console:
rem  - a console window would pop up on every start (and on every watchdog restart);
rem  - when this script is called from another process, an inherited console handle
rem    keeps the parent's pipe open (parent looks "hung").
rem start-bridge.ps1 does Start-Process -WindowStyle Hidden, so node gets a hidden
rem console. Its stdout/stderr go to bridge.log (the only clue after a crash).
rem Need to see the live output?  start-bridge.cmd -Show
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-bridge.ps1" %*
if errorlevel 1 (
    echo.
    echo [pi-assistant] could not launch the background starter start-bridge.ps1.
    echo                Run it directly in PowerShell to see the reason:
    echo                  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-bridge.ps1" -Show
    echo.
    pause
    exit /b 1
)

for /l %%i in (1,1,15) do (
    ping -n 1 -w 400 127.0.0.1 >nul
    call :probe
    if not errorlevel 1 goto :ok
)

echo.
echo [pi-assistant] FAILED: nothing is listening on 127.0.0.1:3987.
echo                Open a terminal in this folder and run:  node bridge.js
echo                to see the real error. Common causes:
echo                  - port 3987 is held by a broken/old instance (kill node.exe, retry)
echo                  - Node.js is too old (need 22+)
echo                  - the folder is read-only / blocked by antivirus
echo.
pause
exit /b 1

:ok
echo [pi-assistant] bridge started on 127.0.0.1:3987
echo                Now open WPS Writer; the "AI assistant" tab should appear.
exit /b 0

:probe
node -e "var n=require('net');var s=n.connect(3987,'127.0.0.1');s.on('connect',function(){s.destroy();process.exit(0)});s.on('error',function(){process.exit(1)});s.setTimeout(1200,function(){s.destroy();process.exit(1)})" >nul 2>&1
exit /b %errorlevel%
