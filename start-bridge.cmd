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

echo [pi-assistant] starting bridge (minimized window, log: bridge.log) ...
rem Redirect the child's stdout/stderr to bridge.log for two reasons:
rem  - when this script is started from another process, an inherited console
rem    handle would keep the parent's pipe open (parent looks "hung");
rem  - after a crash the console window is gone, so the log is the only clue.
start "pi-bridge" /min cmd /c "node bridge.js >> bridge.log 2>&1"

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
